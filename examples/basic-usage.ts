import { createQueue } from '../src';

// Create a queue instance
const queue = createQueue();

// Initialize the queue
async function init() {
  // Initialize the queue (this also starts the scheduler)
  await queue.init();
  
  // Register task handlers
  queue.registerTask('sendEmail', async (payload, helpers) => {
    console.log('Processing email job:', payload);
    
    // Update progress as the job runs
    await helpers.updateProgress(25);
    console.log('Connecting to email service...');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await helpers.updateProgress(50);
    console.log('Sending email...');
    
    // Simulate some more work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await helpers.updateProgress(100);
    console.log('Email sent successfully!');
    
    // Return the result
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  });
  
  // Add a regular job to the queue
  const job = await queue.addJob('sendEmail', {
    to: 'user@example.com',
    subject: 'Hello from TurboMQ',
    body: 'This is a test email from our job queue system.'
  }, {
    priority: 10, // Higher priority
    maxAttempts: 3 // Retry up to 3 times on failure
  });
  
  console.log('Regular job added to queue:', job.id);
  
  // Schedule a one-time job to run in the future (5 seconds from now)
  const futureDate = new Date(Date.now() + 5000);
  const scheduledJob = await queue.scheduleJob('sendEmail', {
    to: 'scheduled@example.com',
    subject: 'Scheduled Email from TurboMQ',
    body: 'This email was scheduled to be sent at a specific time.'
  }, {
    runAt: futureDate,
    priority: 5,
    maxAttempts: 2
  });
  
  console.log(`One-time job scheduled for: ${futureDate.toISOString()}`);
  console.log('Scheduled job ID:', scheduledJob.id);
  
  // Schedule a recurring job using a cron pattern (every minute)
  const recurringJob = await queue.scheduleRecurringJob('sendEmail', {
    to: 'daily@example.com',
    subject: 'Recurring Email from TurboMQ',
    body: 'This email is sent on a recurring schedule.'
  }, {
    pattern: '* * * * *', // Every minute (for demo purposes)
    priority: 3,
    maxAttempts: 2
  });
  
  console.log('Recurring job scheduled with ID:', recurringJob.id);
  console.log(`Next run at: ${recurringJob.nextRunAt?.toISOString()}`);
  
  // Listen for job events
  queue.onJobCompleted((job) => {
    console.log(`Job ${job.id} completed!`);
  });
  
  queue.onJobFailed((job, error) => {
    console.error(`Job ${job.id} failed:`, error.message);
  });
  
  queue.onJobProgress((job, progress) => {
    console.log(`Job ${job.id} progress: ${progress}%`);
  });
  
  // List all scheduled jobs
  const scheduledJobs = await queue.listScheduledJobs();
  console.log(`Total scheduled jobs: ${scheduledJobs.length}`);
  
  // Get queue statistics including scheduled jobs
  const stats = await queue.getQueueStats();
  console.log('Queue statistics:', stats);
  
  // For demonstration purposes, we'll cancel the recurring job after 10 seconds
  setTimeout(async () => {
    try {
      console.log(`Cancelling recurring job: ${recurringJob.id}`);
      await queue.cancelScheduledJob(recurringJob.id);
      console.log('Recurring job cancelled');
      
      // Shutdown the queue after demonstration
      console.log('Shutting down queue...');
      await queue.shutdown();
      console.log('Queue shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, 10000);
}

// Start the queue
init().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
