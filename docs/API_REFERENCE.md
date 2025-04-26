# API Reference for TurboMQ

This document provides a comprehensive reference for all the components, classes, and methods available in the TurboMQ job queue system.

## Version 1.4.0

### Module System Support
The package now supports both ES Modules (ESM) and CommonJS module systems:

- **ES Modules (ESM)**
  ```typescript
  import { Queue } from 'turbomq';
  ```

- **CommonJS**
  ```typescript
  const { Queue } = require('turbomq');
  ```

The package automatically provides the correct module format based on your project's configuration.

### Type Definitions
Added internal type definitions for:
- `uuid` module
- `pg` (PostgreSQL) module

This resolves TypeScript compilation issues when using these dependencies.

## Table of Contents

- [Core Components](#core-components)
  - [Queue](#queue)
  - [Worker](#worker)
  - [WorkerPool](#workerpool)
  - [Scheduler](#scheduler)
- [Database Adapters](#database-adapters)
  - [PrismaAdapter](#prismaadapter)
- [File Storage](#file-storage)
  - [LocalFileStorage](#localfilestorage)
- [Helper Functions](#helper-functions)
- [Types and Interfaces](#types-and-interfaces)
  - [Job Types](#job-types)
  - [Scheduled Job Types](#scheduled-job-types)
- [Events System](#events-system)

## Core Components

### Queue

The `Queue` class is the main entry point for interacting with the job queue system.

#### Constructor

```typescript
constructor(db: DbAdapter)
```

- `db`: An implementation of the `DbAdapter` interface

#### Methods

##### `async init(): Promise<void>`

Initializes the queue and connects to the database.

##### `async shutdown(): Promise<void>`

Shuts down the queue and disconnects from the database.

##### `registerTask(taskName: string, handler: JobHandler): void`

Registers a task handler for processing jobs of a specific type.

- `taskName`: The name of the task
- `handler`: A function that processes jobs of this type

##### `async addJob(taskName: string, payload: any, options?: JobOptions): Promise<Job>`

Adds a new job to the queue.

- `taskName`: The name of the task
- `payload`: The data to be processed by the task
- `options`: Optional settings for the job
  - `priority`: Higher values run first (default: 0)
  - `runAt`: When to run the job (default: now)
  - `maxAttempts`: Maximum retry attempts (default: 3)

Returns the created job.

##### `async processJob(workerId: string, job: Job): Promise<void>`

Processes a single job. This is typically called by a worker, not directly.

- `workerId`: ID of the worker processing the job
- `job`: The job to process

##### `async getJobById(jobId: string): Promise<Job | null>`

Gets a job by its ID.

- `jobId`: The ID of the job to retrieve

##### `async getJobResult(resultKey: string): Promise<any>`

Gets the result of a completed job.

- `resultKey`: The key of the result to retrieve

##### `async listJobs(filter?: { status?: string; taskName?: string }): Promise<Job[]>`

Lists jobs with optional filtering.

- `filter`: Optional filter criteria
  - `status`: Filter by job status
  - `taskName`: Filter by task name

##### `async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number; scheduledJobsCount?: number; }>`

Gets statistics about the queue, including counts of jobs in different states and scheduled jobs.

##### `async killJob(jobId: string, reason?: string, timeout?: number): Promise<void>`

Kills a running job with an optional reason and timeout.

- `jobId`: The ID of the job to kill
- `reason`: Optional reason for killing the job (default: 'Job killed by user')
- `timeout`: Optional timeout in milliseconds (default: 5000)

##### `async killJobs(jobIds: string[], reason?: string, timeout?: number): Promise<void>`

Kills multiple running jobs with an optional reason and timeout.

- `jobIds`: Array of job IDs to kill
- `reason`: Optional reason for killing the jobs (default: 'Jobs killed by user')
- `timeout`: Optional timeout in milliseconds (default: 5000)

##### `async findJobsByStatus(status: JobStatus, options?: { taskName?: string; limit?: number; offset?: number; orderBy?: 'createdAt' | 'updatedAt' | 'runAt'; order?: 'asc' | 'desc'; }): Promise<Job[]>`

Finds jobs by their status with additional filtering and pagination options.

- `status`: The status to filter by
- `options`: Additional options for filtering and pagination

##### `async removeJobsByStatus(status: JobStatus, options?: { taskName?: string; beforeDate?: Date; limit?: number; }): Promise<number>`

Removes jobs by their status with additional filtering options.

- `status`: The status of jobs to remove
- `options`: Additional options for filtering

##### `async getDetailedJobInfo(options?: { status?: JobStatus; taskName?: string; limit?: number; offset?: number; includeResults?: boolean; includeErrors?: boolean; includeProgress?: boolean; }): Promise<{ jobs: Job[]; total: number; stats: { byStatus: Record<string, number>; byTask: Record<string, number>; averageProcessingTime?: number; successRate?: number; }; }>`

Gets detailed information about jobs in different states with comprehensive statistics.

- `options`: Options for filtering and pagination

##### `getActiveJobsCount(): number`

Gets the count of currently active jobs.

##### `getActiveJobIds(): string[]`

Gets the list of currently active job IDs.

##### `getHandlers(): Map<string, JobHandler<any>>`

Exposes the handlers map for worker to access available tasks.

##### `getAvailableMethods(): string[]`

Returns an array of all available public methods on the Queue instance.

#### Scheduler Methods

##### `async scheduleJob(taskName: string, payload: any, options: ScheduleJobOptions): Promise<ScheduledJob>`

Schedules a one-time job to run at a specific time.

- `taskName`: The name of the task to execute
- `payload`: The data to pass to the task
- `options`: Scheduling options including when to run the job

##### `async scheduleRecurringJob(taskName: string, payload: any, options: RecurringScheduleOptions): Promise<ScheduledJob>`

Schedules a recurring job using a cron pattern.

- `taskName`: The name of the task to execute
- `payload`: The data to pass to the task
- `options`: Scheduling options including cron pattern

##### `async getScheduledJobById(id: string): Promise<ScheduledJob | null>`

Gets a scheduled job by ID.

- `id`: The ID of the scheduled job

##### `async listScheduledJobs(filter?: ScheduledJobFilter): Promise<ScheduledJob[]>`

Lists scheduled jobs with optional filtering.

- `filter`: Optional filter criteria

##### `async updateScheduledJob(id: string, updates: Partial<ScheduleJobOptions | RecurringScheduleOptions>): Promise<ScheduledJob>`

Updates a scheduled job.

- `id`: The ID of the scheduled job to update
- `updates`: The updates to apply to the job

##### `async pauseScheduledJob(id: string): Promise<ScheduledJob>`

Pauses a scheduled job.

- `id`: The ID of the scheduled job to pause

##### `async resumeScheduledJob(id: string): Promise<ScheduledJob>`

Resumes a paused scheduled job.

- `id`: The ID of the scheduled job to resume

##### `async cancelScheduledJob(id: string): Promise<void>`

Cancels a scheduled job.

- `id`: The ID of the scheduled job to cancel

##### `async getSchedulerMetrics(): Promise<SchedulerMetrics>`

Gets metrics about the scheduler.

##### `async rescheduleOverdueJobs(): Promise<number>`

Reschedules overdue jobs. Returns the number of jobs rescheduled.

##### `async cleanupCompletedScheduledJobs(beforeDate: Date): Promise<number>`

Cleans up completed scheduled jobs.

- `beforeDate`: Remove jobs completed before this date

#### Event Handlers

##### `onJobCreated(listener: (job: Job) => void): void`

Registers a listener for when jobs are created.

##### `onJobCompleted(listener: (job: Job) => void): void`

Registers a listener for when jobs are completed.

##### `onJobFailed(listener: (job: Job, error: Error) => void): void`

Registers a listener for when jobs fail.

##### `onJobProgress(listener: (job: Job, progress: number) => void): void`

Registers a listener for when job progress is updated.

### Worker

The `Worker` class is responsible for processing jobs from the queue.

#### Constructor

```typescript
constructor(
  queue: Queue,
  db: DbAdapter,
  pollInterval: number = 5000,
  maxExecutionTime: number = 0
)
```

- `queue`: The queue instance
- `db`: The database adapter
- `pollInterval`: How often to check for new jobs (ms)
- `maxExecutionTime`: Maximum execution time (0 for no limit)

#### Methods

##### `async start(): Promise<void>`

Starts the worker.

##### `async stop(): Promise<void>`

Stops the worker.

##### `async gracefulShutdown(timeout: number = 30000): Promise<boolean>`

Gracefully shuts down the worker, waiting for the current job to complete.

- `timeout`: Maximum time to wait for the current job to complete (ms)

Returns `true` if shutdown was clean, `false` if timed out.

##### `async processNextBatch(maxJobs: number = 5, timeout: number = 25000): Promise<number>`

Processes a batch of jobs. Useful for serverless environments.

- `maxJobs`: Maximum number of jobs to process
- `timeout`: Maximum execution time (ms)

Returns the number of jobs processed.

### WorkerPool

The `WorkerPool` class manages multiple workers for auto-scaling.

#### Constructor

```typescript
constructor(
  queueInstance: Queue,
  dbAdapter: DbAdapter,
  minWorkers = 0,
  maxWorkers = 5
)
```

- `queueInstance`: The queue instance
- `dbAdapter`: The database adapter
- `minWorkers`: Minimum number of workers to keep running
- `maxWorkers`: Maximum number of workers to scale up to

#### Methods

##### `async start(): Promise<void>`

Starts the worker pool.

##### `async shutdown(): Promise<void>`

Shuts down the worker pool.

## Database Adapters

### PrismaAdapter

The `PrismaAdapter` class provides a Prisma-based implementation of the `DbAdapter` interface.

#### Constructor

```typescript
constructor(prisma?: PrismaClient)
```

- `prisma`: Optional PrismaClient instance. If not provided, a new instance will be created.

#### Methods

Implements all methods required by the `DbAdapter` interface, including:

- `connect()`: Connects to the database
- `disconnect()`: Disconnects from the database
- `createJob()`: Creates a new job
- `fetchNextJob()`: Fetches the next available job
- `fetchNextBatch()`: Fetches a batch of available jobs
- `completeJob()`: Marks a job as completed
- `failJob()`: Marks a job as failed
- `updateJobProgress()`: Updates the progress of a job
- `updateJobsBatch()`: Updates multiple jobs in a batch
- `heartbeat()`: Sends a heartbeat for a worker or job
- `getJobById()`: Gets a job by ID
- `listJobs()`: Lists jobs with filtering
- `cleanupStaleJobs()`: Cleans up stale jobs
- `storeResult()`: Stores the result of a job
- `getResult()`: Gets the result of a job
- `getQueueStats()`: Gets queue statistics
- `removeJobsByStatus()`: Removes jobs by status
- `getDetailedJobInfo()`: Gets detailed job information

And scheduler-related methods:

- `createScheduledJob()`: Creates a scheduled job
- `getScheduledJobById()`: Gets a scheduled job by ID
- `listScheduledJobs()`: Lists scheduled jobs with filtering
- `updateScheduledJob()`: Updates a scheduled job
- `deleteScheduledJob()`: Deletes a scheduled job
- `getScheduledJobsToRun()`: Gets scheduled jobs that need to be executed

## File Storage

### LocalFileStorage

The `LocalFileStorage` class provides a file system-based implementation of the `FileStorage` interface.

#### Constructor

```typescript
constructor(storagePath: string = path.join(process.cwd(), 'storage'))
```

- `storagePath`: Path to the storage directory

#### Methods

Implements all methods required by the `FileStorage` interface.

## Helper Functions

### `createQueue(): Queue`

Creates a new queue instance with the default database adapter.

### `createWorker(queue: Queue, dbAdapter: DbAdapter): Worker`

Creates a worker with environment-appropriate settings.

### `createWorkerPool(queue: Queue, dbAdapter: DbAdapter): WorkerPool`

Creates a worker pool with environment-appropriate settings.

### `createFileStorage(storagePath?: string): FileStorage`

Creates a file storage instance.

### `getConfig(): EnvironmentConfig`

Gets the configuration for the current environment.

### `isServerlessEnvironment(): boolean`

Determines if the current environment is serverless.

## Scheduler

The `Scheduler` class manages scheduled jobs, both one-time and recurring.

### Constructor

```typescript
constructor(db: DbAdapter, options?: { checkIntervalMs?: number })
```

- `db`: The database adapter
- `options`: Optional configuration
  - `checkIntervalMs`: How often to check for jobs to run (default: 60000ms)

### Methods

#### `async start(): Promise<void>`

Starts the scheduler.

#### `stop(): void`

Stops the scheduler.

#### `async scheduleJob(taskName: string, payload: any, options: ScheduleJobOptions): Promise<ScheduledJob>`

Schedules a one-time job to run at a specific time.

#### `async scheduleRecurringJob(taskName: string, payload: any, options: RecurringScheduleOptions): Promise<ScheduledJob>`

Schedules a recurring job using a cron pattern.

#### `async getScheduledJobById(id: string): Promise<ScheduledJob | null>`

Gets a scheduled job by ID.

#### `async listScheduledJobs(filter?: ScheduledJobFilter): Promise<ScheduledJob[]>`

Lists scheduled jobs with optional filtering.

#### `async updateScheduledJob(id: string, updates: Partial<ScheduleJobOptions | RecurringScheduleOptions>): Promise<ScheduledJob>`

Updates a scheduled job.

#### `async pauseScheduledJob(id: string): Promise<ScheduledJob>`

Pauses a scheduled job.

#### `async resumeScheduledJob(id: string): Promise<ScheduledJob>`

Resumes a paused scheduled job.

#### `async cancelScheduledJob(id: string): Promise<void>`

Cancels a scheduled job.

#### `getMetrics(): SchedulerMetrics`

Gets metrics about the scheduler.

#### `async rescheduleOverdueJobs(): Promise<number>`

Reschedules overdue jobs. Returns the number of jobs rescheduled.

#### `async cleanupCompletedScheduledJobs(beforeDate: Date): Promise<number>`

Cleans up completed scheduled jobs.

## Types and Interfaces

### Job Types

#### `JobStatus`

```typescript
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
```

#### `Job`

```typescript
interface Job {
  id: string;
  taskName: string;
  payload: any;
  status: JobStatus;
  priority: number;
  runAt: Date;
  attemptsMade: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  resultKey?: string;
  progress?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}
```

#### `JobOptions`

```typescript
interface JobOptions {
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}
```

#### `JobHelpers`

```typescript
interface JobHelpers {
  updateProgress: (progress: number) => Promise<void>;
  getJobDetails: () => Promise<Job>;
  storeResult: (result: any) => Promise<string>;
}
```

#### `JobHandler`

```typescript
type JobHandler = (payload: any, helpers: JobHelpers) => Promise<any>;
```

### Scheduled Job Types

#### `ScheduledJobType`

```typescript
type ScheduledJobType = 'one-time' | 'recurring';
```

#### `ScheduledJobStatus`

```typescript
type ScheduledJobStatus = 'scheduled' | 'paused' | 'completed' | 'cancelled';
```

#### `ScheduleJobOptions`

```typescript
interface ScheduleJobOptions {
  runAt: Date; // UTC date when the job should run
  priority?: number;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, any>; // Additional metadata for the scheduled job
}
```

#### `RecurringScheduleOptions`

```typescript
interface RecurringScheduleOptions {
  pattern: string; // Cron expression (e.g., "0 0 * * *" for daily at midnight UTC)
  startDate?: Date; // When to start the recurring schedule (default: now)
  endDate?: Date; // When to end the recurring schedule (optional)
  priority?: number;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, any>;
}
```

#### `ScheduledJob`

```typescript
interface ScheduledJob {
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
```

#### `ScheduledJobFilter`

```typescript
interface ScheduledJobFilter {
  type?: ScheduledJobType;
  status?: ScheduledJobStatus;
  taskName?: string;
  startDate?: Date; // Filter by jobs scheduled after this date
  endDate?: Date; // Filter by jobs scheduled before this date
  nextRunBefore?: Date; // Filter by jobs that will run before this date
  limit?: number; // Limit the number of results
  offset?: number; // Skip the first n results
}
```

#### `SchedulerMetrics`

```typescript
interface SchedulerMetrics {
  lastRunAt?: Date;
  averageRunTime?: number;
  jobsScheduledCount: number;
  jobsProcessedCount: number;
  errors: Array<{ timestamp: Date; message: string }>;
  status: 'running' | 'stopped';
}
```

### `DbAdapter`

```typescript
interface DbAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  createJob: (taskName: string, payload: any, options?: JobOptions) => Promise<Job>;
  fetchNextJob: (workerId: string, availableTasks: string[]) => Promise<Job | null>;
  fetchNextBatch: (workerId: string, availableTasks: string[], batchSize?: number) => Promise<Job[]>;
  completeJob: (jobId: string, resultKey?: string) => Promise<void>;
  failJob: (jobId: string, error: Error) => Promise<void>;
  updateJobProgress: (jobId: string, progress: number) => Promise<void>;
  updateJobsBatch: (updates: Array<{jobId: string, status?: JobStatus, progress?: number}>) => Promise<void>;
  heartbeat: (workerId: string, jobId?: string) => Promise<void>;
  getJobById: (jobId: string) => Promise<Job | null>;
  listJobs: (filter?: { status?: JobStatus; taskName?: string }) => Promise<Job[]>;
  cleanupStaleJobs: () => Promise<number>;
  storeResult: (jobId: string, result: any) => Promise<string>;
  getResult: (resultKey: string) => Promise<any>;
  getQueueStats: () => Promise<{
    pendingCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  }>;
}
```

### `FileStorage`

```typescript
interface FileStorage {
  getFile(identifier: string): Promise<Buffer>;
  getFileStream(identifier: string): Promise<ReadableStream>;
  storeFile(content: Buffer, metadata: any): Promise<string>;
  storeFileFromStream(stream: ReadableStream, identifier: string): Promise<string>;
  getWriteStream(identifier: string): Promise<WritableStream>;
}
```

### `Environment`

```typescript
type Environment = 'local' | 'vercel' | 'amplify' | 'other';
```

### `WorkerConfig`

```typescript
interface WorkerConfig {
  mode: 'continuous' | 'batch';
  pollInterval: number;
  maxExecutionTime: number;
  maxJobsPerBatch: number;
  minWorkers: number;
  maxWorkers: number;
}
```

### `EnvironmentConfig`

```typescript
interface EnvironmentConfig {
  worker: WorkerConfig;
}
```

## Events System

### `EventEmitter`

A basic event emitter implementation.

#### Methods

##### `on(event: string, listener: (...args: any[]) => void): void`

Registers an event listener.

##### `off(event: string, listener: (...args: any[]) => void): void`

Removes an event listener.

##### `emit(event: string, ...args: any[]): void`

Emits an event.

### `EventManager`

Manages job-related events.

#### Methods

##### `onJobCreated(listener: (job: Job) => void): void`

Registers a listener for when jobs are created.

##### `onJobCompleted(listener: (job: Job) => void): void`

Registers a listener for when jobs are completed.

##### `onJobFailed(listener: (job: Job, error: Error) => void): void`

Registers a listener for when jobs fail.

##### `onJobProgress(listener: (job: Job, progress: number) => void): void`

Registers a listener for when job progress is updated.

##### `emitJobCreated(job: Job): void`

Emits a job created event.

##### `emitJobCompleted(job: Job): void`

Emits a job completed event.

##### `emitJobFailed(job: Job, error: Error): void`

Emits a job failed event.

##### `emitJobProgress(job: Job, progress: number): void`

Emits a job progress event.
