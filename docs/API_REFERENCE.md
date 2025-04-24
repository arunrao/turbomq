# API Reference for Next.js Queue System

This document provides a comprehensive reference for all the components, classes, and methods available in the Next.js Queue System.

## Table of Contents

- [Core Components](#core-components)
  - [Queue](#queue)
  - [Worker](#worker)
  - [WorkerPool](#workerpool)
- [Database Adapters](#database-adapters)
  - [PrismaAdapter](#prismaadapter)
- [File Storage](#file-storage)
  - [LocalFileStorage](#localfilestorage)
- [Helper Functions](#helper-functions)
- [Types and Interfaces](#types-and-interfaces)
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

##### `async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number; }>`

Gets statistics about the queue.

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
constructor()
```

#### Methods

Implements all methods required by the `DbAdapter` interface.

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

## Types and Interfaces

### `JobStatus`

```typescript
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
```

### `Job`

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
}
```

### `JobOptions`

```typescript
interface JobOptions {
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}
```

### `JobHelpers`

```typescript
interface JobHelpers {
  updateProgress: (progress: number) => Promise<void>;
  getJobDetails: () => Promise<Job>;
  storeResult: (result: any) => Promise<string>;
}
```

### `JobHandler`

```typescript
type JobHandler = (payload: any, helpers: JobHelpers) => Promise<any>;
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
