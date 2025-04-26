import { DbAdapter } from './types.js';
import { 
  ScheduledJob, 
  ScheduleJobOptions, 
  RecurringScheduleOptions,
  ScheduledJobFilter,
  SchedulerMetrics
} from './types/scheduler.js';
import { v4 as uuidv4 } from 'uuid';
// Import cron-parser with proper CommonJS require syntax for TypeScript compatibility
const cronParser = require('cron-parser');

export class Scheduler {
  private db: DbAdapter;
  private interval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private checkIntervalMs: number = 60000; // Default: check every minute
  private metrics: {
    lastRunAt?: Date;
    runTimes: number[];
    jobsScheduled: number;
    jobsProcessed: number;
    errors: Array<{ timestamp: Date; message: string }>;
  };

  constructor(db: DbAdapter, options?: { checkIntervalMs?: number }) {
    this.db = db;
    if (options?.checkIntervalMs) {
      this.checkIntervalMs = options.checkIntervalMs;
    }
    this.metrics = {
      runTimes: [],
      jobsScheduled: 0,
      jobsProcessed: 0,
      errors: []
    };
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
    this.metrics.jobsScheduled++;
    
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
    this.metrics.jobsScheduled++;
    
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
    if (this.running) {
      return;
    }
    
    this.running = true;
    
    // Run immediately
    await this.processScheduledJobs();
    
    // Then set up interval
    this.interval = setInterval(async () => {
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
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
  }

  /**
   * Process scheduled jobs that are due to run
   */
  private async processScheduledJobs(): Promise<void> {
    const startTime = Date.now();
    this.metrics.lastRunAt = new Date();
    
    try {
      // Get jobs that need to be executed
      const now = new Date();
      const jobsToRun = await (this.db as any).getScheduledJobsToRun(now);
      
      // Process each job
      for (const job of jobsToRun) {
        try {
          // Create a regular job in the queue
          await this.db.createJob(job.taskName, job.payload, {
            priority: job.priority,
            maxAttempts: job.maxAttempts,
            webhookUrl: job.webhookUrl,
            webhookHeaders: job.webhookHeaders
          });
          
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
  }

  /**
   * Calculate the next run time based on a cron pattern
   */
  private getNextRunTime(pattern: string, startFrom: Date, endDate?: Date): Date | null {
    try {
      const options = {
        currentDate: startFrom,
        endDate: endDate,
        utc: true // Use UTC time
      };
      
      const interval = cronParser.parseExpression(pattern, options);
      
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
      errors: this.metrics.errors,
      status: this.running ? 'running' : 'stopped'
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
