import { DbAdapter, Job, JobOptions, JobStatus } from '../types';

// Extend Job type for testing
interface TestJob extends Job {
  workerId?: string;
}

export class TestAdapter implements DbAdapter {
  private jobs: Map<string, TestJob> = new Map();
  private results: Map<string, any> = new Map();

  async connect(): Promise<void> {
    // No-op for testing
  }

  async disconnect(): Promise<void> {
    // No-op for testing
  }

  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    const job: TestJob = {
      id: `test-${Date.now()}`,
      taskName,
      payload,
      status: 'pending',
      priority: options?.priority || 0,
      runAt: options?.runAt || new Date(),
      attemptsMade: 0,
      maxAttempts: options?.maxAttempts || 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      webhookUrl: options?.webhookUrl,
      webhookHeaders: options?.webhookHeaders
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async fetchNextJob(workerId: string, availableTasks: string[]): Promise<Job | null> {
    const now = new Date();
    const jobs = Array.from(this.jobs.values());
    const pendingJobs = jobs
      .filter((job: Job) => 
        job.status === 'pending' &&
        availableTasks.includes(job.taskName) &&
        (job.runAt || now) <= now
      )
      .sort((a: Job, b: Job) => (b.priority || 0) - (a.priority || 0));

    const job = pendingJobs[0];
    if (!job) return null;

    job.status = 'running';
    job.workerId = workerId;
    job.attemptsMade = (job.attemptsMade || 0) + 1;
    job.updatedAt = now;

    return job;
  }

  async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 5): Promise<Job[]> {
    const now = new Date();
    const jobs = Array.from(this.jobs.values())
      .filter((job: Job) => 
        job.status === 'pending' &&
        availableTasks.includes(job.taskName) &&
        (job.runAt || now) <= now
      )
      .sort((a: Job, b: Job) => (b.priority || 0) - (a.priority || 0))
      .slice(0, batchSize);

    for (const job of jobs) {
      job.status = 'running';
      job.workerId = workerId;
      job.attemptsMade = (job.attemptsMade || 0) + 1;
      job.updatedAt = now;
    }

    return jobs;
  }

  async completeJob(jobId: string, resultKey?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.resultKey = resultKey;
      job.completedAt = new Date();
      job.updatedAt = new Date();
    }
  }

  async failJob(jobId: string, error: Error): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.lastError = error.message;
      job.completedAt = new Date();
      job.updatedAt = new Date();
    }
  }

  async getJobById(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || null;
  }

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.lastError = error;
      job.updatedAt = new Date();
      if (status === 'completed' || status === 'failed') {
        job.completedAt = new Date();
      }
    }
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      job.updatedAt = new Date();
    }
  }

  async storeResult(jobId: string, result: any): Promise<string> {
    const resultKey = `result-${jobId}`;
    this.results.set(resultKey, result);
    return resultKey;
  }

  async getResult(resultKey: string): Promise<any> {
    return this.results.get(resultKey);
  }

  async updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void> {
    for (const update of updates) {
      const job = this.jobs.get(update.jobId);
      if (job) {
        if (update.status) {
          job.status = update.status;
          if (update.status === 'completed' || update.status === 'failed') {
            job.completedAt = new Date();
          }
        }
        if (update.progress !== undefined) {
          job.progress = update.progress;
        }
        job.updatedAt = new Date();
      }
    }
  }

  async heartbeat(_workerId: string, _jobId?: string): Promise<void> {
    // No-op for testing
  }

  async listJobs(filter?: { status?: JobStatus; taskName?: string }): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter(job => {
      if (filter?.status && job.status !== filter.status) return false;
      if (filter?.taskName && job.taskName !== filter.taskName) return false;
      return true;
    });
  }

  async cleanupStaleJobs(): Promise<number> {
    return 0; // No-op for testing
  }

  async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }> {
    const jobs = Array.from(this.jobs.values());
    return {
      pendingCount: jobs.filter(j => j.status === 'pending').length,
      runningCount: jobs.filter(j => j.status === 'running').length,
      completedCount: jobs.filter(j => j.status === 'completed').length,
      failedCount: jobs.filter(j => j.status === 'failed').length
    };
  }

  // Helper methods for testing
  getJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  clearJobs(): void {
    this.jobs.clear();
    this.results.clear();
  }
} 