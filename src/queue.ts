import { DbAdapter, Job, JobHandler, JobHelpers, JobOptions } from './types';
import { EventManager } from './events';
import { WebhookService } from './services/webhook-service';
import { v4 as uuidv4 } from 'uuid';

export class Queue {
  private handlers: Map<string, JobHandler> = new Map();
  private events: EventManager;
  
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

  async processJob(workerId: string, job: Job): Promise<void> {
    const handler = this.handlers.get(job.taskName);
    if (!handler) {
      throw new Error(`No handler found for task: ${job.taskName}`);
    }

    const helpers: JobHelpers = {
      updateProgress: async (progress: number) => {
        await this.db.updateJobProgress(job.id, progress);
        
        // Fetch updated job for event
        const updatedJob = await this.db.getJobById(job.id);
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
        const updatedJob = await this.db.getJobById(job.id);
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
      const updatedJob = await this.db.getJobById(job.id);
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
      const updatedJob = await this.db.getJobById(job.id);
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

  onJobCreated(listener: (job: Job) => void): void {
    this.events.onJobCreated(listener);
  }

  onJobCompleted(listener: (job: Job) => void): void {
    this.events.onJobCompleted(listener);
  }

  onJobFailed(listener: (job: Job, error: Error) => void): void {
    this.events.onJobFailed(listener);
  }

  onJobProgress(listener: (job: Job, progress: number) => void): void {
    this.events.onJobProgress(listener);
  }

  async getJobById(jobId: string): Promise<Job | null> {
    return await this.db.getJobById(jobId);
  }

  async getJobResult(resultKey: string): Promise<any> {
    return await this.db.getResult(resultKey);
  }

  async listJobs(filter?: { status?: string; taskName?: string }): Promise<Job[]> {
    return await this.db.listJobs(filter as any);
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
  getHandlers(): Map<string, JobHandler> {
    return this.handlers;
  }
}
