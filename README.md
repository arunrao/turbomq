# TurboMQ

A powerful job queue system for Next.js applications, built with TypeScript and Prisma.

[![npm version](https://badge.fury.io/js/turbomq.svg)](https://badge.fury.io/js/turbomq)
[![GitHub license](https://img.shields.io/github/license/arunrao/turbomq)](https://github.com/arunrao/turbomq/blob/main/LICENSE)

## Features

- 🚀 Real-time job status updates via WebSocket
- 📊 Multiple database adapters (Prisma, PostgreSQL)
- 🔄 Automatic job retries with exponential backoff
- 📈 Progress tracking and webhook notifications
- 🛡️ TypeScript support with full type definitions
- 🔍 Job monitoring and debugging tools
- 🔄 Automatic schema migration and validation
- 🛑 Robust graceful shutdown with timeout support

## What's New in v1.4.0

- 📅 Added job scheduling feature with one-time and recurring jobs
- ⏰ Support for cron expressions to define recurring job patterns
- 🔄 Automatic handling of scheduled job execution
- 📊 Enhanced statistics API for both regular and scheduled jobs
- 🌐 All scheduling operations use UTC time for consistency
- 📝 Comprehensive documentation with examples for scheduled jobs
- 🔧 Improved database schema with dedicated ScheduledJob model

## Installation

```bash
npm install turbomq
```

For PostgreSQL support (optional):
```bash
npm install pg pg-pool
```

For WebSocket support (required for real-time updates):
```bash
npm install socket.io socket.io-client
```

## Quick Start

### Using Prisma (Default)

```typescript
import { createQueue, PrismaAdapter } from 'turbomq';

// Create a queue instance with Prisma
const dbAdapter = new PrismaAdapter();
const queue = await createQueue(dbAdapter);

// Add a job
const job = await queue.addJob('process-file', {
  fileId: '123',
  options: { priority: 1 }
});

// Get job status
const status = await queue.getJobStatus(job.id);
```

### Using PostgreSQL Directly

```typescript
import { createQueue, PostgresAdapter } from 'turbomq';

// Create a queue instance with PostgreSQL
const dbAdapter = new PostgresAdapter({
  host: 'localhost',
  port: 5432,
  database: 'your_database',
  user: 'your_user',
  password: 'your_password'
});
const queue = await createQueue(dbAdapter);

// Add a job
const job = await queue.addJob('process-file', {
  fileId: '123',
  options: { priority: 1 }
});

// Get job status
const status = await queue.getJobStatus(job.id);
```

## Database Adapters

### PrismaAdapter (Default)
- Works in both browser and Node.js environments
- Uses Prisma ORM for database operations
- Requires Prisma setup
- Recommended for most use cases

### PostgresAdapter
- **Important**: Only works in Node.js environments, not in browsers
- Direct PostgreSQL connection
- Requires `pg` and `pg-pool` packages
- Better performance for high-throughput applications
- Not suitable for browser-based applications

## Schema Management

TurboMQ provides automatic schema management:

```typescript
// Run schema migration
npm run migrate
```

The migration script will:
1. Inspect the current schema
2. Identify missing tables and columns
3. Apply necessary migrations
4. Validate the schema

### Schema Validation

The system validates the schema on startup and reports any issues:
- Missing tables
- Missing columns
- Invalid column types

## Graceful Shutdown

TurboMQ provides robust shutdown support:

```typescript
// Graceful shutdown with timeout
await queue.shutdown({
  timeout: 5000,  // 5 seconds
  force: false    // Don't force shutdown if jobs are still running
});
```

Features:
- Waits for active jobs to complete
- Configurable timeout
- Force option for emergency shutdown
- Proper database disconnection
- Detailed logging

## Browser Example

Check out the [browser example](examples/browser-example) for a complete implementation using:
- Next.js for the frontend
- SQLite for data storage
- Socket.IO for real-time updates
- Prisma for database operations

The browser example demonstrates:
- Job creation and status tracking
- Real-time updates via WebSocket
- Progress tracking
- Webhook notifications
- Error handling

## API Reference

### Queue

```typescript
interface Queue {
  addJob(taskName: string, payload: any, options?: JobOptions): Promise<Job>;
  getJobStatus(jobId: string): Promise<Job>;
  getJobResult(jobId: string): Promise<any>;
  listJobs(filter?: JobFilter): Promise<Job[]>;
  getQueueStats(): Promise<QueueStats>;
  shutdown(options?: ShutdownOptions): Promise<void>;
  getActiveJobsCount(): number;
  getActiveJobIds(): string[];
  killJob(jobId: string, reason?: string): Promise<void>;
  killJobs(jobIds: string[], reason?: string): Promise<void>;
}
```

### Job Options

```typescript
interface JobOptions {
  priority?: number;
  maxAttempts?: number;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}
```

### Shutdown Options

```typescript
interface ShutdownOptions {
  timeout?: number;  // Default: 5000ms
  force?: boolean;   // Default: false
}
```

## Examples

### Basic Usage

```typescript
import { createQueue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';

// Create a database adapter
const adapter = new PrismaAdapter();

// Create a queue
const queue = createQueue(adapter);

// Register a task handler
queue.registerTask('sendEmail', async (payload) => {
  // Send email logic here
  return { success: true };
});

// Add a job to the queue
const job = await queue.addJob('sendEmail', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Hello from TurboMQ!'
});

// Start processing jobs
await queue.startProcessing();
```

## Job Management API

TurboMQ provides a comprehensive API for managing jobs:

```typescript
// Query jobs by status
const pendingJobs = await queue.listJobs({ status: 'pending' });

// Remove jobs by status (with optional filters)
await queue.removeJobsByStatus('failed', { 
  beforeDate: new Date('2025-01-01'),
  limit: 100
});

// Get detailed job information
const jobInfo = await queue.getDetailedJobInfo({
  status: 'completed',
  taskName: 'sendEmail',
  limit: 10,
  offset: 0,
  includeResults: true
});

// Update job progress
await queue.updateJobProgress(jobId, 50); // 50% complete

// Bulk update jobs
await queue.updateJobsBatch([
  { jobId: 'job1', status: 'completed' },
  { jobId: 'job2', progress: 75 }
]);
```

## Module System Compatibility

TurboMQ v1.3.5 provides improved compatibility with both ESM and CommonJS module systems:

```typescript
// ESM import
import { createQueue } from 'turbomq';
import { PostgresAdapter } from 'turbomq/adapters/postgres-adapter';

// CommonJS require
const { createQueue } = require('turbomq');
const { PostgresAdapter } = require('turbomq/adapters/postgres-adapter');
```

The package includes proper TypeScript typings for all exports, making it easy to use in TypeScript projects with full IntelliSense support.

## Queue Administration

TurboMQ includes tools for queue administration and maintenance:

```typescript
// Get queue statistics
const stats = await queue.getQueueStats();
console.log(`Pending: ${stats.pendingCount}, Running: ${stats.runningCount}`);

// Clean up stale jobs
const cleanedCount = await queue.cleanupStaleJobs();
console.log(`Cleaned up ${cleanedCount} stale jobs`);

// Graceful shutdown with options
await queue.shutdown({ 
  timeout: 30000,  // Wait up to 30 seconds for jobs to complete
  force: false     // Don't force shutdown if jobs are still running
});

// Kill multiple jobs
try {
  const result = await queue.killJobs(['job1', 'job2'], 'Batch kill');
  console.log(`Successfully killed ${result.success.length} jobs`);
  if (result.failed.length > 0) {
    console.warn(`Failed to kill ${result.failed.length} jobs`);
  }
} catch (error) {
  console.error('Failed to kill jobs:', error.message);
}
```

### With Webhooks

```typescript
const job = await queue.addJob('process-file', {
  fileId: '123'
}, {
  webhookUrl: 'https://api.example.com/webhooks',
  webhookHeaders: {
    'Authorization': 'Bearer token'
  }
});
```

### Real-time Updates

```typescript
import { WebhookListener } from 'turbomq';

function JobStatus({ jobId }) {
  const [status, setStatus] = useState(null);

  return (
    <WebhookListener
      jobId={jobId}
      onJobUpdate={(data) => setStatus(data)}
    />
  );
}
```

## Testing

```typescript
import { createTestQueue } from 'turbomq/testing';

describe('Queue Tests', () => {
  let queue;

  beforeEach(async () => {
    queue = await createTestQueue();
  });

  it('should process jobs', async () => {
    const job = await queue.addJob('test-task', { data: 'test' });
    expect(job.status).toBe('pending');
  });
});
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
