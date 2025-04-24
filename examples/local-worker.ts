import { createQueue, createWorkerPool, PrismaAdapter } from '../src';

// Example of running a worker pool in a local development environment
async function startWorkerPool() {
  // Create queue instance
  const queue = createQueue();
  await queue.init();
  
  // Register task handlers
  queue.registerTask('sendEmail', async (payload, helpers) => {
    console.log('Processing email job:', payload);
    await helpers.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await helpers.updateProgress(100);
    return { success: true, messageId: `msg_${Date.now()}` };
  });
  
  queue.registerTask('processUpload', async (payload, helpers) => {
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
  
  queue.registerTask('generateReport', async (payload, helpers) => {
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
  const dbAdapter = new PrismaAdapter();
  const workerPool = createWorkerPool(queue, dbAdapter);
  
  // Start the worker pool
  await workerPool.start();
  console.log('Worker pool started');
  
  // Add some example jobs
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
  
  console.log('Example jobs added to queue');
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down worker pool...');
    await workerPool.shutdown();
    await queue.shutdown();
    console.log('Shutdown complete');
    process.exit(0);
  });
}

// Start the worker pool
startWorkerPool().catch(error => {
  console.error('Error starting worker pool:', error);
  process.exit(1);
});
