import postgres from 'postgres';
import { DbAdapter, Job, JobOptions, JobStatus } from '../../../src/types.js';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient } from '../../../src/schema.js';

type SqlType = ReturnType<typeof postgres>;

export interface PostgresAdapterConfig {
  connectionString?: string;
  ssl?: boolean;
  queryTimeout?: number; // Global query timeout in milliseconds
  connectTimeout?: number; // Connection timeout in milliseconds
  idleTimeout?: number; // Idle connection timeout in seconds
  maxConnections?: number; // Maximum number of connections
}

export class PostgresAdapter implements DbAdapter, DatabaseClient {
  private sql: SqlType | null = null;
  private connected = false;
  private readonly queryTimeout: number;

  constructor(config?: PostgresAdapterConfig) {
    this.queryTimeout = config?.queryTimeout ?? 30000; // Default 30 seconds
    this.sql = postgres(config?.connectionString || process.env.DATABASE_URL || '', {
      ssl: config?.ssl,
      max: config?.maxConnections ?? 10,
      idle_timeout: config?.idleTimeout ?? 20,
      connect_timeout: config?.connectTimeout ?? 10000, // Default 10 seconds
    });
  }

  // Helper method to execute queries with timeout
  private async executeWithTimeout<T>(query: Promise<T>, timeoutMs: number = this.queryTimeout): Promise<T> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([query, timeoutPromise]);
  }

  async connect(): Promise<void> {
    if (!this.connected && this.sql) {
      await this.executeWithTimeout(this.sql`SELECT 1`, 5000); // Shorter timeout for connection test
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.sql) {
      await this.sql.end();
      this.connected = false;
    }
  }

  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const id = uuidv4();
    
    const result = await this.executeWithTimeout(this.sql`
      INSERT INTO jobs (
        id, task_name, payload, status, priority, run_at, max_attempts,
        created_at, updated_at, webhook_url, webhook_headers
      ) VALUES (
        ${id},
        ${taskName},
        ${JSON.stringify(payload)},
        'pending',
        ${options?.priority ?? 0},
        ${options?.runAt ?? new Date()},
        ${options?.maxAttempts ?? 3},
        ${new Date()},
        ${new Date()},
        ${options?.webhookUrl ?? null},
        ${options?.webhookHeaders ? JSON.stringify(options.webhookHeaders) : null}
      )
      RETURNING *
    `);

    return this.mapDbRowToJob(result[0] as any);
  }

  async fetchNextJob(workerId: string, availableTasks: string[]): Promise<Job | null> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = 'running', worker_id = ${workerId}, attempts_made = attempts_made + 1,
          updated_at = NOW(), last_heartbeat = NOW()
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
        AND task_name = ANY(${availableTasks})
        AND run_at <= NOW()
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`);

    if ((result as any[]).length === 0) return null;
    return this.mapDbRowToJob((result as any[])[0]);
  }

  async fetchNextBatch(workerId: string, availableTasks: string[], batchSize = 5): Promise<Job[]> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = 'running', worker_id = ${workerId}, attempts_made = attempts_made + 1,
          updated_at = NOW(), last_heartbeat = NOW()
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'pending'
        AND task_name = ANY(${availableTasks})
        AND run_at <= NOW()
        ORDER BY priority DESC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`);

    return (result as any[]).map(this.mapDbRowToJob);
  }

  async completeJob(jobId: string, resultKey?: string): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
          result_key = ${resultKey ?? null}, worker_id = NULL
      WHERE id = ${jobId}`);
  }

  async failJob(jobId: string, error: Error): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = 'failed', last_error = ${error.message}, completed_at = NOW(),
          updated_at = NOW(), worker_id = NULL
      WHERE id = ${jobId}`);
  }

  async updateJobStatus(jobId: string, status: JobStatus, error?: string): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = ${status}, last_error = ${error ?? null}, updated_at = NOW(),
          completed_at = CASE WHEN ${status} IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE id = ${jobId}`);
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET progress = ${progress}, updated_at = NOW()
      WHERE id = ${jobId}`);
  }

  async updateJobsBatch(updates: Array<{ jobId: string; status?: JobStatus; progress?: number }>): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    // Use a transaction for batch updates with a longer timeout
    await this.executeWithTimeout(this.sql.begin(async (sql) => {
      for (const update of updates) {
        await sql`
          UPDATE jobs
          SET status = COALESCE(${update.status ?? null}, status),
              progress = COALESCE(${update.progress ?? null}, progress),
              updated_at = NOW(),
              completed_at = CASE WHEN ${update.status ?? null} IN ('completed', 'failed') THEN NOW() ELSE completed_at END
          WHERE id = ${update.jobId}`;
      }
    }), this.queryTimeout * 2); // Double timeout for batch operations
  }

  async getJobById(jobId: string): Promise<Job | null> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      SELECT * FROM jobs
      WHERE id = ${jobId}`);

    if ((result as any[]).length === 0) return null;
    return this.mapDbRowToJob((result as any[])[0]);
  }

  async storeResult(jobId: string, result: any): Promise<string> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const resultKey = `result-${jobId}-${uuidv4()}`;
    await this.executeWithTimeout(this.sql`
      INSERT INTO job_results (key, job_id, result)
      VALUES (${resultKey}, ${jobId}, ${JSON.stringify(result)})`);
    return resultKey;
  }

  async getResult(resultKey: string): Promise<any> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      SELECT result FROM job_results
      WHERE key = ${resultKey}`);

    if ((result as any[]).length === 0) return null;
    return JSON.parse((result as any[])[0].result);
  }

  async heartbeat(workerId: string, jobId?: string): Promise<void> {
    if (!this.sql) throw new Error('Not connected to database');
    
    await this.executeWithTimeout(this.sql`
      INSERT INTO worker_heartbeats (worker_id, current_job, last_seen)
      VALUES (${workerId}, ${jobId ?? null}, NOW())
      ON CONFLICT (worker_id) DO UPDATE
      SET current_job = ${jobId ?? null}, last_seen = NOW()`);
  }

  async listJobs(filter?: { status?: JobStatus; taskName?: string }): Promise<Job[]> {
    if (!this.sql) throw new Error('Not connected to database');
    
    let query = this.sql`SELECT * FROM jobs`;
    
    if (filter?.status && filter?.taskName) {
      query = this.sql`${query} WHERE status = ${filter.status} AND task_name = ${filter.taskName}`;
    } else if (filter?.status) {
      query = this.sql`${query} WHERE status = ${filter.status}`;
    } else if (filter?.taskName) {
      query = this.sql`${query} WHERE task_name = ${filter.taskName}`;
    }

    query = this.sql`${query} ORDER BY created_at DESC`;
    
    const result = await this.executeWithTimeout(query);
    return (result as any[]).map(this.mapDbRowToJob);
  }

  async cleanupStaleJobs(): Promise<number> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      UPDATE jobs
      SET status = 'failed', last_error = 'Job timed out',
          updated_at = NOW(), completed_at = NOW()
      WHERE status = 'running'
      AND last_heartbeat < NOW() - INTERVAL '5 minutes'
      RETURNING id`);
    return (result as any[]).length;
  }

  async getQueueStats(): Promise<{ pendingCount: number; runningCount: number; completedCount: number; failedCount: number }> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const result = await this.executeWithTimeout(this.sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'running') as running_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
      FROM jobs`);

    const stats = (result as any[])[0];
    return {
      pendingCount: parseInt(stats.pending_count) || 0,
      runningCount: parseInt(stats.running_count) || 0,
      completedCount: parseInt(stats.completed_count) || 0,
      failedCount: parseInt(stats.failed_count) || 0
    };
  }

  async removeJobsByStatus(
    status: JobStatus,
    options?: { taskName?: string; beforeDate?: Date; limit?: number }
  ): Promise<number> {
    if (!this.sql) throw new Error('Not connected to database');
    
    // First, get the IDs of jobs to be deleted
    let selectQuery = this.sql`SELECT id FROM jobs WHERE status = ${status}`;
    
    if (options?.taskName) {
      selectQuery = this.sql`${selectQuery} AND task_name = ${options.taskName}`;
    }
    
    if (options?.beforeDate) {
      selectQuery = this.sql`${selectQuery} AND created_at < ${options.beforeDate}`;
    }
    
    if (options?.limit) {
      selectQuery = this.sql`${selectQuery} LIMIT ${options.limit}`;
    }
    
    const jobsToDelete = await this.executeWithTimeout(selectQuery);
    const jobIds = (jobsToDelete as any[]).map(job => job.id);
    
    if (jobIds.length === 0) {
      return 0;
    }
    
    // Use a transaction to handle all foreign key constraints before deleting jobs
    return await this.executeWithTimeout(this.sql.begin(async (sql) => {
      // Clear references in worker_heartbeats table
      await sql`UPDATE worker_heartbeats SET current_job = NULL WHERE current_job = ANY(${jobIds})`;
      
      // Delete related job_results
      await sql`DELETE FROM job_results WHERE job_id = ANY(${jobIds})`;
      
      // Finally delete the jobs
      const result = await sql`DELETE FROM jobs WHERE id = ANY(${jobIds})`;
      return (result as any[]).length;
    }), this.queryTimeout * 2); // Double timeout for batch operations
  }

  async getDetailedJobInfo(options?: {
    status?: JobStatus;
    taskName?: string;
    limit?: number;
    offset?: number;
    includeResults?: boolean;
    includeErrors?: boolean;
    includeProgress?: boolean;
  }): Promise<{
    jobs: Job[];
    total: number;
    stats: {
      byStatus: Record<string, number>;
      byTask: Record<string, number>;
      averageProcessingTime?: number;
      successRate?: number;
    };
  }> {
    if (!this.sql) throw new Error('Not connected to database');
    
    let query = this.sql`SELECT * FROM jobs`;
    
    if (options?.status && options?.taskName) {
      query = this.sql`${query} WHERE status = ${options.status} AND task_name = ${options.taskName}`;
    } else if (options?.status) {
      query = this.sql`${query} WHERE status = ${options.status}`;
    } else if (options?.taskName) {
      query = this.sql`${query} WHERE task_name = ${options.taskName}`;
    }

    query = this.sql`${query} ORDER BY created_at DESC`;
    
    if (options?.limit) {
      query = this.sql`${query} LIMIT ${options.limit}`;
    }
    
    if (options?.offset) {
      query = this.sql`${query} OFFSET ${options.offset}`;
    }

    // Use a longer timeout for detailed job info since it makes multiple queries
    const [jobs, total, stats] = await this.executeWithTimeout(Promise.all([
      query,
      this.sql`SELECT COUNT(*) as count FROM jobs`,
      this.sql`
        SELECT status, task_name, COUNT(*) as count
        FROM jobs
        GROUP BY status, task_name`
    ]), this.queryTimeout * 2);

    const byStatus: Record<string, number> = {};
    const byTask: Record<string, number> = {};

    (stats as any[]).forEach((stat: { status: string; task_name: string; count: number }) => {
      byStatus[stat.status] = (byStatus[stat.status] || 0) + parseInt(String(stat.count));
      byTask[stat.task_name] = (byTask[stat.task_name] || 0) + parseInt(String(stat.count));
    });

    return {
      jobs: (jobs as any[]).map(this.mapDbRowToJob),
      total: parseInt((total as any[])[0].count),
      stats: { byStatus, byTask }
    };
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
      lastError: row.last_error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
      resultKey: row.result_key || undefined,
      progress: row.progress || undefined,
      webhookUrl: row.webhook_url || undefined,
      webhookHeaders: row.webhook_headers ? JSON.parse(row.webhook_headers) : undefined,
      retries: row.attempts_made || 0
    };
  }

  // DatabaseClient interface implementation
  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.sql) throw new Error('Not connected to database');
    const result = await this.executeWithTimeout(this.sql.unsafe(sql, params));
    
    // For schema inspection queries, ensure the result has the expected format
    if (sql.includes('EXISTS') && sql.includes('information_schema.tables')) {
      return { rows: [{ exists: result[0]?.exists || false }] };
    }
    
    // For column inspection queries
    if (sql.includes('information_schema.columns')) {
      return { rows: result.map((row: any) => ({
        column_name: row.column_name,
        data_type: row.data_type
      })) };
    }
    
    return result;
  }
} 