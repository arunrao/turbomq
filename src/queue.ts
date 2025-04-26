import { DbAdapter, Job, JobHandler, JobHelpers, JobOptions, JobStatus } from './types';
import { EventManager } from './events';
import { WebhookService } from './services/webhook-service';
import { v4 } from 'uuid';
import { Scheduler } from './scheduler.js';
import { ScheduledJob, ScheduleJobOptions, RecurringScheduleOptions, ScheduledJobFilter } from './types/scheduler.js';

export interface ShutdownOptions {
  timeout?: number;
  force?: boolean;
}

export class Queue {
  private handlers: Map<string, JobHandler<any>> = new Map();
  private events: EventManager;
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private activeJobs: Set<string> = new Set();
  private jobHandlers: Map<string, { abortController: AbortController; cleanup?: () => Promise<void> }> = new Map();
  private scheduler?: Scheduler;
  
  constructor(private db: DbAdapter, options?: { schedulerCheckIntervalMs?: number; enableScheduler?: boolean }) {
    this.events = new EventManager();
    
    // Only create scheduler if explicitly enabled or if the adapter supports scheduling methods
    const enableScheduler = options?.enableScheduler ?? this.adapterSupportsScheduling();
    
    if (enableScheduler) {
      this.scheduler = new Scheduler(db, { checkIntervalMs: options?.schedulerCheckIntervalMs });
    }
  }
  
  /**
   * Check if the database adapter supports scheduling functionality
   */
  private adapterSupportsScheduling(): boolean {
    // Check for essential scheduling methods
    return (
      typeof (this.db as any).createScheduledJob === 'function' &&
      typeof (this.db as any).getScheduledJobsToRun === 'function'
    );
  }

  async init(): Promise<void> {
    await this.db.connect();
    // Start the scheduler if it exists
    if (this.scheduler) {
      await this.scheduler.start();
    }
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

        // Stop the scheduler if it exists
        if (this.scheduler) {
          this.scheduler.stop();
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
          return `result-${job.id}-${v4()}`;
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

  /**
   * Find jobs by their status
   * @param status The status to filter by
   * @param options Additional options for filtering and pagination
   */
  async findJobsByStatus<T>(
    status: JobStatus,
    options?: {
      taskName?: string;
      limit?: number;
      offset?: number;
      orderBy?: 'createdAt' | 'updatedAt' | 'runAt';
      order?: 'asc' | 'desc';
    }
  ): Promise<Job<T>[]> {
    return await this.db.listJobs<T>({
      status,
      taskName: options?.taskName,
      limit: options?.limit,
      offset: options?.offset,
      orderBy: options?.orderBy,
      order: options?.order
    });
  }

  /**
   * Remove jobs by their status
   * @param status The status of jobs to remove
   * @param options Additional options for filtering
   */
  async removeJobsByStatus(
    status: JobStatus,
    options?: {
      taskName?: string;
      beforeDate?: Date;
      limit?: number;
    }
  ): Promise<number> {
    return await this.db.removeJobsByStatus(status, options);
  }

  /**
   * Get detailed information about jobs in different states
   * @param options Options for filtering and pagination
   */
  async getDetailedJobInfo(options?: {
    status?: JobStatus;
    taskName?: string;
    limit?: number;
    offset?: number;
    includeResults?: boolean;
    includeErrors?: boolean;
    includeProgress?: boolean;
  }): Promise<{
    jobs: Job<any>[];
    total: number;
    stats: {
      byStatus: Record<string, number>;
      byTask: Record<string, number>;
      averageProcessingTime?: number;
      successRate?: number;
    };
  }> {
    return await this.db.getDetailedJobInfo(options);
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

  // Scheduler methods

  /**
   * Schedule a one-time job to run at a specific time
   * @param taskName The name of the task to execute
   * @param payload The data to pass to the task
   * @param options Scheduling options including when to run the job
   */
  async scheduleJob<T>(taskName: string, payload: T, options: ScheduleJobOptions): Promise<ScheduledJob> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    if (!this.handlers.has(taskName)) {
      throw new Error(`No handler registered for task: ${taskName}`);
    }
    
    return await this.scheduler.scheduleJob(taskName, payload, options);
  }

  /**
   * Schedule a recurring job using a cron pattern
   * @param taskName The name of the task to execute
   * @param payload The data to pass to the task
   * @param options Scheduling options including cron pattern
   */
  async scheduleRecurringJob<T>(taskName: string, payload: T, options: RecurringScheduleOptions): Promise<ScheduledJob> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    if (!this.handlers.has(taskName)) {
      throw new Error(`No handler registered for task: ${taskName}`);
    }
    
    return await this.scheduler.scheduleRecurringJob(taskName, payload, options);
  }

  /**
   * Get a scheduled job by ID
   * @param id The ID of the scheduled job
   */
  async getScheduledJobById(id: string): Promise<ScheduledJob | null> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    return await this.scheduler.getScheduledJobById(id);
  }

  /**
   * List scheduled jobs with optional filtering
   * @param filter Optional filter criteria
   */
  async listScheduledJobs(filter?: ScheduledJobFilter): Promise<ScheduledJob[]> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    return await this.scheduler.listScheduledJobs(filter);
  }

  /**
   * Update a scheduled job
   * @param id The ID of the scheduled job to update
   * @param updates The updates to apply to the job
   */
  async updateScheduledJob(id: string, updates: Partial<ScheduleJobOptions | RecurringScheduleOptions>): Promise<ScheduledJob> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    return await this.scheduler.updateScheduledJob(id, updates);
  }

  /**
   * Pause a scheduled job
   * @param id The ID of the scheduled job to pause
   */
  async pauseScheduledJob(id: string): Promise<ScheduledJob> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    return await this.scheduler.pauseScheduledJob(id);
  }

  /**
   * Resume a paused scheduled job
   * @param id The ID of the scheduled job to resume
   */
  async resumeScheduledJob(id: string): Promise<ScheduledJob> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    return await this.scheduler.resumeScheduledJob(id);
  }

  /**
   * Cancel a scheduled job
   * @param id The ID of the scheduled job to cancel
   */
  async cancelScheduledJob(id: string): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler is not available. The current database adapter may not support scheduling features.');
    }
    await this.scheduler.cancelScheduledJob(id);
  }

  /**
   * Get scheduler metrics
   */
  async getSchedulerMetrics(): Promise<any> {
    if (!this.scheduler) {
      // Return default metrics if scheduler is not available
      return {
        jobsScheduledCount: 0,
        jobsProcessedCount: 0,
        errors: [],
        status: 'stopped'
      };
    }
    return this.scheduler.getMetrics();
  }

  /**
   * Reschedule overdue jobs
   */
  async rescheduleOverdueJobs(): Promise<number> {
    if (!this.scheduler) {
      return 0; // No jobs to reschedule if scheduler is not available
    }
    return this.scheduler.rescheduleOverdueJobs();
  }

  /**
   * Clean up completed scheduled jobs
   * @param beforeDate Remove jobs completed before this date
   */
  async cleanupCompletedScheduledJobs(beforeDate: Date): Promise<number> {
    if (!this.scheduler) {
      return 0; // No jobs to clean up if scheduler is not available
    }
    return this.scheduler.cleanupCompletedScheduledJobs(beforeDate);
  }
}