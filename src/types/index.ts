/**
 * Core types for the Next.js queue system
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
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

export interface JobOptions {
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}

export interface JobHelpers {
  updateProgress: (progress: number) => Promise<void>;
  getJobDetails: () => Promise<Job>;
  storeResult: (result: any) => Promise<string>;
}

export type JobHandler = (payload: any, helpers: JobHelpers) => Promise<any>;

export interface DbAdapter {
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

export type Environment = 'local' | 'vercel' | 'amplify' | 'other';

export interface WorkerConfig {
  mode: 'continuous' | 'batch';
  pollInterval: number;
  maxExecutionTime: number; // 0 for no limit
  maxJobsPerBatch: number;
  minWorkers: number;
  maxWorkers: number;
}

export interface EnvironmentConfig {
  worker: WorkerConfig;
}

export interface FileStorage {
  getFile(identifier: string): Promise<Buffer>;
  getFileStream(identifier: string): Promise<ReadableStream>;
  storeFile(content: Buffer, metadata: any): Promise<string>;
  storeFileFromStream(stream: ReadableStream, identifier: string): Promise<string>;
  getWriteStream(identifier: string): Promise<WritableStream>;
}
