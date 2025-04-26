// We're using the string literals directly in the code, so we don't need to import JobStatus

// Define the scheduled job types and statuses as string literals
export type ScheduledJobType = 'one-time' | 'recurring';
export type ScheduledJobStatus = 'scheduled' | 'paused' | 'completed' | 'cancelled';

export interface ScheduleJobOptions {
  runAt: Date; // UTC date when the job should run
  priority?: number;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, any>; // Additional metadata for the scheduled job
}

export interface RecurringScheduleOptions {
  pattern: string; // Cron expression (e.g., "0 0 * * *" for daily at midnight UTC)
  startDate?: Date; // When to start the recurring schedule (default: now)
  endDate?: Date; // When to end the recurring schedule (optional)
  priority?: number;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface ScheduledJob {
  id: string;
  taskName: string;
  payload: any;
  type: ScheduledJobType;
  status: ScheduledJobStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // For one-time jobs
  runAt?: Date;
  
  // For recurring jobs
  pattern?: string;
  startDate?: Date;
  endDate?: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  
  // Common fields
  priority: number;
  maxAttempts: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface ScheduledJobFilter {
  type?: ScheduledJobType;
  status?: ScheduledJobStatus;
  taskName?: string;
  startDate?: Date; // Filter by jobs scheduled after this date
  endDate?: Date; // Filter by jobs scheduled before this date
  nextRunBefore?: Date; // Filter by jobs that will run before this date
  limit?: number; // Limit the number of results
  offset?: number; // Skip the first n results
}

export interface QueueStats {
  // Regular jobs stats
  jobs: {
    total: number;
    byStatus: {
      pending: number;
      running: number;
      completed: number;
      failed: number;
    };
    byTask: Record<string, number>; // Count of jobs by task name
    processingRate?: {
      last1Minute: number;  // Jobs processed per minute
      last5Minutes: number;
      last1Hour: number;
    };
    averageProcessingTime?: number; // In milliseconds
    oldestPendingJob?: Date;
  };
  
  // Scheduled jobs stats
  scheduledJobs: {
    total: number;
    byType: {
      oneTime: number;
      recurring: number;
    };
    byStatus: {
      scheduled: number;
      paused: number;
      completed: number;
      cancelled: number;
    };
    byTask: Record<string, number>;
    upcomingJobs: number; // Jobs scheduled in the next 24 hours
    pastDueJobs: number;  // Jobs that should have run but haven't yet
  };
  
  // System stats
  system?: {
    activeWorkers: number;
    queueLatency: number; // Time between job creation and execution
    schedulerLastRun?: Date;
    schedulerHealth: 'healthy' | 'delayed' | 'stopped';
  };
}

export interface SchedulerMetrics {
  lastRunAt?: Date;
  averageRunTime?: number; // In milliseconds
  jobsScheduledCount: number;
  jobsProcessedCount: number;
  // Properties used in the implementation
  jobsScheduled: number;
  jobsProcessed: number;
  runTimes: number[];
  errors: Array<{
    timestamp: Date;
    message: string;
  }>;
  status: 'running' | 'stopped' | 'error';
}
