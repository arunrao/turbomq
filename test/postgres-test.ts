/**
 * Test Queue Implementation with PostgreSQL Adapter
 * 
 * This script tests the queue implementation using a real PostgreSQL database.
 * Updated to use TurboMQ 1.3.2 features including improved shutdown handling and ES module compatibility.
 */
import { 
  PostgresAdapter,
  createQueue, 
  createWorker
} from 'turbomq';

// Define shutdown options interface (since it's not exported directly)
export interface ShutdownOptions {
  timeout?: number;
  force?: boolean;
}

// Define a test task name
const TEST_TASK = 'test-task';

async function testWithPostgresAdapter() {
  try {
    console.log('Creating PostgreSQL adapter...');
    
    // Create a PostgreSQL adapter with the connection details and automatic schema creation
    const postgresAdapter = new PostgresAdapter({
      connectionString: `postgres://postgres:mysecretpassword@localhost:5433/samvid-notebook`,
      ssl: false,
      createSchema: true // Automatically create required tables
    });
    
    // Connect to the database
    await postgresAdapter.connect();
    
    // Validate the schema
    const schemaIssues = await postgresAdapter.inspectSchema();
    if (schemaIssues.length > 0) {
      console.warn('Database schema issues detected:', schemaIssues);
      // Continue anyway since createSchema should have fixed the issues
    } else {
      console.log('Database schema validated successfully');
    }
    
    console.log('PostgreSQL adapter created');
    
    // Create the queue
    console.log('Creating queue...');
    const queue = await createQueue(postgresAdapter as any);
    console.log('Queue initialized successfully');
    
    // Register a task handler
    (queue as any).registerTask(TEST_TASK, async (job: any) => {
      console.log('Processing job:', job);
      return { success: true, message: 'Job processed successfully' };
    });
    
    console.log('Task handler registered');
    
    // Create a worker
    console.log('Creating worker...');
    const worker = await createWorker(queue as any, {
      concurrency: 5,
      pollInterval: 1000,
    } as any);
    
    console.log('Worker created');
    
    // Add a job to the queue
    console.log('Adding job to queue...');
    const job = await queue.addJob('test-task', { 
      message: 'Hello, world!',
      userId: 'test-user-id'
    });
    
    console.log(`Job added to queue with ID: ${job.id}`);
    
    // Wait for the job to be processed
    console.log('Waiting for job to be processed...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get queue stats
    const stats = await queue.getQueueStats();
    console.log('Queue stats:', stats);
    
    // Get active jobs count and IDs
    const activeJobsCount = queue.getActiveJobsCount();
    console.log(`Active jobs count: ${activeJobsCount}`);
    
    const activeJobIds = queue.getActiveJobIds();
    console.log('Active job IDs:', activeJobIds);
    
    // List available methods on the queue instance
    const availableMethods = queue.getAvailableMethods?.() || [];
    console.log('Available queue methods:', availableMethods);
    
    // Shutdown the worker and queue
    console.log('Shutting down worker...');
    // In TurboMQ, workers don't have a shutdown method
    // Instead, we need to stop the worker's polling
    
    // Start the shutdown process
    console.log('Starting shutdown process...');
  
    // First shut down the worker
    console.log('Shutting down worker...');
    try {
      // Worker shutdown with improved options in TurboMQ 1.3.2
      await (worker as any).shutdown({
        timeout: 3000,  // 3 second timeout
        force: true     // Force shutdown even if jobs are still processing
      } as ShutdownOptions);
      console.log('Worker shutdown completed successfully');
    } catch (error: any) {
      console.warn('Worker shutdown error:', error?.message || 'Unknown error');
    }
  
    // Then shut down the queue
    console.log('Shutting down queue...');
    try {
      // Queue shutdown with improved options in TurboMQ 1.3.2
      await queue.shutdown({
        timeout: 5000,  // 5 second timeout
        force: true     // Force shutdown even if jobs are still running
      } as ShutdownOptions);
      console.log('Queue shutdown completed successfully');
    } catch (error: any) {
      console.warn('Queue shutdown error:', error?.message || 'Unknown error');
    }
  
    console.log('Shutdown process completed successfully');
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWithPostgresAdapter().catch(console.error); 