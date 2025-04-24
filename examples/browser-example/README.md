# Browser Example

This example demonstrates how to use the Next Queue client library in a browser environment.

## Features

- Job creation and status tracking
- Real-time updates via WebSocket
- Progress tracking
- Webhook notifications
- Error handling
- Clean UI with status display

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
npm run setup-db
```

3. Start the development server:
```bash
npm run dev
```

## Usage

The example includes several components that demonstrate different aspects of the queue system:

### JobCreator

The `JobCreator` component shows how to use the `QueueClient` to create and track jobs:

```typescript
import { QueueClient } from 'next-queue/client';

// Create a client instance
const queue = new QueueClient();

// Create a job
const job = await queue.createJob('processFile', {
  fileName: 'test.pdf',
  fileSize: 1024
}, {
  priority: 1,
  maxAttempts: 3,
  webhookUrl: 'http://localhost:3000/api/webhook-receiver'
});

// Get job status
const status = await queue.getJobStatus(job.id);
```

### JobStatus

The `JobStatus` component demonstrates how to track job progress and handle updates:

```typescript
import { QueueClient } from 'next-queue/client';

// Create a client instance
const queue = new QueueClient();

// Get job status with polling
const status = await queue.getJobStatus(jobId);

// Get job result when completed
const result = await queue.getJobResult(jobId);
```

### WebhookListener

The `WebhookListener` component shows how to handle real-time updates via WebSocket:

```typescript
import { WebhookListener } from 'next-queue/client';

// Listen for job updates
<WebhookListener 
  jobId={jobId} 
  onJobUpdate={(data) => {
    console.log('Job updated:', data);
  }} 
/>
```

## API Endpoints

The example includes several API endpoints:

- `POST /api/jobs`: Create a new job
- `GET /api/jobs/:id`: Get job status
- `GET /api/jobs/:id/result`: Get job result
- `POST /api/webhook-receiver`: Receive webhook notifications

## Configuration

The example uses the following configuration:

- Database: PostgreSQL with Prisma
- WebSocket: Socket.IO
- File Storage: Local file system

## Learn More

- [Main Documentation](../../README.md)
- [API Reference](../../docs/API.md)
- [Contributing Guide](../../CONTRIBUTING.md)
