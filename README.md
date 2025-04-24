# Next Queue

A simple and powerful job queue system for Next.js applications. This library provides a robust solution for handling background jobs, file processing, and other asynchronous tasks in your Next.js application.

## Features

- 🚀 Simple and intuitive API
- 🔄 Real-time job status updates via WebSocket
- 📊 Progress tracking for long-running jobs
- 🔄 Automatic retries with exponential backoff
- 🔒 Type-safe with TypeScript
- 🎯 Priority-based job processing
- 🌐 Webhook support for job notifications
- 📦 Prisma integration for reliable job storage

## Installation

```bash
npm install next-queue
# or
yarn add next-queue
```

## Quick Start

1. First, set up your Prisma schema:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql" // or "mysql" or "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Job {
  id              String      @id @default(uuid())
  taskName        String
  payload         String
  status          String      @default("pending")
  priority        Int         @default(0)
  runAt           DateTime    @default(now())
  attemptsMade    Int         @default(0)
  maxAttempts     Int         @default(3)
  lastError       String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  completedAt     DateTime?
  resultKey       String?
  progress        Int?
  webhookUrl      String?
  webhookHeaders  String?
  workerId        String?
  lastHeartbeat   DateTime?
}

model JobResult {
  id        String   @id @default(uuid())
  key       String   @unique
  jobId     String
  result    String
  createdAt DateTime @default(now())
}

model WorkerHeartbeat {
  workerId    String   @id
  currentJob  String?
  lastSeen    DateTime @default(now())
}
```

2. Create your job handlers:

```typescript
// lib/job-types.ts
import { JobType } from 'next-queue';

const processFileHandler = async (payload: any, helpers: any) => {
  console.log('Processing file:', payload);
  await helpers.updateProgress(50);
  // Your file processing logic here
  await helpers.updateProgress(100);
  return { success: true };
};

export const projectJobTypes: JobType[] = [
  {
    name: 'processFile',
    description: 'Process an uploaded file',
    handler: processFileHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 1
    }
  }
];
```

3. Initialize the queue in your Next.js API:

```typescript
// pages/api/queue.ts
import { createQueue } from 'next-queue';
import { PrismaAdapter } from 'next-queue/adapters/prisma';
import { projectJobTypes } from '../../lib/job-types';

const queue = createQueue(new PrismaAdapter());

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { taskName, payload, options } = req.body;
    const job = await queue.addJob(taskName, payload, options);
    res.status(200).json(job);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

4. Use the queue in your frontend:

```typescript
// components/FileUpload.tsx
import { QueueClient } from 'next-queue/client';

const queueClient = new QueueClient();

export default function FileUpload() {
  const handleUpload = async (file: File) => {
    const job = await queueClient.uploadFile(file, {
      priority: 1,
      maxAttempts: 3
    });
    console.log('Job created:', job);
  };

  return (
    <input
      type="file"
      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
    />
  );
}
```

## Advanced Examples

### 1. Image Processing Pipeline

```typescript
// lib/job-types.ts
import { JobType } from 'next-queue';
import sharp from 'sharp';

const imageProcessingHandler = async (payload: any, helpers: any) => {
  const { imageUrl, operations } = payload;
  
  // Download image
  await helpers.updateProgress(10);
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  
  // Process image
  let image = sharp(Buffer.from(buffer));
  
  // Apply operations
  for (const op of operations) {
    switch (op.type) {
      case 'resize':
        image = image.resize(op.width, op.height);
        break;
      case 'crop':
        image = image.extract(op);
        break;
      case 'rotate':
        image = image.rotate(op.angle);
        break;
    }
    await helpers.updateProgress(30 + (operations.indexOf(op) * 20));
  }
  
  // Save result
  const result = await image.toBuffer();
  await helpers.updateProgress(100);
  
  return { 
    success: true,
    result: result.toString('base64')
  };
};

export const projectJobTypes: JobType[] = [
  {
    name: 'processImage',
    description: 'Process and transform images',
    handler: imageProcessingHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 2
    }
  }
];
```

### 2. Email Campaign System

```typescript
// lib/job-types.ts
import { JobType } from 'next-queue';
import nodemailer from 'nodemailer';

const emailCampaignHandler = async (payload: any, helpers: any) => {
  const { recipients, template, subject } = payload;
  const transporter = nodemailer.createTransport({
    // Your email configuration
  });
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < recipients.length; i++) {
    try {
      await transporter.sendMail({
        to: recipients[i],
        subject,
        html: template
      });
      successCount++;
    } catch (error) {
      failCount++;
    }
    
    await helpers.updateProgress((i + 1) / recipients.length * 100);
  }
  
  return {
    success: true,
    stats: {
      total: recipients.length,
      success: successCount,
      failed: failCount
    }
  };
};

export const projectJobTypes: JobType[] = [
  {
    name: 'sendEmailCampaign',
    description: 'Send email campaign to multiple recipients',
    handler: emailCampaignHandler,
    defaultOptions: {
      maxAttempts: 5,
      priority: 1
    }
  }
];
```

### 3. Data Export System

```typescript
// lib/job-types.ts
import { JobType } from 'next-queue';
import { PrismaClient } from '@prisma/client';

const dataExportHandler = async (payload: any, helpers: any) => {
  const { model, filters, format } = payload;
  const prisma = new PrismaClient();
  
  // Fetch data
  await helpers.updateProgress(20);
  const data = await prisma[model].findMany({
    where: filters
  });
  
  // Process data
  await helpers.updateProgress(40);
  let processedData;
  switch (format) {
    case 'csv':
      processedData = convertToCSV(data);
      break;
    case 'json':
      processedData = JSON.stringify(data);
      break;
    case 'excel':
      processedData = convertToExcel(data);
      break;
  }
  
  // Store result
  await helpers.updateProgress(80);
  const resultKey = await helpers.storeResult(processedData);
  
  await helpers.updateProgress(100);
  return {
    success: true,
    resultKey,
    recordCount: data.length
  };
};

export const projectJobTypes: JobType[] = [
  {
    name: 'exportData',
    description: 'Export data in various formats',
    handler: dataExportHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 2
    }
  }
];
```

### 4. Real-time Progress Tracking

```typescript
// components/JobProgress.tsx
import { useState, useEffect } from 'react';
import { QueueClient } from 'next-queue/client';

const queueClient = new QueueClient();

export default function JobProgress({ jobId }: { jobId: string }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  
  useEffect(() => {
    const checkProgress = async () => {
      const job = await queueClient.getJobStatus(jobId);
      setProgress(job.progress || 0);
      setStatus(job.status);
      
      if (job.status === 'completed' || job.status === 'failed') {
        return;
      }
      
      setTimeout(checkProgress, 1000);
    };
    
    checkProgress();
  }, [jobId]);
  
  return (
    <div>
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p>Status: {status}</p>
      <p>Progress: {progress}%</p>
    </div>
  );
}
```

### 5. Scheduled Jobs

```typescript
// lib/scheduled-jobs.ts
import { QueueClient } from 'next-queue/client';

const queueClient = new QueueClient();

export async function scheduleDailyReport() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  await queueClient.createJob('generateReport', {
    reportType: 'daily',
    date: new Date().toISOString()
  }, {
    runAt: tomorrow,
    priority: 1
  });
}

export async function scheduleWeeklyCleanup() {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(0, 0, 0, 0);
  
  await queueClient.createJob('cleanupOldData', {
    olderThan: '7d'
  }, {
    runAt: nextWeek,
    priority: 3
  });
}
```

## API Reference

### Queue Client

```typescript
const client = new QueueClient();

// Create a job
const job = await client.createJob('taskName', payload, options);

// Upload a file
const job = await client.uploadFile(file, options);

// Get job status
const status = await client.getJobStatus(jobId);

// Get job result
const result = await client.getJobResult(jobId);

// List jobs
const jobs = await client.listJobs({ status: 'pending' });

// Get queue stats
const stats = await client.getQueueStats();
```

### Job Options

```typescript
interface JobOptions {
  priority?: number;        // Higher priority jobs run first
  runAt?: Date;            // Schedule job for future execution
  maxAttempts?: number;    // Maximum number of retry attempts
  webhookUrl?: string;     // URL to notify when job completes
  webhookHeaders?: Record<string, string>; // Headers for webhook
}
```

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT
