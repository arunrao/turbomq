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
  private activeJobs: Set<string> = new Set();
  private shutdownPromise: Promise<void> | null = null;
  private jobHandlers: Map<string, { abortController: AbortController; cleanup?: () => Promise<void> }> = new Map();
  
  constructor(private db: DbAdapter) {
    this.events = new EventManager();
  }

  async init(): Promise<void> {
    await this.db.connect();
  }

  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    // If already shutting down, return the existing promise
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    const { timeout = 5000, force = false } = options;

    this.shutdownPromise = (async () => {
      try {
        // Wait for any in-progress jobs to complete
        if (!force && this.activeJobs.size > 0) {
          console.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Shutdown timeout after ${timeout}ms`)), timeout);
          });

          const waitPromise = new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (this.activeJobs.size === 0) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
          });

          try {
            await Promise.race([waitPromise, timeoutPromise]);
            console.log('All jobs completed successfully');
          } catch (error) {
            if (error instanceof Error && error.message.includes('Shutdown timeout')) {
              console.warn(`Shutdown timed out after ${timeout}ms. ${this.activeJobs.size} jobs still running.`);
              if (!force) {
                throw error;
              }
            } else {
              throw error;
            }
          }
        }

        // Stop accepting new jobs
        this.handlers.clear();

        // Kill any remaining jobs if force is true
        if (force && this.activeJobs.size > 0) {
          console.log(`Force killing ${this.activeJobs.size} remaining jobs...`);
          await this.killJobs(Array.from(this.activeJobs), 'Forced shutdown', timeout);
        }

        // Disconnect from database with timeout
        const dbTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database disconnect timeout')), timeout);
        });

        await Promise.race([
          this.db.disconnect(),
          dbTimeoutPromise
        ]);
      } catch (error) {
        if (force) {
          console.warn('Forced shutdown despite errors:', error);
          try {
            await this.db.disconnect();
          } catch (dbError) {
            console.error('Failed to disconnect database during forced shutdown:', dbError);
          }
        } else {
          throw error;
        }
      } finally {
        this.isShuttingDown = false;
        this.activeJobs.clear();
        this.jobHandlers.clear();
        this.shutdownPromise = null;
      }
    })();

    return this.shutdownPromise;
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
        storeResult: async (_result: any) => {
          if (abortController.signal.aborted) {
            throw new Error('Job was killed');
          }
          return `result-${job.id}-${uuidv4()}`;
        },
        // Add cleanup function to helpers
        cleanup: async () => {
          // This will be called when the job is killed
          console.log(`Cleaning up job ${job.id}...`);
          // Add any cleanup logic here
        }
      };

      // Update worker ID and status in job
      await this.db.updateJobsBatch([{ jobId: job.id, status: 'running' }]);
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

  // Get count of currently active jobs
  getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  // Get list of currently active job IDs
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs);
  }

  // Expose handlers map for worker to access available tasks
  getHandlers(): Map<string, JobHandler<any>> {
    return this.handlers;
  }

  async killJob(jobId: string, reason = 'Job killed by user', timeout = 5000): Promise<void> {
    // Check if job exists and is running
    const job = await this.db.getJobById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'running') {
      throw new Error(`Job ${jobId} is not running`);
    }

    // Create a promise that resolves when the job is killed
    const killPromise = (async () => {
      // Kill the job
      await this.db.failJob(jobId, new Error(reason));
      // Remove from active jobs
      this.activeJobs.delete(jobId);
      this.jobHandlers.delete(jobId);
    })();

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Job kill timed out after ${timeout}ms`)), timeout);
    });

    // Race between kill and timeout
    await Promise.race([killPromise, timeoutPromise]);
  }

  async killJobs(jobIds: string[], reason = 'Jobs killed by user', timeout = 5000): Promise<void> {
    await Promise.all(jobIds.map(id => this.killJob(id, reason, timeout)));
  }

  getAvailableMethods(): string[] {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter(method => 
        typeof this[method as keyof this] === 'function' && 
        !method.startsWith('_') &&
        method !== 'constructor'
      );
  }
}