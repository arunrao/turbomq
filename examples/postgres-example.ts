import { createQueue, createPostgresAdapter, createWorker } from '../src/index';

/**
 * Example of using the PostgreSQL adapter with PostgreSQL, including the scheduler feature.
 * 
 * To run this example:
 * 1. Set up your PostgreSQL database (local or cloud-based)
 * 2. Update your .env file with the appropriate connection string:
 *    DATABASE_PROVIDER="postgresql"
 *    DATABASE_URL="postgresql://user:password@hostname:port/database"
 * 3. Run `npx prisma db push` to create the database schema (including the ScheduledJob model)
 * 4. Run `npx ts-node examples/postgres-example.ts`
 */
async function runPostgresExample() {
  console.log('Starting PostgreSQL adapter example...');
  
  // Run the PostgreSQL example using the DATABASE_URL from .env
  await runPostgresAdapterExample();
}

async function runPostgresAdapterExample() {
  console.log('\n--- PostgreSQL Example ---');
  
  try {
    // Create a PostgreSQL adapter
    // The adapter will automatically detect if SSL is needed based on the connection URL
    // - Local connections (localhost/127.0.0.1): SSL disabled by default
    // - Non-local connections: SSL enabled by default
    const postgresAdapter = createPostgresAdapter();
    
    // You can also explicitly control SSL if needed:
    // const postgresAdapter = createPostgresAdapter({ ssl: true }); // Force SSL on
    // const postgresAdapter = createPostgresAdapter({ ssl: false }); // Force SSL off
    
    // Create a queue with the PostgreSQL adapter
    // Type assertion is needed because PostgresAdapter might not be fully updated with all DbAdapter methods
    const queue = createQueue(postgresAdapter as any);
    
    // Initialize the queue
    await queue.init();
    
    // Register a task handler
    queue.registerTask('postgresTask', async (payload: { message: string; timestamp?: string; type?: string }, helpers) => {
      console.log('Processing task:', payload);
      await helpers.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await helpers.updateProgress(100);
      return { success: true, message: 'Task completed on PostgreSQL' };
    });
    
    // Add a regular job to the queue
    const job = await queue.addJob('postgresTask', { message: 'Hello from PostgreSQL!' });
    console.log('Regular job added to PostgreSQL queue:', job.id);
    
    // Schedule a one-time job to run 10 seconds from now
    const tenSecondsLater = new Date(Date.now() + 10000);
    const scheduledJob = await queue.scheduleJob('postgresTask', { 
      message: 'Scheduled job from PostgreSQL!',
      timestamp: new Date().toISOString()
    }, {
      runAt: tenSecondsLater,
      priority: 5,
      maxAttempts: 2
    });
    
    console.log(`One-time job scheduled for: ${tenSecondsLater.toISOString()}`);
    console.log('Scheduled job ID:', scheduledJob.id);
    
    // Schedule a recurring job using a cron pattern
    const recurringJob = await queue.scheduleRecurringJob('postgresTask', { 
      message: 'Recurring job from PostgreSQL!',
      type: 'maintenance'
    }, {
      pattern: '*/5 * * * *', // Every 5 minutes
      priority: 3,
      maxAttempts: 2,
      metadata: {
        description: 'Database maintenance task',
        owner: 'System'
      }
    });
    
    console.log('Recurring job scheduled with ID:', recurringJob.id);
    console.log(`Next run at: ${recurringJob.nextRunAt?.toISOString()}`);
    
    // Process the regular job
    // Type assertion is needed because PostgresAdapter might not be fully updated with all DbAdapter methods
    const worker = createWorker(queue, postgresAdapter as any);
    await worker.processNextBatch(1);
    
    // Get job result
    const updatedJob = await queue.getJobById(job.id);
    console.log('Job status:', updatedJob?.status);
    
    if (updatedJob?.resultKey) {
      const result = await queue.getJobResult(updatedJob.resultKey);
      console.log('Job result:', result);
    }
    
    // List all scheduled jobs
    const scheduledJobs = await queue.listScheduledJobs();
    console.log(`Total scheduled jobs: ${scheduledJobs.length}`);
    
    // Get queue statistics including scheduled jobs
    const stats = await queue.getQueueStats();
    console.log('Queue statistics:', stats);
    
    // For demonstration purposes, we'll cancel the recurring job
    await queue.cancelScheduledJob(recurringJob.id);
    console.log('Recurring job cancelled');
    
    // Clean up
    await queue.shutdown();
    console.log('PostgreSQL example completed');
  } catch (error) {
    console.error('Error in PostgreSQL example:', error);
  }
}

// Run the example
runPostgresExample().catch(console.error);
