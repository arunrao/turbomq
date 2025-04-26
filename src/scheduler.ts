import { v4 as uuidv4 } from 'uuid';
import { JobOptions, DbAdapter } from './types.js';
import { 
  ScheduledJob, 
  ScheduleJobOptions, 
  RecurringScheduleOptions,
  // Removed unused imports
  ScheduledJobFilter,
  SchedulerMetrics
} from './types/scheduler.js';
// Import cron-parser with proper type handling
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cronParser = require('cron-parser');

// Extended adapter interface for type safety
interface SchedulerDbAdapter extends DbAdapter {
  getScheduledJobsToRun?: (date: Date) => Promise<ScheduledJob[]>;
}

export class Scheduler {
  private db: DbAdapter;
  private isRunning = false;
  private checkIntervalMs: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private logger?: { debug: (message: string) => void };
  private metrics: SchedulerMetrics = {
    jobsScheduledCount: 0,
    jobsProcessedCount: 0,
    // Add the required properties
    jobsScheduled: 0,
    jobsProcessed: 0,
    runTimes: [],
    errors: [],
    status: 'stopped'
  };

  constructor(db: DbAdapter, options: { checkIntervalMs?: number; logger?: { debug: (message: string) => void } } = {}) {
    this.db = db;
    this.checkIntervalMs = options.checkIntervalMs || 60000; // Default: check every minute
    this.logger = options.logger;
  }

  /**
   * Schedule a one-time job to run at a specific time
   */
  async scheduleJob(taskName: string, payload: any, options: ScheduleJobOptions): Promise<ScheduledJob> {
    const id = uuidv4();
    const now = new Date();
    
    // Ensure runAt is in the future
    if (options.runAt < now) {
      throw new Error('Schedule time must be in the future');
    }
    
    const scheduledJob: ScheduledJob = {
      id,
      taskName,
      payload,
      type: 'one-time',
      status: 'scheduled',
      runAt: options.runAt,
      priority: options.priority ?? 0,
      maxAttempts: options.maxAttempts ?? 3,
      webhookUrl: options.webhookUrl,
      webhookHeaders: options.webhookHeaders,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now
    };
    
    // Store in database
    await (this.db as any).createScheduledJob(scheduledJob);
    this.metrics.jobsScheduledCount++;
    
    return scheduledJob;
  }

  /**
   * Schedule a recurring job using a cron pattern
   */
  async scheduleRecurringJob(taskName: string, payload: any, options: RecurringScheduleOptions): Promise<ScheduledJob> {
    const id = uuidv4();
    const now = new Date();
    
    // Validate cron pattern
    try {
      cronParser.parseExpression(options.pattern);
    } catch (error) {
      throw new Error(`Invalid cron pattern: ${options.pattern}`);
    }
    
    // Calculate next run time
    const nextRunAt = this.getNextRunTime(options.pattern, options.startDate || now, options.endDate);
    
    if (!nextRunAt) {
      throw new Error('No valid future execution time found for the given pattern and date range');
    }
    
    const scheduledJob: ScheduledJob = {
      id,
      taskName,
      payload,
      type: 'recurring',
      status: 'scheduled',
      pattern: options.pattern,
      startDate: options.startDate || now,
      endDate: options.endDate,
      nextRunAt,
      priority: options.priority ?? 0,
      maxAttempts: options.maxAttempts ?? 3,
      webhookUrl: options.webhookUrl,
      webhookHeaders: options.webhookHeaders,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now
    };
    
    // Store in database
    await (this.db as any).createScheduledJob(scheduledJob);
    this.metrics.jobsScheduledCount++;
    
    return scheduledJob;
  }

  /**
   * Get a scheduled job by ID
   */
  async getScheduledJobById(id: string): Promise<ScheduledJob | null> {
    return await (this.db as any).getScheduledJobById(id);
  }

  /**
   * List scheduled jobs with optional filtering
   */
  async listScheduledJobs(filter?: ScheduledJobFilter): Promise<ScheduledJob[]> {
    return await (this.db as any).listScheduledJobs(filter);
  }

  /**
   * Update a scheduled job
   */
  async updateScheduledJob(id: string, updates: Partial<ScheduleJobOptions | RecurringScheduleOptions>): Promise<ScheduledJob> {
    const job = await (this.db as any).getScheduledJobById(id);
    
    if (!job) {
      throw new Error(`Scheduled job with ID ${id} not found`);
    }
    
    // Handle different update types based on job type
    if (job.type === 'one-time') {
      // One-time job updates
      const updatedJob: Partial<ScheduledJob> = {
        ...updates,
        updatedAt: new Date()
      };
      
      if ('runAt' in updates && updates.runAt) {
        if (updates.runAt < new Date()) {
          throw new Error('Schedule time must be in the future');
        }
        updatedJob.runAt = updates.runAt;
      }
      
      return await (this.db as any).updateScheduledJob(id, updatedJob);
    } else {
      // Recurring job updates
      const recurringUpdates = updates as Partial<RecurringScheduleOptions>;
      const updatedJob: Partial<ScheduledJob> = {
        ...updates,
        updatedAt: new Date()
      };
      
      // If pattern is updated, validate and recalculate next run time
      if (recurringUpdates.pattern) {
        try {
          cronParser.parseExpression(recurringUpdates.pattern);
        } catch (error) {
          throw new Error(`Invalid cron pattern: ${recurringUpdates.pattern}`);
        }
        
        updatedJob.pattern = recurringUpdates.pattern;
        
        // Recalculate next run time
        const startDate = recurringUpdates.startDate || job.startDate || job.createdAt;
        const endDate = recurringUpdates.endDate || job.endDate;
        
        const nextRunAt = this.getNextRunTime(
          recurringUpdates.pattern,
          startDate,
          endDate
        );
        
        if (!nextRunAt) {
          throw new Error('No valid future execution time found for the given pattern and date range');
        }
        
        updatedJob.nextRunAt = nextRunAt;
      }
      
      // Update start/end dates if provided
      if (recurringUpdates.startDate) {
        updatedJob.startDate = recurringUpdates.startDate;
      }
      
      if (recurringUpdates.endDate) {
        updatedJob.endDate = recurringUpdates.endDate;
      }
      
      return await (this.db as any).updateScheduledJob(id, updatedJob);
    }
  }

  /**
   * Pause a scheduled job
   */
  async pauseScheduledJob(id: string): Promise<ScheduledJob> {
    const job = await (this.db as any).getScheduledJobById(id);
    
    if (!job) {
      throw new Error(`Scheduled job with ID ${id} not found`);
    }
    
    if (job.status !== 'scheduled') {
      throw new Error(`Cannot pause job with status ${job.status}`);
    }
    
    return await (this.db as any).updateScheduledJob(id, {
      status: 'paused',
      updatedAt: new Date()
    });
  }

  /**
   * Resume a paused scheduled job
   */
  async resumeScheduledJob(id: string): Promise<ScheduledJob> {
    const job = await (this.db as any).getScheduledJobById(id);
    
    if (!job) {
      throw new Error(`Scheduled job with ID ${id} not found`);
    }
    
    if (job.status !== 'paused') {
      throw new Error(`Cannot resume job with status ${job.status}`);
    }
    
    // For recurring jobs, recalculate next run time
    if (job.type === 'recurring' && job.pattern) {
      const nextRunAt = this.getNextRunTime(
        job.pattern,
        new Date(), // Use current time as the starting point
        job.endDate
      );
      
      if (!nextRunAt) {
        throw new Error('No valid future execution time found for the given pattern and date range');
      }
      
      return await (this.db as any).updateScheduledJob(id, {
        status: 'scheduled',
        nextRunAt,
        updatedAt: new Date()
      });
    }
    
    // For one-time jobs
    return await (this.db as any).updateScheduledJob(id, {
      status: 'scheduled',
      updatedAt: new Date()
    });
  }

  /**
   * Cancel a scheduled job
   */
  async cancelScheduledJob(id: string): Promise<void> {
    const job = await (this.db as any).getScheduledJobById(id);
    
    if (!job) {
      throw new Error(`Scheduled job with ID ${id} not found`);
    }
    
    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new Error(`Cannot cancel job with status ${job.status}`);
    }
    
    await (this.db as any).updateScheduledJob(id, {
      status: 'cancelled',
      updatedAt: new Date()
    });
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Run immediately
    await this.processScheduledJobs();
    
    // Then set up interval
    this.checkInterval = setInterval(async () => {
      try {
        await this.processScheduledJobs();
      } catch (error) {
        console.error('Error processing scheduled jobs:', error);
        this.metrics.errors.push({
          timestamp: new Date(),
          message: error instanceof Error ? error.message : String(error)
        });
        
        // Keep only the last 100 errors
        if (this.metrics.errors.length > 100) {
          this.metrics.errors = this.metrics.errors.slice(-100);
        }
      }
    }, this.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Process scheduled jobs that are due to run
   */
  private async processScheduledJobs(): Promise<number> {
    const startTime = Date.now();
    this.metrics.lastRunAt = new Date();
    
    try {
      // Check if the adapter supports scheduled jobs
      if (typeof (this.db as SchedulerDbAdapter).getScheduledJobsToRun !== 'function') {
        // This adapter doesn't support scheduling, so we'll skip processing
        this.logger?.debug('Adapter does not support scheduled jobs, skipping scheduler processing');
        return 0;
      }
      
      // Get jobs that need to be executed
      const now = new Date();
      // Use optional chaining instead of non-null assertion
      const getJobs = (this.db as SchedulerDbAdapter).getScheduledJobsToRun;
      const jobsToRun = getJobs ? await getJobs(now) : [];
      
      // Process each job
      for (const job of jobsToRun) {
        try {
          // Create a regular job in the queue
          const jobOptions: JobOptions = {
            priority: job.priority,
            maxAttempts: job.maxAttempts
          };
          
          // Add webhook properties if they exist
          if (job.webhookUrl) jobOptions.webhookUrl = job.webhookUrl;
          if (job.webhookHeaders) jobOptions.webhookHeaders = job.webhookHeaders;
          
          await this.db.createJob(job.taskName, job.payload, jobOptions);
          
          // Update the scheduled job
          if (job.type === 'one-time') {
            // Mark one-time job as completed
            await (this.db as any).updateScheduledJob(job.id, {
              status: 'completed',
              lastRunAt: now,
              updatedAt: now
            });
          } else if (job.type === 'recurring' && job.pattern) {
            // Calculate next run time for recurring job
            const nextRunAt = this.getNextRunTime(
              job.pattern,
              now,
              job.endDate
            );
            
            if (nextRunAt) {
              // Update with next run time
              await (this.db as any).updateScheduledJob(job.id, {
                lastRunAt: now,
                nextRunAt,
                updatedAt: now
              });
            } else {
              // No more runs (end date reached)
              await (this.db as any).updateScheduledJob(job.id, {
                status: 'completed',
                lastRunAt: now,
                updatedAt: now
              });
            }
          }
          
          this.metrics.jobsProcessed++;
        } catch (error) {
          console.error(`Error processing scheduled job ${job.id}:`, error);
          this.metrics.errors.push({
            timestamp: new Date(),
            message: `Error processing job ${job.id}: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    } finally {
      // Record run time
      const runTime = Date.now() - startTime;
      this.metrics.runTimes.push(runTime);
      
      // Keep only the last 100 run times
      if (this.metrics.runTimes.length > 100) {
        this.metrics.runTimes = this.metrics.runTimes.slice(-100);
      }
    }
    
    // Return the number of jobs processed
    return this.metrics.jobsProcessed;
  }

  /**
   * Calculate the next run time based on a cron pattern
   */
  private getNextRunTime(pattern: string, startFrom: Date, endDate?: Date): Date | null {
    try {
      const interval = cronParser.parseExpression(pattern, {
        currentDate: startFrom,
        endDate: endDate,
        utc: true // Use UTC time
      });
      
      try {
        return interval.next().toDate();
      } catch (e) {
        // No more executions in the given time range
        return null;
      }
    } catch (error) {
      console.error('Error parsing cron expression:', error);
      throw new Error(`Invalid cron pattern: ${pattern}`);
    }
  }

  /**
   * Get scheduler metrics
   */
  getMetrics(): SchedulerMetrics {
    const averageRunTime = this.metrics.runTimes.length > 0
      ? this.metrics.runTimes.reduce((sum, time) => sum + time, 0) / this.metrics.runTimes.length
      : undefined;
    
    return {
      lastRunAt: this.metrics.lastRunAt,
      averageRunTime,
      jobsScheduledCount: this.metrics.jobsScheduled,
      jobsProcessedCount: this.metrics.jobsProcessed,
      // Include all required properties
      jobsScheduled: this.metrics.jobsScheduled,
      jobsProcessed: this.metrics.jobsProcessed,
      runTimes: [...this.metrics.runTimes],
      errors: this.metrics.errors,
      status: this.isRunning ? 'running' : 'stopped'
    };
  }

  /**
   * Reschedule overdue jobs
   */
  async rescheduleOverdueJobs(): Promise<number> {
    const now = new Date();
    const overdueJobs = await (this.db as any).listScheduledJobs({
      status: 'scheduled',
      endDate: now
    });
    
    let rescheduledCount = 0;
    
    for (const job of overdueJobs) {
      if (job.type === 'one-time' && job.runAt && job.runAt < now) {
        // Reschedule one-time job to run now
        await (this.db as any).updateScheduledJob(job.id, {
          runAt: now,
          updatedAt: now
        });
        rescheduledCount++;
      } else if (job.type === 'recurring' && job.pattern) {
        // Calculate next run time from now
        const nextRunAt = this.getNextRunTime(
          job.pattern,
          now,
          job.endDate
        );
        
        if (nextRunAt) {
          await (this.db as any).updateScheduledJob(job.id, {
            nextRunAt,
            updatedAt: now
          });
          rescheduledCount++;
        } else {
          // No more runs (end date reached)
          await (this.db as any).updateScheduledJob(job.id, {
            status: 'completed',
            updatedAt: now
          });
        }
      }
    }
    
    return rescheduledCount;
  }

  /**
   * Clean up completed scheduled jobs
   */
  async cleanupCompletedScheduledJobs(beforeDate: Date): Promise<number> {
    const completedJobs = await (this.db as any).listScheduledJobs({
      status: 'completed',
      endDate: beforeDate
    });
    
    for (const job of completedJobs) {
      await (this.db as any).deleteScheduledJob(job.id);
    }
    
    return completedJobs.length;
  }
}
