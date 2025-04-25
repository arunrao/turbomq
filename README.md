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

## Installation

```bash
npm install turbomq
```

For PostgreSQL support (optional):
```bash
npm install pg pg-pool
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

## API Reference

### Queue

```typescript
interface Queue {
  addJob(taskName: string, payload: any, options?: JobOptions): Promise<Job>;
  getJobStatus(jobId: string): Promise<Job>;
  getJobResult(jobId: string): Promise<any>;
  listJobs(filter?: JobFilter): Promise<Job[]>;
  getQueueStats(): Promise<QueueStats>;
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

### Database Adapters

#### PrismaAdapter
Uses Prisma ORM for database operations. Requires Prisma setup.

#### PostgresAdapter
Direct PostgreSQL connection. Requires `pg` and `pg-pool` packages.

```typescript
interface PostgresConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  // ... other pg-pool options
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
