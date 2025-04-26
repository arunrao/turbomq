# Scheduled Job Examples

This document provides examples of how to use the job scheduling feature in TurboMQ, including one-time scheduled jobs and recurring jobs with cron patterns.

## Setting Up the Queue with Scheduler

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

// Initialize the queue (connects to the database and starts the scheduler)
await queue.init();
```

## Registering Task Handlers

Before you can schedule jobs, you need to register task handlers:

```typescript
// Register a task handler for generating reports
queue.registerTask('generateReport', async (payload, helpers) => {
  const { updateProgress } = helpers;
  
  console.log(`Generating ${payload.reportType} report...`);
  
  // Update progress to 10%
  await updateProgress(10);
  
  // Simulate report generation
  console.log('Collecting data...');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Update progress to 50%
  await updateProgress(50);
  
  // Simulate report formatting
  console.log('Formatting report...');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Update progress to 100%
  await updateProgress(100);
  
  // Return the result
  return {
    success: true,
    reportUrl: `https://example.com/reports/${payload.reportType}-${new Date().toISOString()}.pdf`
  };
});

// Register a task handler for database maintenance
queue.registerTask('databaseMaintenance', async (payload, helpers) => {
  const { updateProgress } = helpers;
  
  console.log('Running database maintenance...');
  
  // Simulate maintenance tasks with progress updates
  for (let i = 0; i <= 10; i++) {
    await updateProgress(i * 10);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return {
    success: true,
    tablesOptimized: payload.tables || ['all'],
    timestamp: new Date().toISOString()
  };
});
```

## Scheduling One-Time Jobs

You can schedule a job to run once at a specific time:

```typescript
// Schedule a report to be generated tomorrow at 8:00 AM UTC
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(8, 0, 0, 0); // 8:00:00.000 AM

const scheduledReport = await queue.scheduleJob('generateReport', {
  reportType: 'monthly-summary',
  parameters: {
    month: new Date().getMonth(),
    year: new Date().getFullYear()
  }
}, {
  runAt: tomorrow,
  priority: 10,
  maxAttempts: 3,
  webhookUrl: 'https://example.com/webhooks/report-complete',
  webhookHeaders: {
    'Authorization': 'Bearer your-secret-token'
  },
  metadata: {
    department: 'Finance',
    requestedBy: 'John Doe'
  }
});

console.log(`Scheduled report job with ID: ${scheduledReport.id}`);
console.log(`Will run at: ${scheduledReport.runAt}`);
```

## Scheduling Recurring Jobs

You can schedule jobs to run on a recurring basis using cron patterns:

```typescript
// Schedule a database maintenance job to run every Sunday at 2:00 AM UTC
const recurringMaintenance = await queue.scheduleRecurringJob('databaseMaintenance', {
  tables: ['users', 'orders', 'products'],
  optimizationLevel: 'full'
}, {
  pattern: '0 2 * * 0', // Cron pattern: At 2:00 AM, only on Sunday
  startDate: new Date(), // Start from now
  // Optional end date
  endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Run for 1 year
  priority: 5,
  maxAttempts: 2,
  metadata: {
    description: 'Weekly database optimization',
    createdBy: 'System Admin'
  }
});

console.log(`Scheduled recurring maintenance job with ID: ${recurringMaintenance.id}`);
console.log(`Next run at: ${recurringMaintenance.nextRunAt}`);

// Schedule a daily report to be generated every weekday at 6:00 AM UTC
const dailyReport = await queue.scheduleRecurringJob('generateReport', {
  reportType: 'daily-transactions',
  parameters: {
    format: 'pdf',
    includeCharts: true
  }
}, {
  pattern: '0 6 * * 1-5', // At 6:00 AM, Monday through Friday
  priority: 8,
  maxAttempts: 3
});

console.log(`Scheduled daily report job with ID: ${dailyReport.id}`);
```

## Managing Scheduled Jobs

You can manage scheduled jobs using various methods:

```typescript
// Get a specific scheduled job by ID
const job = await queue.getScheduledJobById(scheduledReport.id);
console.log(`Job status: ${job.status}, next run: ${job.nextRunAt}`);

// List all scheduled jobs
const allJobs = await queue.listScheduledJobs();
console.log(`There are ${allJobs.length} scheduled jobs`);

// List scheduled jobs with filtering
const pendingJobs = await queue.listScheduledJobs({
  status: 'scheduled',
  taskName: 'generateReport',
  nextRunBefore: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24 hours
});
console.log(`There are ${pendingJobs.length} reports scheduled in the next 24 hours`);

// Update a scheduled job
const updatedJob = await queue.updateScheduledJob(dailyReport.id, {
  pattern: '0 7 * * 1-5', // Change time to 7:00 AM
  priority: 10 // Increase priority
});
console.log(`Updated job, next run at: ${updatedJob.nextRunAt}`);

// Pause a scheduled job
const pausedJob = await queue.pauseScheduledJob(recurringMaintenance.id);
console.log(`Paused job status: ${pausedJob.status}`);

// Resume a paused job
const resumedJob = await queue.resumeScheduledJob(recurringMaintenance.id);
console.log(`Resumed job status: ${resumedJob.status}`);

// Cancel a scheduled job
await queue.cancelScheduledJob(scheduledReport.id);
console.log('One-time job cancelled');
```

## Scheduler Metrics and Maintenance

You can get metrics about the scheduler and perform maintenance:

```typescript
// Get scheduler metrics
const metrics = await queue.getSchedulerMetrics();
console.log(`Scheduler metrics: ${JSON.stringify(metrics, null, 2)}`);

// Reschedule any overdue jobs (useful after system downtime)
const rescheduledCount = await queue.rescheduleOverdueJobs();
console.log(`Rescheduled ${rescheduledCount} overdue jobs`);

// Clean up old completed scheduled jobs
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const cleanedUpCount = await queue.cleanupCompletedScheduledJobs(thirtyDaysAgo);
console.log(`Cleaned up ${cleanedUpCount} old completed scheduled jobs`);
```

## Event Listeners for Scheduled Jobs

You can register event listeners to be notified about scheduled job events:

```typescript
// Listen for scheduled job creation
queue.onScheduledJobCreated(job => {
  console.log(`Scheduled job created: ${job.id}, task: ${job.taskName}`);
});

// Listen for scheduled job execution
queue.onScheduledJobExecuted(job => {
  console.log(`Scheduled job executed: ${job.id}`);
});

// Listen for scheduled job status changes
queue.onScheduledJobStatusChanged((job, oldStatus, newStatus) => {
  console.log(`Job ${job.id} status changed from ${oldStatus} to ${newStatus}`);
});
```

## Complete Example

Here's a complete example that puts it all together:

```typescript
import { Queue } from 'turbomq';
import { PrismaAdapter } from 'turbomq/adapters/prisma-adapter';
import { PrismaClient } from '@prisma/client';

async function main() {
  try {
    // Initialize the database adapter
    const prisma = new PrismaClient();
    const adapter = new PrismaAdapter(prisma);
    
    // Create and initialize the queue (starts the scheduler)
    const queue = new Queue(adapter);
    await queue.init();
    
    // Register task handlers
    queue.registerTask('sendDailyNewsletter', async (payload, helpers) => {
      const { updateProgress } = helpers;
      console.log(`Preparing newsletter for ${payload.subscriberCount} subscribers`);
      
      // Simulate work with progress updates
      for (let i = 1; i <= 10; i++) {
        await updateProgress(i * 10);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return { 
        success: true, 
        sentCount: payload.subscriberCount,
        timestamp: new Date().toISOString()
      };
    });
    
    // Set up event listeners
    queue.onScheduledJobExecuted(job => {
      console.log(`Scheduled job ${job.id} executed at ${new Date().toISOString()}`);
    });
    
    // Schedule a recurring daily newsletter job
    const newsletterJob = await queue.scheduleRecurringJob('sendDailyNewsletter', {
      subscriberCount: 5000,
      template: 'daily-digest',
      subject: 'Your Daily News Digest'
    }, {
      pattern: '0 8 * * *', // Every day at 8:00 AM UTC
      priority: 10,
      maxAttempts: 3,
      metadata: {
        description: 'Daily newsletter delivery',
        department: 'Marketing'
      }
    });
    
    console.log(`Scheduled newsletter job with ID: ${newsletterJob.id}`);
    console.log(`Next run at: ${newsletterJob.nextRunAt}`);
    
    // List all scheduled jobs
    const scheduledJobs = await queue.listScheduledJobs();
    console.log(`Current scheduled jobs: ${scheduledJobs.length}`);
    
    // For demonstration purposes, let's simulate the passage of time
    // and manually trigger the scheduler to check for jobs
    console.log('Simulating scheduler check for jobs...');
    
    // In a real application, the scheduler would run automatically
    // Here we're just demonstrating how to get metrics
    const metrics = await queue.getSchedulerMetrics();
    console.log('Scheduler metrics:', metrics);
    
    // Cleanup when done with the example
    console.log('Cleaning up...');
    await queue.cancelScheduledJob(newsletterJob.id);
    await queue.shutdown();
    console.log('Shutdown complete');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## Common Cron Patterns for Scheduling

Here are some common cron patterns you can use with `scheduleRecurringJob`:

| Pattern | Description |
|---------|-------------|
| `0 * * * *` | Every hour at minute 0 |
| `0 0 * * *` | Daily at midnight UTC |
| `0 8 * * *` | Daily at 8:00 AM UTC |
| `0 0 * * 0` | Weekly on Sunday at midnight UTC |
| `0 0 1 * *` | Monthly on the 1st at midnight UTC |
| `0 0 1 1 *` | Yearly on January 1st at midnight UTC |
| `*/15 * * * *` | Every 15 minutes |
| `0 9-17 * * 1-5` | Hourly from 9 AM to 5 PM, Monday to Friday |
| `0 0 1,15 * *` | Twice monthly on the 1st and 15th at midnight UTC |

Remember that all times are in UTC. Adjust your cron patterns accordingly if you need to target specific local time zones.

This example demonstrates the complete lifecycle of scheduled jobs in TurboMQ, from queue initialization to job scheduling, management, and cleanup.
