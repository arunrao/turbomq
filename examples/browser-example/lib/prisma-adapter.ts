import { PrismaClient } from '@prisma/client';
import { DbAdapter, Job, JobStatus, JobOptions } from '../../../src/types';

export class PrismaAdapter implements DbAdapter {
  private prisma: PrismaClient;
  private connected = false;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async init(): Promise<void> {
    if (!this.connected) {
      await this.prisma.$connect();
      this.connected = true;
    }
  }

  async shutdown(): Promise<void> {
    if (this.connected) {
      await this.prisma.$disconnect();
      this.connected = false;
    }
  }

  // Required interface methods
  async connect(): Promise<void> {
    await this.init();
  }

  async disconnect(): Promise<void> {
    await this.shutdown();
  }

  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    const job = await this.prisma.job.create({
      data: {
        taskName,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority: options?.priority || 0,
        runAt: options?.runAt || new Date(),
        maxAttempts: options?.maxAttempts || 3,
        webhookUrl: options?.webhookUrl,
        webhookHeaders: options?.webhookHeaders ? JSON.stringify(options.webhookHeaders) : null
      }
    });

    return this.mapDbJobToJob(job);
  }

  async fetchNextJob(): Promise<Job | null> {
    const job = await this.prisma.job.findFirst({
      where: {
        status: 'pending',
        runAt: { lte: new Date() }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    if (!job) return null;
    return this.mapDbJobToJob(job);
  }

  async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 10): Promise<Job[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        status: 'pending',
        runAt: { lte: new Date() },
        taskName: { in: availableTasks }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      take: batchSize
    });

    // Update worker ID for fetched jobs
    await this.prisma.job.updateMany({
      where: {
        id: { in: jobs.map(j => j.id) }
      },
      data: {
        workerId,
        status: 'running',
        updatedAt: new Date()
      }
    });

    return jobs.map(this.mapDbJobToJob);
  }

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        lastError: error,
        updatedAt: new Date(),
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined
      }
    });
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        progress: Math.max(0, Math.min(100, progress)),
        updatedAt: new Date()
      }
    });
  }

  async storeJobResult(jobId: string, result: any): Promise<string> {
    const resultKey = `result_${jobId}_${Date.now()}`;
    await this.prisma.jobResult.create({
      data: {
        key: resultKey,
        jobId,
        result: JSON.stringify(result)
      }
    });
    return resultKey;
  }

  async getJobById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId }
    });

    if (!job) return null;
    return this.mapDbJobToJob(job);
  }

  async getJobResult(resultKey: string): Promise<any> {
    const result = await this.prisma.jobResult.findUnique({
      where: { key: resultKey }
    });

    if (!result) return null;
    return JSON.parse(result.result);
  }

  async listJobs(filter?: { status?: JobStatus; taskName?: string }): Promise<Job[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        ...(filter?.status && { status: filter.status }),
        ...(filter?.taskName && { taskName: filter.taskName })
      },
      orderBy: [{ createdAt: 'desc' }]
    });

    return jobs.map(this.mapDbJobToJob);
  }

  async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }> {
    const [pending, running, completed, failed] = await Promise.all([
      this.prisma.job.count({ where: { status: 'pending' } }),
      this.prisma.job.count({ where: { status: 'running' } }),
      this.prisma.job.count({ where: { status: 'completed' } }),
      this.prisma.job.count({ where: { status: 'failed' } })
    ]);

    return { pendingCount: pending, runningCount: running, completedCount: completed, failedCount: failed };
  }

  async completeJob(jobId: string, result: any): Promise<void> {
    const resultKey = await this.storeJobResult(jobId, result);
    await this.updateJobStatus(jobId, 'completed');
    await this.prisma.job.update({
      where: { id: jobId },
      data: { resultKey }
    });
  }

  async failJob(jobId: string, error: Error): Promise<void> {
    await this.updateJobStatus(jobId, 'failed', error.message);
  }

  async updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void> {
    await this.prisma.$transaction(
      updates.map(update => 
        this.prisma.job.update({
          where: { id: update.jobId },
          data: {
            ...(update.status && { status: update.status }),
            ...(update.progress !== undefined && { progress: Math.max(0, Math.min(100, update.progress)) }),
            updatedAt: new Date()
          }
        })
      )
    );
  }

  async cleanupCompletedJobs(maxAge: number): Promise<void> {
    const cutoffDate = new Date(Date.now() - maxAge);
    await this.prisma.job.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        updatedAt: { lt: cutoffDate }
      }
    });
  }

  async cleanupStaleJobs(): Promise<number> {
    const cutoffDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    const result = await this.prisma.job.updateMany({
      where: {
        status: 'running',
        updatedAt: { lt: cutoffDate }
      },
      data: {
        status: 'failed',
        lastError: 'Job timed out',
        updatedAt: new Date()
      }
    });
    return result.count;
  }

  async heartbeat(workerId: string, jobId?: string): Promise<void> {
    await this.prisma.workerHeartbeat.upsert({
      where: { workerId },
      create: {
        workerId,
        currentJob: jobId,
        lastSeen: new Date()
      },
      update: {
        currentJob: jobId,
        lastSeen: new Date()
      }
    });
  }

  async storeResult(jobId: string, result: any): Promise<string> {
    const resultKey = `result_${jobId}_${Date.now()}`;
    await this.prisma.jobResult.create({
      data: {
        key: resultKey,
        jobId,
        result: JSON.stringify(result)
      }
    });
    return resultKey;
  }

  async getResult(key: string): Promise<any> {
    const result = await this.prisma.jobResult.findUnique({
      where: { key }
    });

    if (!result) return null;
    return JSON.parse(result.result);
  }

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
      progress: dbJob.progress || undefined,
      webhookUrl: dbJob.webhookUrl || undefined,
      webhookHeaders: dbJob.webhookHeaders ? JSON.parse(dbJob.webhookHeaders) : undefined
    };
  }
} 