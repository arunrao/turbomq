import { createQueue, createWorkerPool, PrismaAdapter } from '../src';

// Example of running a worker pool in a local development environment
async function startWorkerPool() {
  // Create queue instance with the Prisma adapter
  const dbAdapter = new PrismaAdapter();
  const queue = createQueue(dbAdapter);
  
  // Initialize the queue (this also starts the scheduler)
  await queue.init();
  
  // Register task handlers
  queue.registerTask('sendEmail', async (payload: { to: string; subject: string; body: string }, helpers) => {
    console.log('Processing email job:', payload);
    await helpers.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await helpers.updateProgress(100);
    return { success: true, messageId: `msg_${Date.now()}` };
  });
  
  queue.registerTask('processUpload', async (payload: { userId: string; files: string[] }, helpers) => {
    console.log('Processing upload job:', payload);
    await helpers.updateProgress(25);
    await new Promise(resolve => setTimeout(resolve, 500));
    await helpers.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 500));
    await helpers.updateProgress(75);
    await new Promise(resolve => setTimeout(resolve, 500));
    await helpers.updateProgress(100);
    return { success: true, processedFiles: payload.files.length };
  });
  
  queue.registerTask('generateReport', async (payload: { reportId: string; type: string; filters: Record<string, string> }, helpers) => {
    console.log('Generating report:', payload);
    await helpers.updateProgress(30);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await helpers.updateProgress(60);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await helpers.updateProgress(100);
    return { 
      success: true, 
      reportUrl: `https://example.com/reports/${payload.reportId}` 
    };
  });
  
  // Set up event listeners
  queue.onJobCompleted((job) => {
    console.log(`Job ${job.id} (${job.taskName}) completed successfully`);
  });
  
  queue.onJobFailed((job, error) => {
    console.error(`Job ${job.id} (${job.taskName}) failed:`, error.message);
  });
  
  queue.onJobProgress((job, progress) => {
    console.log(`Job ${job.id} (${job.taskName}) progress: ${progress}%`);
  });
  
  // Create a worker pool for local development
  const workerPool = createWorkerPool(queue, dbAdapter);
  
  // Start the worker pool
  await workerPool.start();
  console.log('Worker pool started');
  
  // Add some example regular jobs
  await queue.addJob('sendEmail', {
    to: 'user1@example.com',
    subject: 'Welcome to our platform',
    body: 'Thank you for signing up!'
  });
  
  await queue.addJob('processUpload', {
    userId: 'user123',
    files: ['image1.jpg', 'image2.jpg', 'document.pdf']
  });
  
  await queue.addJob('generateReport', {
    reportId: 'report_' + Date.now(),
    type: 'monthly',
    filters: { department: 'sales' }
  });
  
  console.log('Example regular jobs added to queue');
  
  // Add some scheduled jobs
  
  // 1. Schedule a one-time job to run 30 seconds from now
  const thirtySecondsLater = new Date(Date.now() + 30000);
  const scheduledJob = await queue.scheduleJob('sendEmail', {
    to: 'scheduled@example.com',
    subject: 'Scheduled notification',
    body: 'This email was scheduled to be sent at a specific time.'
  }, {
    runAt: thirtySecondsLater,
    priority: 8,
    maxAttempts: 2
  });
  
  console.log(`One-time job scheduled for: ${thirtySecondsLater.toISOString()}`);
  console.log('Scheduled job ID:', scheduledJob.id);
  
  // 2. Schedule a recurring job to run every minute
  const recurringJob = await queue.scheduleRecurringJob('generateReport', {
    reportId: 'daily_' + Date.now(),
    type: 'daily',
    filters: { department: 'marketing' }
  }, {
    pattern: '* * * * *', // Every minute (for demo purposes)
    priority: 5,
    maxAttempts: 2,
    metadata: {
      description: 'Daily marketing report',
      owner: 'Marketing Team'
    }
  });
  
  console.log('Recurring job scheduled with ID:', recurringJob.id);
  console.log(`Next run at: ${recurringJob.nextRunAt?.toISOString()}`);
  
  // Get queue statistics including scheduled jobs
  const stats = await queue.getQueueStats();
  console.log('Queue statistics:', stats);
  
  console.log('Example jobs added to queue');
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down worker pool...');
    await workerPool.shutdown();
    
    // Clean up scheduled jobs before shutdown (optional)
    console.log('Cleaning up scheduled jobs...');
    const scheduledJobs = await queue.listScheduledJobs();
    for (const job of scheduledJobs) {
      if (job.status === 'scheduled' || job.status === 'paused') {
        await queue.cancelScheduledJob(job.id);
        console.log(`Cancelled scheduled job: ${job.id}`);
      }
    }
    
    await queue.shutdown();
    console.log('Shutdown complete');
    process.exit(0);
  });
  
  // Display scheduler metrics every 15 seconds
  const metricsInterval = setInterval(async () => {
    try {
      const metrics = await queue.getSchedulerMetrics();
      console.log('\nScheduler Metrics:', metrics);
      
      // List currently scheduled jobs
      const activeScheduledJobs = await queue.listScheduledJobs({
        status: 'scheduled',
        nextRunBefore: new Date(Date.now() + 60000) // Next minute
      });
      
      console.log(`Active scheduled jobs for next minute: ${activeScheduledJobs.length}`);
    } catch (error) {
      console.error('Error getting scheduler metrics:', error);
    }
  }, 15000);
  
  // Clear the interval on shutdown
  process.on('SIGINT', () => clearInterval(metricsInterval));
}

// Start the worker pool
startWorkerPool().catch(error => {
  console.error('Error starting worker pool:', error);
  process.exit(1);
});
