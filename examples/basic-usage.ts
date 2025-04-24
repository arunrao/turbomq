import { createQueue } from '../src';

// Create a queue instance
const queue = createQueue();

// Initialize the queue
async function init() {
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
  
  // Add a job to the queue
  const job = await queue.addJob('sendEmail', {
    to: 'user@example.com',
    subject: 'Hello from Next Queue',
    body: 'This is a test email from our job queue system.'
  }, {
    priority: 10, // Higher priority
    maxAttempts: 3 // Retry up to 3 times on failure
  });
  
  console.log('Job added to queue:', job.id);
  
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
}

// Start the queue
init().catch(console.error);
