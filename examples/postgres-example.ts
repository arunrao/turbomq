import { createQueue, createPostgresAdapter, createWorker } from '../src/index';

/**
 * Example of using the PostgreSQL adapter with PostgreSQL.
 * 
 * To run this example:
 * 1. Set up your PostgreSQL database (local or cloud-based)
 * 2. Update your .env file with the appropriate connection string:
 *    DATABASE_PROVIDER="postgresql"
 *    DATABASE_URL="postgresql://user:password@hostname:port/database"
 * 3. Run `npx prisma db push` to create the database schema
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
    const queue = createQueue(postgresAdapter);
    
    // Initialize the queue
    await queue.init();
    
    // Register a task handler
    queue.registerTask('postgresTask', async (payload, helpers) => {
      console.log('Processing task:', payload);
      await helpers.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await helpers.updateProgress(100);
      return { success: true, message: 'Task completed on PostgreSQL' };
    });
    
    // Add a job to the queue
    const job = await queue.addJob('postgresTask', { message: 'Hello from PostgreSQL!' });
    console.log('Job added to PostgreSQL queue:', job.id);
    
    // Process the job
    const worker = createWorker(queue, postgresAdapter);
    await worker.processNextBatch(1);
    
    // Get job result
    const updatedJob = await queue.getJobById(job.id);
    console.log('Job status:', updatedJob?.status);
    
    if (updatedJob?.resultKey) {
      const result = await queue.getJobResult(updatedJob.resultKey);
      console.log('Job result:', result);
    }
    
    // Clean up
    await queue.shutdown();
    console.log('PostgreSQL example completed');
  } catch (error) {
    console.error('Error in PostgreSQL example:', error);
  }
}

// Run the example
runPostgresExample().catch(console.error);
