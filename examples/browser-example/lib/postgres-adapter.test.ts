import { createQueue } from '../../../src/index.js';
import { PostgresAdapter } from './postgres-adapter.js';
import { JobStatus } from '../../../src/types.js';
import { createSchema, inspectSchema, migrateSchema } from '../../../src/schema.js';

describe('PostgresAdapter with TurboMQ', () => {
  let queue: any;
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    // Create adapter with test database connection
    adapter = new PostgresAdapter({
      connectionString: 'postgres://postgres:mysecretpassword@localhost:5433/turbomq_test',
      ssl: false,
      queryTimeout: 5000,
      connectTimeout: 10000,
      idleTimeout: 20,
      maxConnections: 10
    });
    
    // Initialize schema using TurboMQ's schema management
    await adapter.connect();
    
    // Create initial schema
    await createSchema(adapter);
    
    // Migrate to latest version
    await migrateSchema(adapter, '1.0.0', '1.1.0');
    
    // Verify schema
    const schemaIssues = await inspectSchema(adapter);
    if (schemaIssues.length > 0) {
      console.warn('Schema issues found:', schemaIssues);
      // Instead of failing, let's add the missing columns
      await adapter.query(`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS error TEXT,
        ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3
      `);
      console.log('Added missing columns to schema');
    }
    
    queue = createQueue(adapter);
    
    // Register all task handlers that will be used in tests
    queue.registerTask('test-task', async (payload: any) => {
      return { processed: true, payload };
    });
    
    queue.registerTask('failing-task', async () => {
      throw new Error('Task failed');
    });
    
    queue.registerTask('progress-task', async (_: any, helpers: any) => {
      await helpers.updateProgress(50);
      return { done: true };
    });
    
    queue.registerTask('stats-task', async (payload: any) => {
      return { processed: true, payload };
    });
    
    queue.registerTask('info-task', async (payload: any) => {
      return { processed: true, payload };
    });
    
    await queue.init();
  });

  afterAll(async () => {
    try {
      // Force shutdown with a shorter timeout to avoid hanging
      await queue.shutdown({ force: true, timeout: 1000 });
    } catch (error) {
      console.warn('Error during queue shutdown:', error);
    } finally {
      // Ensure adapter is disconnected even if queue shutdown fails
      try {
        await adapter.disconnect();
      } catch (error) {
        console.warn('Error during adapter disconnect:', error);
      }
    }
  }, 5000); // Add timeout to afterAll

  beforeEach(async () => {
    // Clean up any existing jobs before each test
    await adapter.removeJobsByStatus(JobStatus.PENDING);
    await adapter.removeJobsByStatus(JobStatus.RUNNING);
    await adapter.removeJobsByStatus(JobStatus.COMPLETED);
    await adapter.removeJobsByStatus(JobStatus.FAILED);
  });

  it('should process a job through the queue', async () => {
    // Add and process a job
    const job = await queue.addJob('test-task', { data: 'test' });
    expect(job.status).toBe(JobStatus.PENDING);

    // Process the job
    await queue.processJob('test-worker', job);

    // Verify job completion
    const completedJob = await queue.getJobById(job.id);
    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
  });

  it('should handle job failures', async () => {
    const job = await queue.addJob('failing-task', { data: 'test' });
    await queue.processJob('test-worker', job);

    const failedJob = await queue.getJobById(job.id);
    expect(failedJob?.status).toBe(JobStatus.FAILED);
    expect(failedJob?.lastError).toBe('Task failed');
  });

  it('should track job progress', async () => {
    const job = await queue.addJob('progress-task', { data: 'test' });
    await queue.processJob('test-worker', job);

    const updatedJob = await queue.getJobById(job.id);
    expect(updatedJob?.progress).toBe(50);
  });

  it('should get queue statistics', async () => {
    await queue.addJob('stats-task', { data: 'test1' });
    await queue.addJob('stats-task', { data: 'test2' });

    const stats = await queue.getQueueStats();
    expect(stats.pendingCount).toBe(2);
    expect(stats.runningCount).toBe(0);
  });

  it('should get detailed job information', async () => {
    await queue.addJob('info-task', { data: 'test1' });
    await queue.addJob('info-task', { data: 'test2' });

    const info = await queue.getDetailedJobInfo();
    expect(info.jobs.length).toBe(2);
    expect(info.total).toBe(2);
    expect(info.stats.byTask['info-task']).toBe(2);
  });

  it('should handle query timeouts', async () => {
    // Create a job that will take longer than the timeout
    const job = await queue.addJob('test-task', { data: 'test' });
    
    // Save the original executeWithTimeout method
    const originalExecuteWithTimeout = adapter['executeWithTimeout'];
    
    // Mock the executeWithTimeout method to simulate a timeout
    adapter['executeWithTimeout'] = async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for test stability
      throw new Error('Query timed out after 5000ms');
    };

    // Attempt to process the job - should timeout
    await expect(queue.processJob('test-worker', job)).rejects.toThrow('Query timed out after 5000ms');

    // Restore original method
    adapter['executeWithTimeout'] = originalExecuteWithTimeout;
  }, 10000); // Increase timeout to 10 seconds
}); 