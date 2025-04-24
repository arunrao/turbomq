import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { DbAdapter, Job, JobOptions, JobStatus } from '../types';

/**
 * PostgreSQL adapter for the Next.js job queue system.
 * Works with both local PostgreSQL instances and Neon (which requires SSL).
 */
export class PostgresAdapter implements DbAdapter {
  private prisma: PrismaClient;
  private connected = false;
  private staleJobThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Create a new PostgreSQL adapter.
   * @param options Optional configuration options
   */
  constructor(options?: {
    connectionString?: string;
    ssl?: boolean;
    staleJobThresholdMs?: number;
  }) {
    // Configure Prisma client with connection options
    const prismaOptions: any = {};
    
    // Use provided connection string or fall back to DATABASE_URL
    if (options?.connectionString) {
      prismaOptions.datasources = {
        db: {
          url: options.connectionString,
        },
      };
    }

    // Detect if we're using a non-local PostgreSQL service (which typically requires SSL)
    const connectionUrl = options?.connectionString || process.env.DATABASE_URL || '';
    const isLocalhost = connectionUrl.includes('localhost') || 
                      connectionUrl.includes('127.0.0.1');
    // Enable SSL for any non-local connection unless explicitly disabled
    const needsSSL = options?.ssl !== false && !isLocalhost;
    
    // Add SSL configuration if needed
    if (needsSSL && prismaOptions.datasources?.db?.url) {
      // Only add sslmode if not already present
      if (!prismaOptions.datasources.db.url.includes('sslmode=')) {
        prismaOptions.datasources.db.url += prismaOptions.datasources.db.url.includes('?') 
          ? '&sslmode=require' 
          : '?sslmode=require';
      }
    }

    // Initialize Prisma client with options
    this.prisma = new PrismaClient(prismaOptions);
    
    // Set stale job threshold if provided
    if (options?.staleJobThresholdMs) {
      this.staleJobThreshold = options.staleJobThresholdMs;
    }
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.prisma.$connect();
      this.connected = true;
      
      // Log connection info but hide sensitive details
      const datasource = this.prisma._engineConfig?.datasources?.find((ds: { name: string; url: string }) => ds.name === 'db');
      if (datasource) {
        const url = new URL(datasource.url);
        console.log(`Connected to PostgreSQL database at ${url.host}${url.pathname}`);
      } else {
        console.log('Connected to PostgreSQL database');
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.prisma.$disconnect();
      this.connected = false;
      console.log('Disconnected from PostgreSQL database');
    }
  }

  async createJob(
    taskName: string,
    payload: any,
    options?: JobOptions
  ): Promise<Job> {
    const now = new Date();
    
    const job = await this.prisma.job.create({
      data: {
        taskName,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority: options?.priority || 0,
        runAt: options?.runAt || now,
        maxAttempts: options?.maxAttempts || 3,
        createdAt: now,
        updatedAt: now,
      },
    });

    return this.mapDbJobToJob(job);
  }

  async fetchNextJob(
    workerId: string,
    availableTasks: string[]
  ): Promise<Job | null> {
    // Start a transaction to ensure job claiming is atomic
    return await this.prisma.$transaction(async (tx: PrismaClient) => {
      // Find the next available job
      const job = await tx.job.findFirst({
        where: {
          status: 'pending',
          taskName: { in: availableTasks },
          runAt: { lte: new Date() },
          OR: [
            { workerId: null },
            { 
              workerId: { not: null },
              lastHeartbeat: { lte: new Date(Date.now() - this.staleJobThreshold) }
            }
          ]
        },
        orderBy: [
          { priority: 'desc' },
          { runAt: 'asc' },
          { createdAt: 'asc' }
        ],
      });

      if (!job) return null;

      // Update the job to mark it as claimed by this worker
      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'running',
          workerId,
          lastHeartbeat: new Date(),
          attemptsMade: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      return this.mapDbJobToJob(updatedJob);
    });
  }

  async fetchNextBatch(
    workerId: string,
    availableTasks: string[],
    batchSize = 5
  ): Promise<Job[]> {
    const jobs: Job[] = [];
    
    // Use transaction to ensure atomic batch claiming
    await this.prisma.$transaction(async (tx: PrismaClient) => {
      // Find batch of jobs
      const dbJobs = await tx.job.findMany({
        where: {
          status: 'pending',
          taskName: { in: availableTasks },
          runAt: { lte: new Date() },
          OR: [
            { workerId: null },
            { 
              workerId: { not: null },
              lastHeartbeat: { lte: new Date(Date.now() - this.staleJobThreshold) }
            }
          ]
        },
        orderBy: [
          { priority: 'desc' },
          { runAt: 'asc' },
          { createdAt: 'asc' }
        ],
        take: batchSize,
      });

      // Update all jobs in batch
      for (const job of dbJobs) {
        const updatedJob = await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'running',
            workerId,
            lastHeartbeat: new Date(),
            attemptsMade: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        
        jobs.push(this.mapDbJobToJob(updatedJob));
      }
    });

    return jobs;
  }

  async completeJob(jobId: string, resultKey?: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        resultKey,
        workerId: null, // Release the job from the worker
      },
    });
  }

  async failJob(jobId: string, error: Error): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const shouldRetry = job.attemptsMade < job.maxAttempts;
    
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: shouldRetry ? 'pending' : 'failed',
        lastError: error.message || String(error),
        updatedAt: new Date(),
        workerId: null, // Release the job from the worker
        // If retrying, schedule for later with exponential backoff
        ...(shouldRetry && {
          runAt: new Date(Date.now() + Math.pow(2, job.attemptsMade) * 1000),
        }),
      },
    });
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        progress: Math.max(0, Math.min(100, progress)), // Ensure progress is between 0-100
        updatedAt: new Date(),
        lastHeartbeat: new Date(),
      },
    });
  }

  async updateJobsBatch(
    updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>
  ): Promise<void> {
    await this.prisma.$transaction(
      updates.map((update) => {
        return this.prisma.job.update({
          where: { id: update.jobId },
          data: {
            ...(update.status && { status: update.status }),
            ...(update.progress !== undefined && { 
              progress: Math.max(0, Math.min(100, update.progress)) 
            }),
            updatedAt: new Date(),
            lastHeartbeat: new Date(),
          },
        });
      })
    );
  }

  async heartbeat(workerId: string, jobId?: string): Promise<void> {
    const now = new Date();
    
    // Update worker heartbeat
    await this.prisma.workerHeartbeat.upsert({
      where: { workerId },
      update: {
        lastSeen: now,
        currentJob: jobId,
      },
      create: {
        workerId,
        lastSeen: now,
        currentJob: jobId,
      },
    });

    // If jobId is provided, update job heartbeat too
    if (jobId) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          lastHeartbeat: now,
        },
      });
    }
  }

  async getJobById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) return null;
    
    return this.mapDbJobToJob(job);
  }

  async listJobs(
    filter?: { status?: JobStatus; taskName?: string }
  ): Promise<Job[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        ...(filter?.status && { status: filter.status }),
        ...(filter?.taskName && { taskName: filter.taskName }),
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    return jobs.map(this.mapDbJobToJob);
  }

  async cleanupStaleJobs(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.staleJobThreshold);
    
    const result = await this.prisma.job.updateMany({
      where: {
        status: 'running',
        lastHeartbeat: { lt: staleThreshold },
      },
      data: {
        status: 'pending',
        workerId: null,
      },
    });

    return result.count;
  }

  async storeResult(jobId: string, result: any): Promise<string> {
    const resultKey = `result-${jobId}-${uuidv4()}`;
    
    await this.prisma.jobResult.create({
      data: {
        key: resultKey,
        jobId,
        result: JSON.stringify(result),
      },
    });

    return resultKey;
  }

  async getResult(resultKey: string): Promise<any> {
    const result = await this.prisma.jobResult.findUnique({
      where: { key: resultKey },
    });

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.result);
    } catch (error) {
      console.error(`Error parsing result for key ${resultKey}:`, error);
      return result.result;
    }
  }

  async getQueueStats(): Promise<{
    pendingCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    const [pending, running, completed, failed] = await Promise.all([
      this.prisma.job.count({ where: { status: 'pending' } }),
      this.prisma.job.count({ where: { status: 'running' } }),
      this.prisma.job.count({ where: { status: 'completed' } }),
      this.prisma.job.count({ where: { status: 'failed' } }),
    ]);

    return {
      pendingCount: pending,
      runningCount: running,
      completedCount: completed,
      failedCount: failed,
    };
  }

  // Helper method to convert database job to Job interface
  private mapDbJobToJob(dbJob: any): Job {
    return {
      id: dbJob.id,
      taskName: dbJob.taskName,
      payload: JSON.parse(dbJob.payload),
      status: dbJob.status as JobStatus,
      priority: dbJob.priority,
      runAt: dbJob.runAt,
      attemptsMade: dbJob.attemptsMade,
      maxAttempts: dbJob.maxAttempts,
      lastError: dbJob.lastError || undefined,
      createdAt: dbJob.createdAt,
      updatedAt: dbJob.updatedAt,
      completedAt: dbJob.completedAt || undefined,
      resultKey: dbJob.resultKey || undefined,
      progress: dbJob.progress !== null ? dbJob.progress : undefined,
    };
  }
}
