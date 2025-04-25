# Schema Management

TurboMQ provides built-in schema management features to help you set up and maintain your database schema.

## Automatic Schema Creation

You can automatically create the required database schema when initializing the PostgreSQL adapter:

```typescript
const adapter = await createPostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  createSchema: true, // Automatically create required tables
});
```

## Schema Inspection

You can inspect your database schema to check for any missing tables or columns:

```typescript
const schemaIssues = await turbomq.inspectSchema(connectionString);
if (schemaIssues.length > 0) {
  console.log("Database schema issues:", schemaIssues);
}
```

The inspection will report any of the following issues:
- Missing tables
- Missing columns
- Invalid column types

Example output:
```
Database schema issues: [
  {
    type: "missing_column",
    table: "jobs",
    column: "webhook_url",
    message: "Missing column 'webhook_url' in table 'jobs'"
  }
]
```

## Schema Migration

TurboMQ supports schema migrations to update your database from one version to another:

```typescript
await turbomq.migrateSchema({
  connectionString,
  fromVersion: '1.0.0',
  toVersion: '1.2.0'
});
```

Available versions:
- 1.0.0: Initial schema with basic job management
- 1.1.0: Added webhook support

## Schema Export

You can export the required schema as SQL:

```typescript
const sql = turbomq.exportSchema();
console.log(sql);
```

## Graceful Shutdown

TurboMQ provides graceful shutdown support to ensure all jobs are properly completed:

```typescript
await queue.shutdown({ 
  timeout: 5000, // Wait up to 5 seconds for jobs to complete
  force: false   // Don't force shutdown if jobs are still running
});
```

Options:
- `timeout`: Maximum time to wait for jobs to complete (default: 5000ms)
- `force`: If true, force shutdown even if jobs are still running (default: false)

## Required Schema

The following tables are required for TurboMQ to function:

### jobs table
- id (UUID PRIMARY KEY)
- task_name (VARCHAR)
- payload (JSONB)
- status (VARCHAR)
- priority (INTEGER)
- run_at (TIMESTAMP WITH TIME ZONE)
- attempts_made (INTEGER)
- max_attempts (INTEGER)
- last_error (TEXT)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
- completed_at (TIMESTAMP WITH TIME ZONE)
- result_key (TEXT)
- progress (INTEGER)
- webhook_url (TEXT)
- webhook_headers (JSONB)
- worker_id (TEXT)
- last_heartbeat (TIMESTAMP WITH TIME ZONE)

### job_events table
- id (UUID PRIMARY KEY)
- job_id (UUID NOT NULL REFERENCES jobs(id))
- event_type (VARCHAR)
- payload (JSONB)
- created_at (TIMESTAMP WITH TIME ZONE)

### worker_heartbeats table
- worker_id (TEXT PRIMARY KEY)
- current_job (TEXT)
- last_seen (TIMESTAMP WITH TIME ZONE) 