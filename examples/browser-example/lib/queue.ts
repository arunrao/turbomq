import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createQueue as createQueueFromLib } from '../../../src/index.js';
import { JobRegistry } from '../../../src/job-registry.js';
import { projectJobTypes } from './job-types.js';
import { Job, JobStatus, JobHandler, JobHelpers, JobOptions, DbAdapter } from '../../../src/types';

// PrismaAdapter class for database operations
export class PrismaAdapter implements DbAdapter {
  private prisma: PrismaClient;
  private connected = false;

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

  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    const now = new Date();
    const job = await this.prisma.job.create({
      data: {
        taskName,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority: options?.priority ?? 0,
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

  async fetchNextJob(workerId: string, availableTasks: string[]): Promise<Job | null> {
    const job = await this.prisma.job.findFirst({
      where: {
        status: 'pending',
        taskName: { in: availableTasks },
        runAt: { lte: new Date() },
      },
      orderBy: [
        { priority: 'desc' },
        { runAt: 'asc' },
        { createdAt: 'asc' }
      ],
    });
    if (!job) return null;
    const updatedJob = await this.prisma.job.update({
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
  }

  async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 5): Promise<Job[]> {
    const jobs: Job[] = [];
    const dbJobs = await this.prisma.job.findMany({
      where: {
        status: 'pending',
        taskName: { in: availableTasks },
        runAt: { lte: new Date() },
      },
      orderBy: [
        { priority: 'desc' },
        { runAt: 'asc' },
        { createdAt: 'asc' }
      ],
      take: batchSize,
    });
    for (const job of dbJobs) {
      const updatedJob = await this.prisma.job.update({
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
        workerId: null,
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
    if (job.attemptsMade >= job.maxAttempts) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          lastError: error.message,
          updatedAt: new Date(),
          workerId: null,
        },
      });
    } else {
      const backoffMinutes = Math.pow(2, job.attemptsMade);
      const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          lastError: error.message,
          updatedAt: new Date(),
          runAt: nextRunAt,
          workerId: null,
        },
      });
    }
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const normalizedProgress = Math.max(0, Math.min(100, progress));
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        progress: normalizedProgress,
        updatedAt: new Date(),
      },
    });
  }

  async getJobById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) return null;
    return this.mapDbJobToJob(job);
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
    if (!result) return null;
    try {
      return JSON.parse(result.result);
    } catch (error) {
      console.error(`Error parsing result for key ${resultKey}:`, error);
      return result.result;
    }
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
      progress: dbJob.progress !== null ? dbJob.progress : undefined,
      webhookUrl: dbJob.webhookUrl || undefined,
      webhookHeaders: dbJob.webhookHeaders ? JSON.parse(dbJob.webhookHeaders) : undefined,
      retries: dbJob.attemptsMade || 0
    };
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

  async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }> {
    const [pending, running, completed, failed] = await Promise.all([
      this.prisma.job.count({ where: { status: 'pending' } }),
      this.prisma.job.count({ where: { status: 'running' } }),
      this.prisma.job.count({ where: { status: 'completed' } }),
      this.prisma.job.count({ where: { status: 'failed' } })
    ]);
    return { pendingCount: pending, runningCount: running, completedCount: completed, failedCount: failed };
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

  async removeJobsByStatus(
    status: JobStatus,
    options?: { taskName?: string; beforeDate?: Date; limit?: number }
  ): Promise<number> {
    // Note: Prisma's deleteMany doesn't support limiting the number of records to delete
    // If a limit is specified, we'll first find the IDs of jobs to delete
    if (options?.limit) {
      const jobsToDelete = await this.prisma.job.findMany({
        where: {
          status,
          ...(options?.taskName && { taskName: options.taskName }),
          ...(options?.beforeDate && { createdAt: { lt: options.beforeDate } }),
        },
        take: options.limit,
        select: { id: true },
      });

      const result = await this.prisma.job.deleteMany({
        where: {
          id: { in: jobsToDelete.map(job => job.id) },
        },
      });
      return result.count;
    }

    // If no limit is specified, delete all matching jobs
    const result = await this.prisma.job.deleteMany({
      where: {
        status,
        ...(options?.taskName && { taskName: options.taskName }),
        ...(options?.beforeDate && { createdAt: { lt: options.beforeDate } }),
      },
    });
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
    const [jobs, total, stats] = await Promise.all([
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
      this.prisma.job.groupBy({
        by: ['status', 'taskName'],
        _count: true,
      }),
    ]);

    const byStatus: Record<string, number> = {};
    const byTask: Record<string, number> = {};

    stats.forEach((stat: { status: string; taskName: string; _count: number }) => {
      byStatus[stat.status] = (byStatus[stat.status] || 0) + stat._count;
      byTask[stat.taskName] = (byTask[stat.taskName] || 0) + stat._count;
    });

    return {
      jobs: jobs.map(this.mapDbJobToJob),
      total,
      stats: { byStatus, byTask },
    };
  }
}

// Event manager for job events
export class EventManager {
  private listeners: Record<string, ((...args: any[]) => void)[]> = {
    jobCreated: [],
    jobCompleted: [],
    jobFailed: [],
    jobProgress: [],
  };

  onJobCreated(listener: (job: Job) => void): void {
    this.listeners.jobCreated.push(listener);
  }

  onJobCompleted(listener: (job: Job) => void): void {
    this.listeners.jobCompleted.push(listener);
  }

  onJobFailed(listener: (job: Job, error: Error) => void): void {
    this.listeners.jobFailed.push(listener);
  }

  onJobProgress(listener: (job: Job, progress: number) => void): void {
    this.listeners.jobProgress.push(listener);
  }

  emitJobCreated(job: Job): void {
    this.listeners.jobCreated.forEach((listener) => listener(job));
  }

  emitJobCompleted(job: Job): void {
    this.listeners.jobCompleted.forEach((listener) => listener(job));
  }

  emitJobFailed(job: Job, error: Error): void {
    this.listeners.jobFailed.forEach((listener) => listener(job, error));
  }

  emitJobProgress(job: Job, progress: number): void {
    this.listeners.jobProgress.forEach((listener) => listener(job, progress));
  }
}

// Webhook service for sending notifications
export class WebhookService {
  static async sendNotification(job: Job, result?: any): Promise<boolean> {
    if (!job.webhookUrl) return false;

    try {
      const response = await fetch(job.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook': 'true'
        },
        body: JSON.stringify({
          jobId: job.id,
          status: job.status,
          result
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
      return false;
    }
  }

  static async sendWithRetry(
    job: Job, 
    result?: any, 
    maxRetries = 3, 
    initialDelay = 1000
  ): Promise<boolean> {
    let retries = 0;
    let delay = initialDelay;

    while (retries <= maxRetries) {
      const success = await this.sendNotification(job, result);
      
      if (success) {
        return true;
      }

      if (retries === maxRetries) {
        console.error(`Webhook for job ${job.id} failed after ${maxRetries} retries`);
        return false;
      }

      delay = delay * 2 + Math.floor(Math.random() * 1000);
      console.log(`Retrying webhook for job ${job.id} in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      retries++;
    }

    return false;
  }
}

// Queue class for managing jobs
export class Queue {
  private handlers: Map<string, JobHandler> = new Map();
  private events: EventManager;
  private activeJobs: Set<string> = new Set();
  private jobHandlers: Map<string, { abortController: AbortController; cleanup?: () => Promise<void> }> = new Map();
  
  constructor(private db: DbAdapter) {
    this.events = new EventManager();
  }

  async init(): Promise<void> {
    await this.db.connect();
  }

  async shutdown(): Promise<void> {
    await this.db.disconnect();
  }

  registerTask(taskName: string, handler: JobHandler): void {
    this.handlers.set(taskName, handler);
  }

  async addJob(
    taskName: string, 
    payload: any, 
    options?: JobOptions
  ): Promise<Job> {
    if (!this.handlers.has(taskName)) {
      throw new Error(`No handler registered for task: ${taskName}`);
    }

    const job = await this.db.createJob(taskName, payload, options);
    this.events.emitJobCreated(job);
    return job;
  }

  async processJob<T>(workerId: string, job: Job<T>): Promise<void> {
    this.activeJobs.add(job.id);
    
    // Create abort controller for this job
    const abortController = new AbortController();
    this.jobHandlers.set(job.id, { abortController });
    
    try {
      const handler = this.handlers.get(job.taskName) as JobHandler<T>;
      if (!handler) {
        throw new Error(`No handler found for task: ${job.taskName}`);
      }

      const helpers: JobHelpers<T> = {
        updateProgress: async (progress: number) => {
          if (abortController.signal.aborted) {
            throw new Error('Job was killed');
          }
          await this.db.updateJobProgress(job.id, progress);
          
          // Fetch updated job for event
          const updatedJob = await this.db.getJobById<T>(job.id);
          if (updatedJob) {
            this.events.emitJobProgress(updatedJob, progress);
            
            // Send webhook notification for progress update if URL is configured
            if (updatedJob.webhookUrl) {
              WebhookService.sendWithRetry(updatedJob).catch(error => {
                console.error(`Failed to send progress webhook for job ${updatedJob.id}:`, error);
              });
            }
          }
        },
        getJobDetails: async () => {
          if (abortController.signal.aborted) {
            throw new Error('Job was killed');
          }
          const updatedJob = await this.db.getJobById<T>(job.id);
          if (!updatedJob) throw new Error(`Job not found: ${job.id}`);
          return updatedJob;
        },
        storeResult: async (result: any) => {
          if (abortController.signal.aborted) {
            throw new Error('Job was killed');
          }
          return await this.db.storeResult(job.id, result);
        },
        // Add cleanup function to helpers
        cleanup: async () => {
          // This will be called when the job is killed
          console.log(`Cleaning up job ${job.id}...`);
          // Add any cleanup logic here
        }
      };

      // Update worker ID and status in job
      await this.db.updateJobsBatch([{ jobId: job.id, status: JobStatus.RUNNING }]);
      await this.db.heartbeat(workerId, job.id);
      
      // Add cleanup function to handler
      const jobHandler = this.jobHandlers.get(job.id);
      if (jobHandler) {
        jobHandler.cleanup = helpers.cleanup;
      }
      
      const result = await handler(job.payload, helpers);
      const resultKey = await this.db.storeResult(job.id, result);
      await this.db.completeJob(job.id, resultKey);
      
      // Fetch updated job
      const updatedJob = await this.db.getJobById<T>(job.id);
      if (updatedJob) {
        this.events.emitJobCompleted(updatedJob);
        
        // Send webhook notification if URL is configured
        if (updatedJob.webhookUrl) {
          WebhookService.sendWithRetry(updatedJob, result).catch(error => {
            console.error(`Failed to send webhook for job ${updatedJob.id}:`, error);
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Job was killed') {
        console.log(`Job ${job.id} was killed during execution`);
      } else {
        await this.db.failJob(job.id, error as Error);
        
        // Fetch updated job
        const updatedJob = await this.db.getJobById<T>(job.id);
        if (updatedJob) {
          this.events.emitJobFailed(updatedJob, error as Error);
          
          // Send webhook notification for failed job if URL is configured
          if (updatedJob.webhookUrl) {
            WebhookService.sendWithRetry(updatedJob, { 
              error: (error as Error).message,
              stack: (error as Error).stack
            }).catch(webhookError => {
              console.error(`Failed to send webhook for failed job ${updatedJob.id}:`, webhookError);
            });
          }
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
      this.jobHandlers.delete(job.id);
    }
  }

  async getJobById(jobId: string): Promise<Job | null> {
    return await this.db.getJobById(jobId);
  }

  async getJobResult(resultKey: string): Promise<any> {
    return await this.db.getResult(resultKey);
  }

  getHandlers(): Map<string, JobHandler> {
    return this.handlers;
  }
}

// Worker class for processing jobs
export class Worker {
  private running = false;
  private id: string;
  
  constructor(
    private queue: Queue,
    private db: DbAdapter,
    private options: {
      pollInterval?: number;
      maxExecutionTime?: number;
    } = {}
  ) {
    this.id = `worker-${uuidv4()}`;
    this.options.pollInterval = this.options.pollInterval || 5000; // 5 seconds
    this.options.maxExecutionTime = this.options.maxExecutionTime || 0; // 0 = no limit
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.processNextBatch();
        await new Promise(resolve => setTimeout(resolve, this.options.pollInterval));
      } catch (error) {
        console.error('Error in worker poll:', error);
        await new Promise(resolve => setTimeout(resolve, this.options.pollInterval));
      }
    }
  }

  async processNextBatch(maxJobs = 10, timeout = 0): Promise<number> {
    const startTime = Date.now();
    const availableTasks = Array.from(this.queue.getHandlers().keys());
    let processedCount = 0;
    
    try {
      // Process up to maxJobs or until timeout
      for (let i = 0; i < maxJobs; i++) {
        // Check timeout if specified
        if (timeout > 0 && Date.now() - startTime > timeout) {
          console.log(`Batch processing stopped due to timeout (${timeout}ms)`);
          break;
        }
        
        // Fetch next job
        const job = await this.db.fetchNextJob(this.id, availableTasks);
        
        if (!job) {
          console.log('No more jobs to process');
          break;
        }
        
        // Process the job
        await this.queue.processJob(this.id, job);
        processedCount++;
      }
      
      return processedCount;
    } catch (error) {
      console.error('Error processing batch:', error);
      return processedCount;
    }
  }
}

// Factory functions
export function createQueue(adapter?: DbAdapter): Queue {
  const dbAdapter = adapter || new PrismaAdapter();
  return new Queue(dbAdapter);
}

export function createWorker(queue: Queue, adapter: DbAdapter, options?: any): Worker {
  return new Worker(queue, adapter, options);
}

// Initialize the job registry
const jobRegistry = JobRegistry.getInstance();
jobRegistry.registerJobTypes(projectJobTypes);

// Create queue instance
const queue = createQueueFromLib(new PrismaAdapter());

// Initialize the queue
export async function initQueue() {
  await queue.init();
  
  // Register all job types with the queue
  projectJobTypes.forEach(jobType => {
    queue.registerTask(jobType.name, jobType.handler);
  });
}

// Shutdown the queue
export async function shutdownQueue() {
  await queue.shutdown();
}
