import { Pool } from 'pg';

export interface SchemaIssue {
  type: 'missing_table' | 'missing_column' | 'invalid_type';
  table?: string;
  column?: string;
  expectedType?: string;
  message: string;
}

export interface SchemaVersion {
  version: string;
  sql: string;
}

export const REQUIRED_SCHEMA = {
  jobs: `
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY,
      task_name VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      scheduled_for TIMESTAMP WITH TIME ZONE,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      webhook_url TEXT,
      webhook_headers JSONB
    );
  `,
  job_events: `
    CREATE TABLE IF NOT EXISTS job_events (
      id UUID PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(id),
      event_type VARCHAR(50) NOT NULL,
      payload JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `
};

export const SCHEMA_VERSIONS: SchemaVersion[] = [
  {
    version: '1.0.0',
    sql: `
      ${REQUIRED_SCHEMA.jobs}
      ${REQUIRED_SCHEMA.job_events}
    `
  },
  {
    version: '1.1.0',
    sql: `
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS webhook_url TEXT;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS webhook_headers JSONB;
    `
  }
];

export async function createSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const [_tableName, sql] of Object.entries(REQUIRED_SCHEMA)) {
      await client.query(sql);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function inspectSchema(pool: Pool): Promise<SchemaIssue[]> {
  const issues: SchemaIssue[] = [];
  const client = await pool.connect();
  
  try {
    // Check if tables exist
    for (const tableName of Object.keys(REQUIRED_SCHEMA)) {
      const tableExists = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )`,
        [tableName]
      );
      
      if (!tableExists.rows[0].exists) {
        issues.push({
          type: 'missing_table',
          table: tableName,
          message: `Missing table '${tableName}'`
        });
        continue;
      }
      
      // Check columns for existing tables
      const columns = await client.query(
        `SELECT column_name, data_type 
         FROM information_schema.columns 
         WHERE table_name = $1`,
        [tableName]
      );
      
      const requiredColumns = getRequiredColumns(tableName);
      for (const [columnName, expectedType] of Object.entries(requiredColumns)) {
        const column = columns.rows.find(c => c.column_name === columnName);
        if (!column) {
          issues.push({
            type: 'missing_column',
            table: tableName,
            column: columnName,
            message: `Missing column '${columnName}' in table '${tableName}'`
          });
        } else if (column.data_type !== expectedType) {
          issues.push({
            type: 'invalid_type',
            table: tableName,
            column: columnName,
            expectedType,
            message: `Column '${columnName}' in table '${tableName}' has invalid type. Expected: ${expectedType}, Got: ${column.data_type}`
          });
        }
      }
    }
  } finally {
    client.release();
  }
  
  return issues;
}

export async function migrateSchema(
  pool: Pool,
  fromVersion: string,
  toVersion: string
): Promise<void> {
  const fromIndex = SCHEMA_VERSIONS.findIndex(v => v.version === fromVersion);
  const toIndex = SCHEMA_VERSIONS.findIndex(v => v.version === toVersion);
  
  if (fromIndex === -1 || toIndex === -1) {
    throw new Error(`Invalid version specified. Available versions: ${SCHEMA_VERSIONS.map(v => v.version).join(', ')}`);
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      await client.query(SCHEMA_VERSIONS[i].sql);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function exportSchema(): string {
  return Object.values(REQUIRED_SCHEMA).join('\n');
}

function getRequiredColumns(tableName: string): Record<string, string> {
  switch (tableName) {
    case 'jobs':
      return {
        id: 'uuid',
        task_name: 'character varying',
        payload: 'jsonb',
        status: 'character varying',
        created_at: 'timestamp with time zone',
        updated_at: 'timestamp with time zone',
        scheduled_for: 'timestamp with time zone',
        started_at: 'timestamp with time zone',
        completed_at: 'timestamp with time zone',
        error: 'text',
        retry_count: 'integer',
        max_retries: 'integer',
        webhook_url: 'text',
        webhook_headers: 'jsonb'
      };
    case 'job_events':
      return {
        id: 'uuid',
        job_id: 'uuid',
        event_type: 'character varying',
        payload: 'jsonb',
        created_at: 'timestamp with time zone'
      };
    default:
      return {};
  }
} 