# Deployment Guide for TurboMQ

This guide provides instructions for deploying and using the TurboMQ job queue system in different environments, with a focus on serverless platforms and the new job scheduling feature.

## Table of Contents

- [Local Development](#local-development)
- [Vercel Deployment](#vercel-deployment)
- [AWS Amplify Deployment](#aws-amplify-deployment)
- [Other Serverless Platforms](#other-serverless-platforms)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Job Processing Strategies](#job-processing-strategies)
- [Scheduler Deployment](#scheduler-deployment)

## Local Development

For local development, you can run a continuous worker process that processes jobs as they're added to the queue.

1. Set up your environment variables:

```
# .env.local
DATABASE_URL="file:./prisma/dev.db"
NEXT_RUNTIME_ENV="local"
```

2. Initialize the database:

```bash
npm run db:generate
npm run db:push
npm run db:setup
```

3. Start the worker pool:

```bash
npm run example:local-worker
# or
npm run dev
```

This will start a worker pool that automatically scales based on queue depth.

4. To use the scheduler feature, make sure to start it when initializing your queue:

```typescript
import { Queue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';

const adapter = new PrismaAdapter();
const queue = new Queue(adapter);

// Initialize the queue and start the scheduler
await queue.init();
// The scheduler starts automatically during init()
```

## Vercel Deployment

When deploying to Vercel, you'll need to use a different approach since Vercel doesn't support long-running processes.

### 1. Database Setup

Use a managed database service like Planetscale, Supabase, or Neon for your database instead of SQLite. Update your `prisma/schema.prisma` file accordingly:

```prisma
datasource db {
  provider = "mysql" // or "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2. Environment Variables

Set up the following environment variables in your Vercel project:

```
DATABASE_URL="your-database-connection-string"
NEXT_RUNTIME_ENV="vercel"
CRON_SECRET="your-secret-token-for-cron-jobs"
```

### 3. Job Processing with Vercel Cron Jobs

Vercel supports cron jobs that can trigger API endpoints on a schedule. Create a cron job to process your queue:

1. Add the following to your `vercel.json` file:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-queue?secret=your-secret-token",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This will call your processing endpoint every 5 minutes.

2. Make sure your cron endpoint is properly secured with the secret token.

### 4. Job Processing with Serverless Functions

For more frequent job processing, you can also trigger the job processor after a job is added:

```typescript
// When adding a job
const job = await queue.addJob('taskName', payload);

// Trigger the job processor
await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/queue/process-jobs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-cron-secret': process.env.CRON_SECRET
  }
});
```

## AWS Amplify Deployment

AWS Amplify is another popular serverless platform for Next.js applications.

### 1. Database Setup

Use Amazon RDS or Aurora for your database. Update your `prisma/schema.prisma` file:

```prisma
datasource db {
  provider = "postgresql" // or "mysql"
  url      = env("DATABASE_URL")
}
```

### 2. Environment Variables

Set up the following environment variables in your Amplify project:

```
DATABASE_URL="your-database-connection-string"
NEXT_RUNTIME_ENV="amplify"
CRON_SECRET="your-secret-token-for-cron-jobs"
```

### 3. Job Processing with EventBridge Scheduler

Use AWS EventBridge Scheduler to trigger your job processing endpoint on a schedule:

1. Create an EventBridge rule that triggers a Lambda function or HTTP endpoint
2. Configure the rule to run on a schedule (e.g., every 5 minutes)
3. Point the rule to your job processing endpoint with the secret token

## Other Serverless Platforms

For other serverless platforms, follow these general guidelines:

1. Use a managed database service
2. Set `NEXT_RUNTIME_ENV="other"` in your environment variables
3. Set up a scheduled job/cron to process your queue regularly
4. Secure your processing endpoint with a secret token

## Environment Configuration

The queue system automatically detects the environment and uses appropriate settings:

```typescript
import { getConfig, isServerlessEnvironment } from 'next-queue';

// Get environment-specific configuration
const config = getConfig();
console.log('Worker mode:', config.worker.mode);
console.log('Is serverless:', isServerlessEnvironment());
```

You can customize the configuration for each environment in `src/config.ts`.

## Database Setup

### PostgreSQL

For PostgreSQL, update your `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### MySQL

For MySQL, update your `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

After changing the database provider, run:

```bash
npx prisma generate
npx prisma db push
```

## Scheduler Deployment

The new scheduler feature in TurboMQ v1.4.0 allows you to schedule jobs to run at specific times or on recurring schedules using cron expressions. Here are deployment considerations for the scheduler:

### 1. Database Requirements

The scheduler requires a database that supports the `ScheduledJob` model. Make sure your Prisma schema includes this model and you've run migrations to create the necessary tables.

### 2. Serverless Environments

In serverless environments like Vercel or AWS Lambda, the scheduler needs special consideration:

#### Option 1: Dedicated Scheduler Service

Deploy a dedicated service (e.g., on a small VPS or container) that runs continuously to check for and execute scheduled jobs:

```typescript
// scheduler-service.js
import { Queue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';

async function startScheduler() {
  const adapter = new PrismaAdapter();
  const queue = new Queue(adapter);
  
  // Register task handlers
  queue.registerTask('dailyReport', async (payload) => {
    // Task implementation
  });
  
  // Initialize queue (starts the scheduler)
  await queue.init();
  
  console.log('Scheduler service started');
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down scheduler...');
    await queue.shutdown();
    process.exit(0);
  });
}

startScheduler().catch(console.error);
```

Run this with a process manager like PM2:

```bash
pm2 start scheduler-service.js --name "turbomq-scheduler"
pm2 save
pm2 startup
```

#### Option 2: Cron-Triggered Serverless Function

Use a cron job to trigger a serverless function that checks for and executes scheduled jobs:

```typescript
// pages/api/run-scheduler.ts (Next.js)
import { Queue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';

export default async function handler(req, res) {
  // Only allow this endpoint to be triggered by cron
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const adapter = new PrismaAdapter();
  const queue = new Queue(adapter);
  await queue.init();
  
  // Process any scheduled jobs that are due
  const metrics = await queue.getSchedulerMetrics();
  
  // Clean up old completed jobs (optional)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  await queue.cleanupCompletedScheduledJobs(thirtyDaysAgo);
  
  await queue.shutdown();
  
  res.status(200).json({ success: true, metrics });
}
```

Set up a cron job to hit this endpoint every minute:

```
* * * * * curl -H "x-cron-key: your-secret-key" https://your-app.vercel.app/api/run-scheduler
```

### 3. Monitoring

Monitor your scheduler using the metrics API:

```typescript
const metrics = await queue.getSchedulerMetrics();
console.log('Scheduler metrics:', metrics);
```

This provides information about job processing rates, errors, and scheduler status.

## Job Processing Strategies

### Strategy 1: Scheduled Processing

Process jobs on a regular schedule using cron jobs or scheduled functions. This is the simplest approach and works well for most use cases.

### Strategy 2: On-Demand Processing

Trigger job processing when a job is added to the queue. This provides faster processing but may result in more function invocations.

### Strategy 3: Hybrid Approach

Combine scheduled and on-demand processing:
- Use scheduled processing for regular cleanup and processing
- Use on-demand processing for high-priority jobs

### Strategy 4: Webhook Processing

For platforms that support webhooks, you can set up a webhook that triggers when a job is added to the queue.

## Advanced Configuration

### Custom Database Adapter

You can create a custom database adapter by implementing the `DbAdapter` interface:

```typescript
import { DbAdapter, Job, JobOptions, JobStatus } from 'next-queue';

export class CustomDbAdapter implements DbAdapter {
  // Implement all required methods
}
```

### Custom File Storage

For storing large job results, you can implement a custom file storage adapter:

```typescript
import { FileStorage } from 'next-queue';

export class CustomFileStorage implements FileStorage {
  // Implement all required methods
}
```
