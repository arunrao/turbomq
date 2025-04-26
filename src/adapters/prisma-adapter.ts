import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { DbAdapter, Job, JobOptions, JobStatus } from '../types';
import { ScheduledJob, ScheduledJobFilter } from '../types/scheduler.js';

export class PrismaAdapter implements DbAdapter {
  private prisma: PrismaClient;
  private connected = false;
  private staleJobThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.prisma.$connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.prisma.$disconnect();
      this.connected = false;
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
        webhookUrl: options?.webhookUrl,
        webhookHeaders: options?.webhookHeaders ? JSON.stringify(options.webhookHeaders) : null,
      },
    });

    return this.mapDbJobToJob(job);
  }

  async fetchNextJob(
    workerId: string,
    availableTasks: string[]
  ): Promise<Job | null> {
    // Start a transaction to ensure job claiming is atomic
    return await this.prisma.$transaction(async (tx) => {
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
    await this.prisma.$transaction(async (tx) => {
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

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        lastError: error,
        updatedAt: new Date(),
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      },
    });
  }

  async updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void> {
    // Use a transaction to ensure all updates are atomic
    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.job.update({
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
      }
    });
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
    scheduledJobsCount?: number;
  }> {
    try {
      // Get counts for regular jobs
      const [pending, running, completed, failed] = await Promise.all([
        this.prisma.job.count({ where: { status: 'pending' } }),
        this.prisma.job.count({ where: { status: 'running' } }),
        this.prisma.job.count({ where: { status: 'completed' } }),
        this.prisma.job.count({ where: { status: 'failed' } }),
      ]);
      
      // Try to get scheduled job count, but handle case when table doesn't exist
      let scheduled = 0;
      try {
        // Only attempt this if the scheduledJob model exists
        if ((this.prisma as any).scheduledJob) {
          scheduled = await (this.prisma as any).scheduledJob.count({ 
            where: { status: 'scheduled' } 
          });
        }
      } catch (error) {
        // If table doesn't exist or any other error, just use 0
        scheduled = 0;
      }

      return {
        pendingCount: pending,
        runningCount: running,
        completedCount: completed,
        failedCount: failed,
        scheduledJobsCount: scheduled,
      };
    } catch (error) {
      // If something goes wrong, return zeros
      return {
        pendingCount: 0,
        runningCount: 0,
        completedCount: 0,
        failedCount: 0,
        scheduledJobsCount: 0,
      };
    }
  }

  async removeJobsByStatus(
    status: JobStatus,
    options?: { taskName?: string; beforeDate?: Date; limit?: number }
  ): Promise<number> {
    // Create the query parameters
    const queryParams: any = {
      where: {
        status,
        ...(options?.taskName && { taskName: options.taskName }),
        ...(options?.beforeDate && { createdAt: { lt: options.beforeDate } }),
      }
    };
    
    // Add take parameter if limit is specified
    if (options?.limit) {
      queryParams.take = options.limit;
    }
    
    const result = await this.prisma.job.deleteMany(queryParams);
    return result.count;
  }

  async getDetailedJobInfo(options?: {
    status?: JobStatus;
    taskName?: string;
    limit?: number;
    offset?: number;
    includeResults?: boolean;
    includeErrors?: boolean;
    includeProgress?: boolean;
  }): Promise<{
    jobs: Job[];
    total: number;
    stats: {
      byStatus: Record<string, number>;
      byTask: Record<string, number>;
      averageProcessingTime?: number;
      successRate?: number;
    };
  }> {
    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where: {
          ...(options?.status && { status: options.status }),
          ...(options?.taskName && { taskName: options.taskName }),
        },
        ...(options?.limit && { take: options.limit }),
        ...(options?.offset && { skip: options.offset }),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.job.count({
        where: {
          ...(options?.status && { status: options.status }),
          ...(options?.taskName && { taskName: options.taskName }),
        },
      }),
    ]);

    const stats = await this.prisma.job.groupBy({
      by: ['status', 'taskName'],
      _count: true,
    });

    const byStatus: Record<string, number> = {};
    const byTask: Record<string, number> = {};

    stats.forEach((stat: { status: string; taskName: string; _count: number }) => {
      byStatus[stat.status] = (byStatus[stat.status] || 0) + stat._count;
      byTask[stat.taskName] = (byTask[stat.taskName] || 0) + stat._count;
    });

    return {
      jobs: jobs.map(this.mapDbJobToJob),
      total,
      stats: {
        byStatus,
        byTask,
      },
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
      webhookUrl: dbJob.webhookUrl || undefined,
      webhookHeaders: dbJob.webhookHeaders ? JSON.parse(dbJob.webhookHeaders) : undefined,
      retries: dbJob.attemptsMade || 0
    };
  }

  // Scheduled Job Methods

  /**
   * Create a new scheduled job
   */
  async createScheduledJob(job: ScheduledJob): Promise<ScheduledJob> {
    const dbJob = await (this.prisma as any).scheduledJob.create({
      data: {
        id: job.id,
        taskName: job.taskName,
        payload: JSON.stringify(job.payload),
        type: job.type,
        status: job.status,
        runAt: job.runAt,
        pattern: job.pattern,
        startDate: job.startDate,
        endDate: job.endDate,
        lastRunAt: job.lastRunAt,
        nextRunAt: job.nextRunAt,
        priority: job.priority || 0,
        maxAttempts: job.maxAttempts || 3,
        webhookUrl: job.webhookUrl,
        webhookHeaders: job.webhookHeaders ? JSON.stringify(job.webhookHeaders) : null,
        metadata: job.metadata ? JSON.stringify(job.metadata) : null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }
    });

    return this.mapDbScheduledJobToScheduledJob(dbJob);
  }

  /**
   * Get a scheduled job by ID
   */
  async getScheduledJobById(id: string): Promise<ScheduledJob | null> {
    const job = await (this.prisma as any).scheduledJob.findUnique({
      where: { id }
    });

    if (!job) {
      return null;
    }

    return this.mapDbScheduledJobToScheduledJob(job);
  }

  /**
   * List scheduled jobs with optional filtering
   */
  async listScheduledJobs(filter?: ScheduledJobFilter): Promise<ScheduledJob[]> {
    const where: any = {};

    if (filter) {
      if (filter.status) {
        where.status = filter.status;
      }
      if (filter.type) {
        where.type = filter.type;
      }
      if (filter.taskName) {
        where.taskName = filter.taskName;
      }
      if (filter.startDate) {
        where.startDate = { gte: filter.startDate };
      }
      if (filter.endDate) {
        where.endDate = { lte: filter.endDate };
      }
      if (filter.nextRunBefore) {
        where.nextRunAt = { lte: filter.nextRunBefore };
      }
    }

    const jobs = await (this.prisma as any).scheduledJob.findMany({
      where,
      orderBy: [
        { nextRunAt: 'asc' },
        { createdAt: 'desc' }
      ],
      ...(filter?.limit && { take: filter.limit }),
      ...(filter?.offset && { skip: filter.offset })
    });

    return jobs.map((job: any) => this.mapDbScheduledJobToScheduledJob(job));
  }

  /**
   * Update a scheduled job
   */
  async updateScheduledJob(id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob> {
    // Remove id from updates if present
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: idToRemove, ...updateData } = updates;

    // Handle JSON stringification for objects
    const data: any = { ...updateData };
    if (data.payload) {
      data.payload = JSON.stringify(data.payload);
    }
    if (data.webhookHeaders) {
      data.webhookHeaders = JSON.stringify(data.webhookHeaders);
    }
    if (data.metadata) {
      data.metadata = JSON.stringify(data.metadata);
    }

    const updatedJob = await (this.prisma as any).scheduledJob.update({
      where: { id },
      data
    });

    return this.mapDbScheduledJobToScheduledJob(updatedJob);
  }

  /**
   * Delete a scheduled job
   */
  async deleteScheduledJob(id: string): Promise<void> {
    await (this.prisma as any).scheduledJob.delete({
      where: { id }
    });
  }

  /**
   * Get scheduled jobs that need to be executed
   */
  async getScheduledJobsToRun(now: Date): Promise<ScheduledJob[]> {
    const jobs = await (this.prisma as any).scheduledJob.findMany({
      where: {
        status: 'scheduled',
        OR: [
          // One-time jobs that are due
          {
            type: 'one-time',
            runAt: { lte: now }
          },
          // Recurring jobs that are due
          {
            type: 'recurring',
            nextRunAt: { lte: now }
          }
        ]
      },
      orderBy: [
        { priority: 'desc' },
        { nextRunAt: 'asc' },
        { runAt: 'asc' }
      ]
    });

    return jobs.map((job: any) => this.mapDbScheduledJobToScheduledJob(job));
  }

  /**
   * Helper method to convert database scheduled job to ScheduledJob interface
   */
  private mapDbScheduledJobToScheduledJob(dbJob: any): ScheduledJob {
    return {
      id: dbJob.id,
      taskName: dbJob.taskName,
      payload: JSON.parse(dbJob.payload),
      type: dbJob.type,
      status: dbJob.status,
      runAt: dbJob.runAt || undefined,
      pattern: dbJob.pattern || undefined,
      startDate: dbJob.startDate || undefined,
      endDate: dbJob.endDate || undefined,
      lastRunAt: dbJob.lastRunAt || undefined,
      nextRunAt: dbJob.nextRunAt || undefined,
      priority: dbJob.priority,
      maxAttempts: dbJob.maxAttempts,
      webhookUrl: dbJob.webhookUrl || undefined,
      webhookHeaders: dbJob.webhookHeaders ? JSON.parse(dbJob.webhookHeaders) : undefined,
      metadata: dbJob.metadata ? JSON.parse(dbJob.metadata) : undefined,
      createdAt: dbJob.createdAt,
      updatedAt: dbJob.updatedAt
    };
  }
}
