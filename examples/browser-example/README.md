# Browser Example

This example demonstrates how to use the queue system in a browser environment.

## Database Adapters

### SQLite (Default)
- Used by default in this browser example
- Works in both browser and Node.js environments
- No additional configuration needed

### PostgreSQL
- Available as an optional adapter
- **Important**: Only works in Node.js environments, not in browsers
- If you need PostgreSQL:
  1. Install the pg package: `npm install pg`
  2. Set up your database connection string in .env
  3. Use the PostgresAdapter in your Node.js code

## Why SQLite for Browser?
The browser example uses SQLite because:
1. It works in browser environments
2. Doesn't require external database connections
3. Avoids WebSocket implementation issues that occur with PostgreSQL in browsers

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
npm run db:setup
```

3. Start the development server:
```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run cleanup` - Clean up the database
- `npm run schema:check` - Check database schema
- `npm run db:setup` - Set up database and schema

## Features

- Job queue management
- Real-time job status updates
- Progress tracking
- Webhook notifications
- Job result storage

## Architecture

The example uses:
- Next.js for the frontend
- SQLite for data storage
- Socket.IO for real-time updates
- Prisma for database operations

## Environment Variables

Create a `.env` file with:
```
DATABASE_URL="file:./prisma/dev.db"
NEXT_RUNTIME_ENV="development"
```

## Contributing

Feel free to submit issues and enhancement requests!

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
