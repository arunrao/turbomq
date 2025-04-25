import { Queue } from './queue';
import { Worker } from './worker';
import { WorkerPool } from './worker-pool';
import { PrismaAdapter } from './adapters/prisma-adapter';
import { PostgresAdapter } from './adapters/postgres-adapter';
import { LocalFileStorage } from './adapters/file-storage-adapter';
import { getConfig, isServerlessEnvironment } from './config';
import { QueueClient } from './client';
import { TestAdapter } from './testing/test-adapter';
import { createTestQueue, createTestJob, createTestJobResult, createTestWorkerHeartbeat } from './testing/test-utils';
import { 
  Job, 
  JobOptions, 
  JobStatus, 
  JobHandler, 
  DbAdapter, 
  FileStorage,
  JobHelpers
} from './types';

// Main function to create queue instance
function createQueue(adapter?: DbAdapter): Queue {
  const dbAdapter = adapter || new PrismaAdapter();
  return new Queue(dbAdapter);
}

// Function to create a PostgreSQL adapter
function createPostgresAdapter(options?: {
  connectionString?: string;
  ssl?: boolean;
  staleJobThresholdMs?: number;
}): PostgresAdapter {
  return new PostgresAdapter(options);
}

// Function to create worker based on environment
function createWorker(queue: Queue, dbAdapter: DbAdapter): Worker {
  const config = getConfig();
  const { pollInterval, maxExecutionTime } = config.worker;
  
  return new Worker(
    queue, 
    dbAdapter, 
    pollInterval, 
    config.worker.mode === 'continuous' ? 0 : maxExecutionTime
  );
}

// Function to create worker pool for local development
function createWorkerPool(queue: Queue, dbAdapter: DbAdapter): WorkerPool {
  const config = getConfig();
  const { minWorkers, maxWorkers } = config.worker;
  
  return new WorkerPool(queue, dbAdapter, minWorkers, maxWorkers);
}

// Function to create a file storage instance
function createFileStorage(storagePath?: string): FileStorage {
  return new LocalFileStorage(storagePath);
}

// Export main components
export {
  Queue,
  Worker,
  WorkerPool,
  PrismaAdapter,
  PostgresAdapter,
  LocalFileStorage,
  createQueue,
  createWorker,
  createWorkerPool,
  createFileStorage,
  createPostgresAdapter,
  getConfig,
  isServerlessEnvironment,
  QueueClient,
  // Testing utilities
  TestAdapter,
  createTestQueue,
  createTestJob,
  createTestJobResult,
  createTestWorkerHeartbeat
};

export type {
  Job,
  JobOptions,
  JobStatus,
  JobHandler,
  JobHelpers,
  DbAdapter,
  FileStorage
};
