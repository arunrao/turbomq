# Regular Job Lifecycle Example

This document provides a complete example of the full lifecycle of a regular (non-scheduled) job in TurboMQ, from queue initialization to job completion and cleanup.

## Setting Up the Queue

First, you need to initialize the queue with a database adapter:

```typescript
import { Queue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';
import { PrismaClient } from '@prisma/client';

// Initialize the database adapter
const prisma = new PrismaClient();
const adapter = new PrismaAdapter(prisma);

// Create the queue
const queue = new Queue(adapter);

// Initialize the queue (connects to the database)
await queue.init();
```

## Registering Task Handlers

Before you can add jobs, you need to register task handlers:

```typescript
// Register a task handler for sending emails
queue.registerTask('sendEmail', async (payload, helpers) => {
  // Get access to job helpers
  const { updateProgress, getJobDetails, storeResult } = helpers;
  
  // Log the start of processing
  console.log(`Processing email job: ${payload.to}`);
  
  // Update progress to 10%
  await updateProgress(10);
  
  // Simulate email validation
  console.log('Validating email address...');
  if (!payload.to.includes('@')) {
    throw new Error('Invalid email address');
  }
  
  // Update progress to 30%
  await updateProgress(30);
  
  // Simulate connecting to email service
  console.log('Connecting to email service...');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Update progress to 50%
  await updateProgress(50);
  
  // Simulate sending the email
  console.log(`Sending email to ${payload.to}...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update progress to 100%
  await updateProgress(100);
  
  // Store the result
  const resultKey = await storeResult({
    delivered: true,
    timestamp: new Date().toISOString()
  });
  
  // Return the result (this will be stored automatically)
  return {
    success: true,
    message: `Email sent to ${payload.to}`,
    resultKey
  };
});

// Register a task handler for image processing
queue.registerTask('processImage', async (payload, helpers) => {
  const { updateProgress } = helpers;
  
  // Simulate image processing with progress updates
  for (let i = 0; i <= 10; i++) {
    await updateProgress(i * 10);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return {
    success: true,
    processedImageUrl: `https://example.com/processed/${payload.imageId}`
  };
});
```

## Adding Jobs to the Queue

Now you can add jobs to the queue:

```typescript
// Add a job to send an email
const emailJob = await queue.addJob('sendEmail', {
  to: 'user@example.com',
  subject: 'Welcome to our service',
  body: 'Thank you for signing up!'
}, {
  priority: 10, // Higher priority
  maxAttempts: 3, // Retry up to 3 times if it fails
  // Optional webhook for notifications
  webhookUrl: 'https://example.com/webhooks/job-updates',
  webhookHeaders: {
    'Authorization': 'Bearer your-secret-token'
  }
});

console.log(`Email job created with ID: ${emailJob.id}`);

// Add a job to process an image, scheduled to run in the future
const imageJob = await queue.addJob('processImage', {
  imageId: '12345',
  filters: ['resize', 'sharpen']
}, {
  runAt: new Date(Date.now() + 60000), // Run 1 minute from now
  priority: 5
});

console.log(`Image processing job created with ID: ${imageJob.id}`);
```

## Setting Up a Worker

To process jobs, you need to set up a worker:

```typescript
import { Worker } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';
import { PrismaClient } from '@prisma/client';

// Initialize the database adapter
const prisma = new PrismaClient();
const adapter = new PrismaAdapter(prisma);

// Create a worker with a unique ID
const worker = new Worker({
  id: 'worker-' + Math.random().toString(36).substring(2, 9),
  db: adapter,
  concurrency: 5, // Process up to 5 jobs concurrently
  pollInterval: 5000, // Poll for new jobs every 5 seconds
});

// Register the same task handlers as the queue
worker.registerTask('sendEmail', async (payload, helpers) => {
  // Same implementation as above
  // ...
});

worker.registerTask('processImage', async (payload, helpers) => {
  // Same implementation as above
  // ...
});

// Start the worker
await worker.start();

console.log('Worker started successfully');
```

## Monitoring Jobs

You can monitor jobs using various methods:

```typescript
// Get a specific job by ID
const job = await queue.getJobById(emailJob.id);
console.log(`Job status: ${job.status}, progress: ${job.progress}%`);

// List all pending jobs
const pendingJobs = await queue.listJobs({ status: 'pending' });
console.log(`There are ${pendingJobs.length} pending jobs`);

// Get detailed job information with statistics
const jobInfo = await queue.getDetailedJobInfo({
  includeProgress: true,
  includeErrors: true
});

console.log(`Total jobs: ${jobInfo.total}`);
console.log(`Jobs by status: ${JSON.stringify(jobInfo.stats.byStatus)}`);
console.log(`Jobs by task: ${JSON.stringify(jobInfo.stats.byTask)}`);

// Get queue statistics
const stats = await queue.getQueueStats();
console.log(`Queue stats: ${JSON.stringify(stats)}`);

// Get active job IDs
const activeJobIds = queue.getActiveJobIds();
console.log(`Currently active jobs: ${activeJobIds.join(', ')}`);
```

## Handling Job Results

You can retrieve the results of completed jobs:

```typescript
// Wait for the job to complete
// In a real application, you might use events or polling
await new Promise(resolve => setTimeout(resolve, 5000));

// Get the job again to check its status
const completedJob = await queue.getJobById(emailJob.id);

if (completedJob.status === 'completed' && completedJob.resultKey) {
  // Retrieve the job result
  const result = await queue.getJobResult(completedJob.resultKey);
  console.log(`Job result: ${JSON.stringify(result)}`);
}
```

## Controlling Jobs

You can control jobs that are in progress:

```typescript
// Kill a specific job
await queue.killJob(imageJob.id, 'Job cancelled by user');

// Kill multiple jobs
await queue.killJobs([job1.id, job2.id], 'Batch cancellation');

// Find jobs by status with additional filtering
const failedJobs = await queue.findJobsByStatus('failed', {
  taskName: 'sendEmail',
  limit: 10,
  orderBy: 'createdAt',
  order: 'desc'
});

// Remove old completed jobs
const removedCount = await queue.removeJobsByStatus('completed', {
  beforeDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Older than 7 days
});
console.log(`Removed ${removedCount} old completed jobs`);
```

## Event Listeners

You can register event listeners to be notified when job status changes:

```typescript
// Listen for job creation
queue.onJobCreated(job => {
  console.log(`Job created: ${job.id}, task: ${job.taskName}`);
});

// Listen for job completion
queue.onJobCompleted(job => {
  console.log(`Job completed: ${job.id}`);
});

// Listen for job failures
queue.onJobFailed((job, error) => {
  console.error(`Job failed: ${job.id}, error: ${error.message}`);
});

// Listen for job progress updates
queue.onJobProgress((job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});
```

## Graceful Shutdown

When your application is shutting down, you should gracefully stop the worker and queue:

```typescript
// Stop the worker first
await worker.gracefulShutdown(10000); // Wait up to 10 seconds for jobs to complete

// Then shut down the queue
await queue.shutdown({
  timeout: 5000, // Wait up to 5 seconds
  force: false   // Don't force shutdown if jobs are still running
});

console.log('Worker and queue shut down successfully');
```

## Complete Example

Here's a complete example that puts it all together:

```typescript
import { Queue, Worker } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';
import { PrismaClient } from '@prisma/client';

async function main() {
  try {
    // Initialize the database adapter
    const prisma = new PrismaClient();
    const adapter = new PrismaAdapter(prisma);
    
    // Create and initialize the queue
    const queue = new Queue(adapter);
    await queue.init();
    
    // Register task handlers
    queue.registerTask('sendEmail', async (payload, helpers) => {
      const { updateProgress } = helpers;
      console.log(`Processing email to: ${payload.to}`);
      
      // Simulate work with progress updates
      for (let i = 1; i <= 10; i++) {
        await updateProgress(i * 10);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return { success: true, message: `Email sent to ${payload.to}` };
    });
    
    // Set up event listeners
    queue.onJobCompleted(job => {
      console.log(`Job ${job.id} completed`);
    });
    
    queue.onJobFailed((job, error) => {
      console.error(`Job ${job.id} failed: ${error.message}`);
    });
    
    // Add a job
    const job = await queue.addJob('sendEmail', {
      to: 'user@example.com',
      subject: 'Hello from TurboMQ'
    });
    
    console.log(`Job created with ID: ${job.id}`);
    
    // Create and start a worker
    const worker = new Worker({
      id: 'worker-' + Math.random().toString(36).substring(2, 9),
      db: adapter,
      concurrency: 2,
      pollInterval: 1000
    });
    
    // Register the same task handler
    worker.registerTask('sendEmail', async (payload, helpers) => {
      const { updateProgress } = helpers;
      console.log(`Worker processing email to: ${payload.to}`);
      
      for (let i = 1; i <= 10; i++) {
        await updateProgress(i * 10);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return { success: true, message: `Email sent to ${payload.to}` };
    });
    
    // Start the worker
    await worker.start();
    console.log('Worker started');
    
    // Wait for the job to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check job status
    const processedJob = await queue.getJobById(job.id);
    console.log(`Job status: ${processedJob.status}`);
    
    if (processedJob.status === 'completed' && processedJob.resultKey) {
      const result = await queue.getJobResult(processedJob.resultKey);
      console.log(`Job result: ${JSON.stringify(result)}`);
    }
    
    // Get queue statistics
    const stats = await queue.getQueueStats();
    console.log(`Queue stats: ${JSON.stringify(stats)}`);
    
    // Graceful shutdown
    console.log('Shutting down...');
    await worker.gracefulShutdown();
    await queue.shutdown();
    console.log('Shutdown complete');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

This example demonstrates the complete lifecycle of a regular job in TurboMQ, from queue initialization to job completion and cleanup.
