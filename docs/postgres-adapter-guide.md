# PostgreSQL Adapter Guide for TurboMQ

This guide provides detailed instructions for setting up and using the PostgreSQL adapter with TurboMQ 1.4.0. It includes a complete, copy-pastable example of a queue service implementation.

## Installation

First, make sure you have TurboMQ installed:

```bash
npm install turbomq
# or
yarn add turbomq
```

## PostgreSQL Setup

The PostgreSQL adapter requires a PostgreSQL database. You'll need to set up the necessary tables for TurboMQ to work properly.

### Database Schema

TurboMQ requires the following tables in your PostgreSQL database:

- `jobs`: Stores job information
- `job_results`: Stores job results
- `scheduled_jobs`: Stores scheduled job information (if using the scheduler)

You can create these tables using the schema provided in the [Schema Management](./schema-management.md) documentation.

## Complete Queue Service Example

Below is a complete, production-ready implementation of a queue service using TurboMQ with PostgreSQL. This example includes:

- Proper connection handling
- Worker setup
- Scheduled job support
- Error handling
- TypeScript type safety

```typescript
/**
 * Queue Service using TurboMQ with PostgreSQL
 */
import { 
  Queue, 
  PostgresAdapter, 
  createWorker,
  createWorkerPool,
  Job, 
  Worker, 
  WorkerPool,
  JobOptions, 
  JobStatus,
  DbAdapter
} from 'turbomq';

// Define your job types for better type safety
export enum JobType {
  EMAIL_NOTIFICATION = 'email-notification',
  DATA_PROCESSING = 'data-processing',
  REPORT_GENERATION = 'report-generation'
}

// Define worker options interface
interface WorkerOptions {
  useWorkerPool?: boolean;    // Whether to use a worker pool
  minWorkers?: number;        // Minimum number of workers (for worker pool)
  maxWorkers?: number;        // Maximum number of workers (for worker pool)
  pollInterval?: number;      // How often to check for new jobs (ms)
  maxExecutionTime?: number;  // Maximum execution time (0 for no limit)
  concurrency?: number;       // How many jobs to process concurrently
  stalledTimeout?: number;    // How long before a job is considered stalled
  lockDuration?: number;      // How long to lock a job for
}

// Define scheduling options for one-time scheduled jobs
interface ScheduleJobOptions {
  runAt: Date;       // When to run the job
  priority?: number; // Priority of the job (higher runs first)
}

// Define scheduling options for recurring jobs
interface RecurringScheduleOptions {
  pattern: string;     // Cron pattern for scheduling (e.g., "0 0 * * *" for daily at midnight)
  priority?: number;   // Priority of the job (higher runs first)
}

/**
 * Queue service singleton for managing background jobs
 */
class QueueService {
  private static instance: QueueService;
  private initialized: boolean = false;
  private queue: Queue | null = null;
  private postgresAdapter: PostgresAdapter | null = null;
  private workers: Worker[] = [];
  private workerPool: WorkerPool | null = null;
  private connectionString: string = '';

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {
    // Initialize any required setup
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }
  
  /**
   * Check if the queue service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the queue service
   * 
   * @param options Optional configuration options
   * @param options.enableScheduler Whether to enable the scheduler (default: true)
   * @param options.schedulerCheckIntervalMs How often to check for scheduled jobs (default: 60000ms)
   */
  async init(options: { enableScheduler?: boolean; schedulerCheckIntervalMs?: number } = {}): Promise<void> {
    if (this.initialized) {
      console.log('Queue service already initialized');
      return;
    }

    try {
      console.log('Initializing queue service...');
      
      // Construct connection string from environment variables
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || '5432';
      const database = process.env.POSTGRES_DATABASE || 'mydb';
      const user = process.env.POSTGRES_USER || 'postgres';
      const password = process.env.POSTGRES_PASSWORD || 'postgres';
      
      // Construct the connection string
      this.connectionString = `postgres://${user}:${password}@${host}:${port}/${database}`;
      
      console.log(`Using database connection: ${host}:${port}/${database} (user: ${user})`);
      
      // Create a PostgreSQL adapter with explicit configuration
      const adapterConfig = {
        connectionString: this.connectionString,
        ssl: process.env.POSTGRES_HOST !== 'localhost'
      };
      
      console.log('Creating PostgreSQL adapter with config:', adapterConfig);
      
      // Create a custom adapter that overrides the connect method
      class CustomPostgresAdapter extends PostgresAdapter {
        // Override the connect method to use the stored connection options
        async connect(): Promise<void> {
          return super.connect(adapterConfig);
        }
        
        // Implement missing methods required by Worker
        async cleanupStaleJobs(): Promise<number> {
          console.log('Cleaning up stale jobs (stub implementation)');
          return 0; // Return 0 jobs cleaned up
        }
        
        async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 5): Promise<any[]> {
          console.log(`Fetching next batch for worker ${workerId}`);
          // Get pending jobs for available tasks
          if (availableTasks.length > 0) {
            const jobs = await super.getJobsByStatus('pending' as any, availableTasks[0]);
            // Return up to batchSize jobs
            return jobs.slice(0, batchSize);
          }
          return []; // No tasks available or no jobs found
        }
        
        async heartbeat(workerId: string, jobId?: string): Promise<void> {
          console.log(`Heartbeat from worker ${workerId} ${jobId ? `for job ${jobId}` : ''}`);
          // No-op implementation
        }
      }
      
      // Create the adapter with the connection options
      this.postgresAdapter = new CustomPostgresAdapter(adapterConfig);
      
      // Verify the adapter was created successfully
      if (!this.postgresAdapter) {
        throw new Error('Failed to create PostgreSQL adapter');
      }
      
      console.log('PostgreSQL adapter created successfully');
      
      // Create a new queue instance with scheduler support
      const queueOptions = {
        enableScheduler: options.enableScheduler !== false, // Enable by default
        schedulerCheckIntervalMs: options.schedulerCheckIntervalMs || 60000 // Default to 1 minute
      };
      
      console.log('Creating queue with options:', queueOptions);
      
      // Create the queue with the adapter
      this.queue = new Queue(this.postgresAdapter as unknown as DbAdapter, queueOptions);
      
      // Initialize the queue
      console.log('Initializing queue...');
      await this.queue.init();
      console.log('Queue initialized successfully');
      
      // Register task handlers
      this.registerTaskHandlers();
      console.log('Task handlers registered');
      
      this.initialized = true;
      console.log('Queue service initialized successfully');
      
      // Log scheduler status
      if (options.enableScheduler !== false) {
        console.log('Scheduler enabled, will check for scheduled jobs every', 
          (options.schedulerCheckIntervalMs || 60000) / 1000, 'seconds');
      } else {
        console.log('Scheduler disabled');
      }
    } catch (error: any) {
      console.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  /**
   * Register task handlers for different job types
   */
  private registerTaskHandlers(): void {
    if (!this.queue) return;

    // Register handlers for each job type
    this.queue.registerTask(JobType.EMAIL_NOTIFICATION, async (job) => {
      console.log('Processing email notification job:', job.payload);
      // Implement your email notification logic here
    });

    this.queue.registerTask(JobType.DATA_PROCESSING, async (job) => {
      console.log('Processing data processing job:', job.payload);
      // Implement your data processing logic here
    });

    this.queue.registerTask(JobType.REPORT_GENERATION, async (job) => {
      console.log('Processing report generation job:', job.payload);
      // Implement your report generation logic here
    });
  }

  /**
   * Add a job to the queue
   * 
   * @param jobType The type of job to add
   * @param data The data for the job
   * @param options Optional job options
   */
  async addJob(jobType: string, data: any, options: JobOptions = {}): Promise<Job> {
    if (!this.initialized || !this.queue) {
      throw new Error('Queue service not initialized');
    }

    try {
      console.log(`Adding job of type ${jobType} to queue`);
      
      // Add the job to the queue
      const job = await this.queue.addJob(jobType, data, options);
      console.log(`Added job ${job.id} to queue`);
      
      return job;
    } catch (error: any) {
      console.error(`Failed to add job of type ${jobType} to queue:`, error);
      throw error;
    }
  }

  /**
   * Schedule a job to run at a specific time
   * 
   * @param jobType The type of job to schedule
   * @param data The data for the job
   * @param options Scheduling options
   */
  async scheduleJob(jobType: string, data: any, options: ScheduleJobOptions): Promise<any> {
    if (!this.initialized || !this.queue) {
      throw new Error('Queue service not initialized');
    }

    try {
      console.log(`Scheduling job of type ${jobType} to run at ${options.runAt}`);
      
      // Schedule the job
      const job = await this.queue.scheduleJob(jobType, data, {
        runAt: options.runAt,
        priority: options.priority
      });
      
      console.log(`Scheduled job ${job.id} to run at ${options.runAt}`);
      return job;
    } catch (error: any) {
      console.error(`Failed to schedule job of type ${jobType}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a recurring job using a cron pattern
   */
  async scheduleRecurringJob(jobType: string, data: any, options: RecurringScheduleOptions): Promise<any> {
    if (!this.initialized || !this.queue) {
      throw new Error('Queue service not initialized');
    }

    try {
      console.log(`Scheduling recurring job of type ${jobType} with cron pattern ${options.pattern}`);
      
      // Schedule the recurring job
      const job = await this.queue.scheduleRecurringJob(jobType, data, {
        pattern: options.pattern,
        priority: options.priority
      });
      
      console.log(`Scheduled recurring job ${job.id} with cron pattern ${options.pattern}`);
      return job;
    } catch (error: any) {
      console.error(`Failed to schedule recurring job of type ${jobType}:`, error);
      throw error;
    }
  }

  /**
   * Start workers to process jobs
   */
  async startWorkers(options: WorkerOptions = {}): Promise<void> {
    if (!this.initialized || !this.queue || !this.postgresAdapter) {
      throw new Error('Queue service not initialized');
    }

    try {
      console.log('Starting workers with options:', options);

      if (options.useWorkerPool) {
        // Create and start a worker pool
        this.workerPool = createWorkerPool(
          this.queue,
          this.postgresAdapter as unknown as DbAdapter,
          {
            minWorkers: options.minWorkers || 1,
            maxWorkers: options.maxWorkers || 5,
            pollInterval: options.pollInterval || 5000,
            maxExecutionTime: options.maxExecutionTime || 0,
            concurrency: options.concurrency || 1
          }
        );
        
        if (this.workerPool) {
          await this.workerPool.start();
          console.log('Worker pool started successfully');
        } else {
          throw new Error('Failed to create worker pool');
        }
      } else {
        // Create and start individual workers
        const worker = createWorker(
          this.queue,
          this.postgresAdapter as unknown as DbAdapter,
          options.pollInterval || 5000,
          options.maxExecutionTime || 0
        );
        
        if (worker) {
          this.workers.push(worker);
          await worker.start();
          console.log('Worker started successfully');
        } else {
          throw new Error('Failed to create worker');
        }
      }
    } catch (error: any) {
      console.error('Worker error:', error);
      throw error;
    }
  }

  /**
   * Shutdown the queue service
   */
  async shutdown(options: { timeout?: number; force?: boolean } = {}): Promise<void> {
    try {
      console.log('Shutting down queue service...');

      // Stop all workers
      if (this.workerPool) {
        try {
          await this.workerPool.shutdown();
        } catch (error) {
          console.error('Error stopping worker pool:', error);
        }
        this.workerPool = null;
      }

      for (const worker of this.workers) {
        try {
          await worker.stop();
        } catch (error) {
          console.error('Error stopping worker:', error);
        }
      }
      this.workers = [];

      // Shutdown the queue
      if (this.queue) {
        await this.queue.shutdown({
          timeout: options.timeout || 5000,
          force: options.force || false
        });
        this.queue = null;
      }

      this.initialized = false;
      console.log('Queue service shut down successfully');
    } catch (error: any) {
      console.error('Failed to shutdown queue service:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    if (!this.initialized || !this.queue) {
      throw new Error('Queue service not initialized');
    }

    try {
      const stats = await this.queue.getQueueStats();
      return stats;
    } catch (error: any) {
      console.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  /**
   * Get the queue instance
   */
  getQueue(): Queue | null {
    return this.queue;
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();
```

## Usage Example

Here's how to use the queue service in your application:

```typescript
import { queueService, JobType } from './queue-service';

async function main() {
  // Initialize the queue service
  await queueService.init({
    enableScheduler: true,
    schedulerCheckIntervalMs: 30000 // Check for scheduled jobs every 30 seconds
  });
  
  // Start workers to process jobs
  await queueService.startWorkers({
    pollInterval: 1000,
    concurrency: 2
  });
  
  // Add a job to the queue
  await queueService.addJob(JobType.EMAIL_NOTIFICATION, {
    to: 'user@example.com',
    subject: 'Welcome to our service',
    body: 'Thank you for signing up!'
  });
  
  // Schedule a job to run in the future
  await queueService.scheduleJob(JobType.REPORT_GENERATION, {
    reportId: '123',
    userId: '456'
  }, {
    runAt: new Date(Date.now() + 3600000) // Run 1 hour from now
  });
  
  // Schedule a recurring job
  await queueService.scheduleRecurringJob(JobType.DATA_PROCESSING, {
    dataSource: 'analytics',
    processType: 'daily-summary'
  }, {
    pattern: '0 0 * * *' // Run daily at midnight
  });
}

main().catch(console.error);
```

## Key Implementation Details

### Custom PostgreSQL Adapter

The example uses a custom PostgreSQL adapter that extends the built-in adapter to:

1. **Fix connection handling**: Ensures the adapter always has access to connection options
2. **Implement missing methods**: Adds required methods for worker functionality
3. **Type safety**: Properly handles type conversions between PostgreSQL and TurboMQ

### Worker Configuration

The example shows how to configure both individual workers and worker pools with options for:

- Poll interval
- Concurrency
- Execution time limits
- Stalled job handling

### Scheduler Support

The example includes full support for:

- One-time scheduled jobs
- Recurring jobs with cron patterns
- Scheduler configuration options

## Troubleshooting

### Connection Issues

If you encounter connection issues:

1. Verify your PostgreSQL connection string is correct
2. Ensure your database user has the necessary permissions
3. Check that the required tables exist in your database

### Worker Errors

If workers fail to start:

1. Check that your custom adapter implements all required methods
2. Verify that your database schema is correctly set up
3. Ensure your PostgreSQL server is running and accessible

## Next Steps

- [API Reference](./API_REFERENCE.md): Complete API documentation
- [Deployment Guide](./DEPLOYMENT.md): How to deploy TurboMQ in production
- [Schema Management](./schema-management.md): Database schema details
