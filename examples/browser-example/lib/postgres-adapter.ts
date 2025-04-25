import { Pool } from 'pg';
import { DbAdapter, Job, JobOptions, JobStatus } from '../../../src/types';
import { v4 as uuidv4 } from 'uuid';

export class PostgresAdapter implements DbAdapter {
  private pool: Pool;
  private connected = false;

  constructor(config?: { connectionString?: string; ssl?: boolean }) {
    this.pool = new Pool({
      connectionString: config?.connectionString || process.env.DATABASE_URL,
      ssl: config?.ssl
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.pool.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.pool.end();
      this.connected = false;
    }
  }

  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    const job: Job = {
      id: uuidv4(),
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

    await this.pool.query(
      `INSERT INTO jobs (
        id, task_name, payload, status, priority, run_at, max_attempts,
        webhook_url, webhook_headers, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        job.id,
        job.taskName,
        JSON.stringify(job.payload),
        job.status,
        job.priority,
        job.runAt,
        job.maxAttempts,
        job.webhookUrl,
        job.webhookHeaders ? JSON.stringify(job.webhookHeaders) : null,
        job.createdAt,
        job.updatedAt
      ]
    );

    return job;
  }

  async fetchNextJob(workerId: string, availableTasks: string[]): Promise<Job | null> {
    const result = await this.pool.query(
      `UPDATE jobs
       SET status = 'running', worker_id = $1, attempts_made = attempts_made + 1,
           updated_at = NOW(), last_heartbeat = NOW()
       WHERE id = (
         SELECT id FROM jobs
         WHERE status = 'pending'
         AND task_name = ANY($2)
         AND run_at <= NOW()
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId, availableTasks]
    );

    if (result.rows.length === 0) return null;
    return this.mapDbRowToJob(result.rows[0]);
  }

  async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 5): Promise<Job[]> {
    const result = await this.pool.query(
      `UPDATE jobs
       SET status = 'running', worker_id = $1, attempts_made = attempts_made + 1,
           updated_at = NOW(), last_heartbeat = NOW()
       WHERE id IN (
         SELECT id FROM jobs
         WHERE status = 'pending'
         AND task_name = ANY($2)
         AND run_at <= NOW()
         ORDER BY priority DESC, created_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId, availableTasks, batchSize]
    );

    return result.rows.map(this.mapDbRowToJob);
  }

  async completeJob(jobId: string, resultKey?: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
       SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
           result_key = $1, worker_id = NULL
       WHERE id = $2`,
      [resultKey, jobId]
    );
  }

  async failJob(jobId: string, error: Error): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
       SET status = 'failed', last_error = $1, completed_at = NOW(),
           updated_at = NOW(), worker_id = NULL
       WHERE id = $2`,
      [error.message, jobId]
    );
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await this.pool.query(
      'UPDATE jobs SET progress = $1, updated_at = NOW() WHERE id = $2',
      [progress, jobId]
    );
  }

  async getJobById(jobId: string): Promise<Job | null> {
    const result = await this.pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) return null;
    return this.mapDbRowToJob(result.rows[0]);
  }

  async storeResult(jobId: string, result: any): Promise<string> {
    const resultKey = `result-${jobId}-${uuidv4()}`;
    await this.pool.query(
      'INSERT INTO job_results (key, job_id, result) VALUES ($1, $2, $3)',
      [resultKey, jobId, JSON.stringify(result)]
    );
    return resultKey;
  }

  async getResult(resultKey: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT result FROM job_results WHERE key = $1',
      [resultKey]
    );

    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].result);
  }

  async updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        await client.query(
          `UPDATE jobs
           SET status = COALESCE($1, status),
               progress = COALESCE($2, progress),
               updated_at = NOW(),
               completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
           WHERE id = $3`,
          [update.status, update.progress, update.jobId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(workerId: string, jobId?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO worker_heartbeats (worker_id, current_job, last_seen)
       VALUES ($1, $2, NOW())
       ON CONFLICT (worker_id) DO UPDATE
       SET current_job = $2, last_seen = NOW()`,
      [workerId, jobId]
    );
  }

  async listJobs(filter?: { status?: JobStatus; taskName?: string }): Promise<Job[]> {
    let query = 'SELECT * FROM jobs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.status) {
      conditions.push('status = $1');
      params.push(filter.status);
    }
    if (filter?.taskName) {
      conditions.push('task_name = $' + (params.length + 1));
      params.push(filter.taskName);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapDbRowToJob);
  }

  async cleanupStaleJobs(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE jobs
       SET status = 'failed', last_error = 'Job timed out',
           updated_at = NOW(), completed_at = NOW()
       WHERE status = 'running'
       AND last_heartbeat < NOW() - INTERVAL '5 minutes'
       RETURNING id`
    );
    return result.rowCount || 0;
  }

  async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'running') as running_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
      FROM jobs
    `);

    const stats = result.rows[0];
    return {
      pendingCount: parseInt(stats.pending_count) || 0,
      runningCount: parseInt(stats.running_count) || 0,
      completedCount: parseInt(stats.completed_count) || 0,
      failedCount: parseInt(stats.failed_count) || 0
    };
  }

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
       SET status = $1, last_error = $2, updated_at = NOW(),
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $3`,
      [status, error, jobId]
    );
  }

  private mapDbRowToJob(row: any): Job {
    return {
      id: row.id,
      taskName: row.task_name,
      payload: JSON.parse(row.payload),
      status: row.status as JobStatus,
      priority: row.priority,
      runAt: row.run_at,
      attemptsMade: row.attempts_made,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      resultKey: row.result_key,
      progress: row.progress,
      webhookUrl: row.webhook_url,
      webhookHeaders: row.webhook_headers ? JSON.parse(row.webhook_headers) : undefined
    };
  }
} 