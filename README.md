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
import { createQueue, PrismaAdapter } from 'turbomq';

const queue = await createQueue(new PrismaAdapter());

// Add a job
const job = await queue.addJob('send-email', {
  to: 'user@example.com',
  subject: 'Welcome!'
});

// Get job status
const status = await queue.getJobStatus(job.id);

// Get active jobs count
const activeJobs = queue.getActiveJobsCount();
console.log(`Currently running jobs: ${activeJobs}`);

// Get list of active job IDs
const activeJobIds = queue.getActiveJobIds();
console.log('Active job IDs:', activeJobIds);

// Kill a specific job
try {
  await queue.killJob(job.id, 'Job taking too long');
  console.log('Job killed successfully');
} catch (error) {
  console.error('Failed to kill job:', error.message);
}

// Kill multiple jobs
try {
  await queue.killJobs(['job1', 'job2'], 'Batch cleanup');
  console.log('Jobs killed successfully');
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
