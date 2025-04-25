import postgres from 'postgres';

export interface Job {
  id: string;
  taskName: string;
  status: JobStatus;
  data: unknown;
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
      INSERT INTO jobs (id, task_name, status, data, created_at, updated_at)
      VALUES (${job.id}, ${job.taskName}, ${job.status}, ${JSON.stringify(job.data)}, ${job.createdAt}, ${job.updatedAt})
    `;
  }

  async getJob(id: string): Promise<Job | null> {
    if (!this.sql) throw new Error('Not connected to database');
    
    const [result] = await this.sql<Job[]>`
      SELECT id, task_name as "taskName", status, data, created_at as "createdAt", updated_at as "updatedAt"
      FROM jobs
      WHERE id = ${id}
    `;
    
    return result || null;
  }

  async getJobsByStatus(status: JobStatus, taskName?: string): Promise<Job[]> {
    if (!this.sql) throw new Error('Not connected to database');
    
    if (taskName) {
      return await this.sql<Job[]>`
        SELECT id, task_name as "taskName", status, data, created_at as "createdAt", updated_at as "updatedAt"
        FROM jobs
        WHERE status = ${status} AND task_name = ${taskName}
        ORDER BY created_at ASC
      `;
    }
    
    return await this.sql<Job[]>`
      SELECT id, task_name as "taskName", status, data, created_at as "createdAt", updated_at as "updatedAt"
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
          data = ${JSON.stringify(job.data)},
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
}
