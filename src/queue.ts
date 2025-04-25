import { DbAdapter, Job, JobHandler, JobHelpers, JobOptions } from './types';
import { EventManager } from './events';
import { WebhookService } from './services/webhook-service';
import { v4 as uuidv4 } from 'uuid';

export interface ShutdownOptions {
  timeout?: number;
  force?: boolean;
}

export class Queue {
  private handlers: Map<string, JobHandler<any>> = new Map();
  private events: EventManager;
  private isShuttingDown = false;
  
  constructor(private db: DbAdapter) {
    this.events = new EventManager();
  }

  async init(): Promise<void> {
    await this.db.connect();
  }

  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    const { timeout = 5000, force = false } = options;

    try {
      // Wait for any in-progress jobs to complete
      if (!force) {
        const runningJobs = await this.db.listJobs({ status: 'running' });
        if (runningJobs.length > 0) {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Shutdown timeout')), timeout);
          });

          const waitPromise = Promise.all(
            runningJobs.map(job => 
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(async () => {
                  const updatedJob = await this.db.getJobById(job.id);
                  if (!updatedJob || updatedJob.status !== 'running') {
                    clearInterval(checkInterval);
                    resolve();
                  }
                }, 100);
              })
            )
          );

          await Promise.race([waitPromise, timeoutPromise]);
        }
      }

      // Disconnect from database
      await this.db.disconnect();
    } catch (error) {
      if (force) {
        console.warn('Forced shutdown despite errors:', error);
        await this.db.disconnect();
      } else {
        throw error;
      }
    } finally {
      this.isShuttingDown = false;
    }
  }

  registerTask<T>(taskName: string, handler: JobHandler<T>): void {
    this.handlers.set(taskName, handler);
  }

  async addJob<T>(
    taskName: string, 
    payload: T, 
    options?: JobOptions
  ): Promise<Job<T>> {
    if (!this.handlers.has(taskName)) {
      throw new Error(`No handler registered for task: ${taskName}`);
    }

    const job = await this.db.createJob<T>(taskName, payload, options);
    this.events.emitJobCreated(job);
    return job;
  }

  async processJob<T>(workerId: string, job: Job<T>): Promise<void> {
    const handler = this.handlers.get(job.taskName) as JobHandler<T>;
    if (!handler) {
      throw new Error(`No handler found for task: ${job.taskName}`);
    }

    const helpers: JobHelpers<T> = {
      updateProgress: async (progress: number) => {
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
        const updatedJob = await this.db.getJobById<T>(job.id);
        if (!updatedJob) throw new Error(`Job not found: ${job.id}`);
        return updatedJob;
      },
      storeResult: async (_result: any) => {
        // In this simplified version, we'll just return a key
        return `result-${job.id}-${uuidv4()}`;
      }
    };

    try {
      // Update worker ID and status in job
      await this.db.updateJobsBatch([{ jobId: job.id, status: 'running' }]);
      await this.db.heartbeat(workerId, job.id);
      
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
  }

  onJobCreated<T>(listener: (job: Job<T>) => void): void {
    this.events.onJobCreated(listener);
  }

  onJobCompleted<T>(listener: (job: Job<T>) => void): void {
    this.events.onJobCompleted(listener);
  }

  onJobFailed<T>(listener: (job: Job<T>, error: Error) => void): void {
    this.events.onJobFailed(listener);
  }

  onJobProgress<T>(listener: (job: Job<T>, progress: number) => void): void {
    this.events.onJobProgress(listener);
  }

  async getJobById<T>(jobId: string): Promise<Job<T> | null> {
    return await this.db.getJobById<T>(jobId);
  }

  async getJobResult(resultKey: string): Promise<any> {
    return await this.db.getResult(resultKey);
  }

  async listJobs<T>(filter?: { status?: string; taskName?: string }): Promise<Job<T>[]> {
    return await this.db.listJobs<T>(filter as any);
  }

  async getQueueStats(): Promise<{
    pendingCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    return await this.db.getQueueStats();
  }

  // Expose handlers map for worker to access available tasks
  getHandlers(): Map<string, JobHandler<any>> {
    return this.handlers;
  }
}
