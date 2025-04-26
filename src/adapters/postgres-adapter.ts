import postgres from 'postgres';

export interface Job {
  id: string;
  taskName: string;
  status: JobStatus;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export class PostgresAdapter {
  private sql: postgres.Sql<Record<string, unknown>> | null = null;
  private staleJobTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  constructor(options?: { connectionString?: string; host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean }) {
    if (options?.connectionString) {
      this.sql = postgres(options.connectionString);
    } else if (options) {
      this.sql = postgres({
        host: options.host,
        port: options.port,
        database: options.database,
        username: options.username,
        password: options.password,
        ssl: options.ssl
      });
    }
  }

  async connect(options: { connectionString?: string; host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean }): Promise<void> {
    if (options.connectionString) {
      this.sql = postgres(options.connectionString);
    } else {
      this.sql = postgres({
        host: options.host,
        port: options.port,
        database: options.database,
        username: options.username,
        password: options.password,
        ssl: options.ssl
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
  }

  async addJob(job: Job): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.sql`
      INSERT INTO jobs (id, task_name, status, payload, created_at, updated_at)
      VALUES (${job.id}, ${job.taskName}, ${job.status}, ${JSON.stringify(job.payload)}, ${job.createdAt}, ${job.updatedAt})
    `;
  }

  async getJob(id: string): Promise<Job | null> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const [result] = await this.sql<Job[]>`
      SELECT id, task_name as "taskName", status, payload, created_at as "createdAt", updated_at as "updatedAt"
      FROM jobs
      WHERE id = ${id}
    `;
    
    return result || null;
  }

  async getJobsByStatus(status: JobStatus, taskName?: string): Promise<Job[]> {
    if (!this.sql) throw new Error('Not connected to database');
    
    if (taskName) {
      return await this.sql<Job[]>`
        SELECT id, task_name as "taskName", status, payload, created_at as "createdAt", updated_at as "updatedAt"
        FROM jobs
        WHERE status = ${status} AND task_name = ${taskName}
        ORDER BY created_at ASC
      `;
    }
    
    return await this.sql<Job[]>`
      SELECT id, task_name as "taskName", status, payload, created_at as "createdAt", updated_at as "updatedAt"
      FROM jobs
      WHERE status = ${status}
      ORDER BY created_at ASC
    `;
  }

  async updateJob(job: Job): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.sql`
      UPDATE jobs
      SET status = ${job.status},
          payload = ${JSON.stringify(job.payload)},
          updated_at = ${job.updatedAt}
      WHERE id = ${job.id}
    `;
  }

  async removeJob(id: string): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.sql`
      DELETE FROM jobs
      WHERE id = ${id}
    `;
  }

  async removeJobsByStatus(status: JobStatus, taskName?: string, before?: Date): Promise<number> {
    if (!this.sql) throw new Error('Not connected to database');
    
    let result;
    if (taskName && before) {
      result = await this.sql<{ count: number }[]>`
        DELETE FROM jobs
        WHERE status = ${status}
          AND task_name = ${taskName}
          AND created_at < ${before}
        RETURNING COUNT(*)
      `;
    } else if (taskName) {
      result = await this.sql<{ count: number }[]>`
        DELETE FROM jobs
        WHERE status = ${status}
          AND task_name = ${taskName}
        RETURNING COUNT(*)
      `;
    } else if (before) {
      result = await this.sql<{ count: number }[]>`
        DELETE FROM jobs
        WHERE status = ${status}
          AND created_at < ${before}
        RETURNING COUNT(*)
      `;
    } else {
      result = await this.sql<{ count: number }[]>`
        DELETE FROM jobs
        WHERE status = ${status}
        RETURNING COUNT(*)
      `;
    }
    
    return result[0]?.count || 0;
  }

  /**
   * Fetch the next available job for a worker
   */
  async fetchNextJob(_workerId: string, availableTasks: string[]): Promise<Job | null> {
    if (!this.sql) throw new Error('Not connected to database');
    if (availableTasks.length === 0) return null;
    
    // Get the next pending job for one of the available tasks
    const [job] = await this.sql<Job[]>`
      UPDATE jobs
      SET status = 'running', updated_at = NOW()
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND task_name = ANY(${availableTasks})
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, task_name as "taskName", status, payload, created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    return job || null;
  }

  /**
   * Fetch a batch of jobs for a worker
   */
  async fetchNextBatch(_workerId: string, availableTasks: string[], batchSize = 5): Promise<Job[]> {
    if (!this.sql) throw new Error('Not connected to database');
    if (availableTasks.length === 0) return [];
    
    // Get a batch of pending jobs for the available tasks
    const jobs = await this.sql<Job[]>`
      WITH batch AS (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND task_name = ANY(${availableTasks})
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE jobs
      SET status = 'running', updated_at = NOW()
      WHERE id IN (SELECT id FROM batch)
      RETURNING id, task_name as "taskName", status, payload, created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    return jobs;
  }

  /**
   * Update worker heartbeat
   */
  async heartbeat(_workerId: string, _jobId?: string): Promise<void> {
    // This is a no-op for PostgresAdapter as we don't track worker heartbeats
    // In a production environment, you might want to store worker heartbeats
    // to detect and recover from worker failures
  }

  /**
   * Clean up stale jobs that have been in the running state for too long
   */
  async cleanupStaleJobs(): Promise<number> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const staleTime = new Date(Date.now() - this.staleJobTimeoutMs);
    
    const result = await this.sql<{ count: number }[]>`
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'running'
        AND updated_at < ${staleTime}
      RETURNING COUNT(*)
    `;
    
    return result[0]?.count || 0;
  }
}
