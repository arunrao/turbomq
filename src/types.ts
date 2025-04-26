// Types
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Export scheduler types
export * from './types/scheduler.js';

export interface Job<T = any> {
  id: string;
  taskName: string;
  payload: T;
  status: JobStatus;
  priority?: number;
  runAt?: Date;
  attemptsMade?: number;
  maxAttempts?: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  retries: number;
  progress?: number;
  resultKey?: string;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}

export interface JobOptions {
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}

export interface JobHelpers<T = any> {
  updateProgress: (progress: number) => Promise<void>;
  getJobDetails: () => Promise<Job<T>>;
  storeResult: (result: any) => Promise<string>;
  cleanup?: () => Promise<void>;
}

export type JobHandler<T = any> = (payload: T, helpers: JobHelpers<T>) => Promise<any>;

export interface DbAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createJob<T = any>(taskName: string, payload: T, options?: JobOptions): Promise<Job<T>>;
  fetchNextJob(workerId: string, availableTasks: string[]): Promise<Job | null>;
  fetchNextBatch(workerId: string, availableTasks: string[], batchSize?: number): Promise<Job[]>;
  completeJob(jobId: string, resultKey?: string): Promise<void>;
  failJob(jobId: string, error: Error): Promise<void>;
  getJobById<T = any>(jobId: string): Promise<Job<T> | null>;
  updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void>;
  updateJobProgress(jobId: string, progress: number): Promise<void>;
  storeResult(jobId: string, result: any): Promise<string>;
  getResult(resultKey: string): Promise<any>;
  updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void>;
  heartbeat(workerId: string, jobId?: string): Promise<void>;
  listJobs<T = any>(filter?: { 
    status?: JobStatus; 
    taskName?: string;
    limit?: number;
    offset?: number;
    orderBy?: 'createdAt' | 'updatedAt' | 'runAt';
    order?: 'asc' | 'desc';
  }): Promise<Job<T>[]>;
  cleanupStaleJobs(): Promise<number>;
  getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }>;
  removeJobsByStatus(
    status: JobStatus,
    options?: {
      taskName?: string;
      beforeDate?: Date;
      limit?: number;
    }
  ): Promise<number>;
  getDetailedJobInfo(options?: {
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
  }>;
}

// Environment Configuration
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

// File Storage Interface
export interface FileStorage {
  store(key: string, data: any): Promise<void>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<void>;
}

export interface StorageAdapter {
  getFile(identifier: string): Promise<Buffer>;
  getFileStream(identifier: string): Promise<NodeJS.ReadableStream>;
  storeFile(content: Buffer, metadata: Record<string, any>): Promise<string>;
  storeFileStream(stream: NodeJS.ReadableStream, metadata: Record<string, any>): Promise<string>;
  deleteFile(identifier: string): Promise<void>;
}

export interface JobAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  inspectSchema(): Promise<void>;
  createJob(job: Job): Promise<void>;
  fetchNextJob(taskName: string): Promise<Job | null>;
  completeJob(jobId: string): Promise<void>;
  failJob(jobId: string, error: string): Promise<void>;
  removeJobsByStatus(status: JobStatus, options?: { 
    taskName?: string; 
    before?: Date;
    limit?: number;
  }): Promise<number>;
  getJobStats(): Promise<{ 
    byStatus: Record<string, number>; 
    byTask: Record<string, number> 
  }>;
}
