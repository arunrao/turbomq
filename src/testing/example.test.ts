import { createTestQueue } from './test-utils';

describe('Queue Tests', () => {
  let queue;

  beforeEach(async () => {
    queue = await createTestQueue();
  });

  it('should create and process a job', async () => {
    // Create a job
    const job = await queue.addJob('test-task', { data: 'test' });
    expect(job.status).toBe('pending');

    // Get job status
    const status = await queue.getJobStatus(job.id);
    expect(status.status).toBe('pending');

    // Process the job
    await queue.processJob(job.id);
    
    // Check final status
    const finalStatus = await queue.getJobStatus(job.id);
    expect(finalStatus.status).toBe('completed');
  });

  it('should handle job failures', async () => {
    // Create a job that will fail
    const job = await queue.addJob('failing-task', { error: true });
    
    // Process the job
    await queue.processJob(job.id);
    
    // Check final status
    const finalStatus = await queue.getJobStatus(job.id);
    expect(finalStatus.status).toBe('failed');
    expect(finalStatus.lastError).toBeDefined();
  });

  it('should track job progress', async () => {
    // Create a job
    const job = await queue.addJob('progress-task', { steps: 3 });
    
    // Process the job
    await queue.processJob(job.id);
    
    // Check progress
    const status = await queue.getJobStatus(job.id);
    expect(status.progress).toBe(100);
  });

  it('should handle job retries', async () => {
    // Create a job with retries
    const job = await queue.addJob('retry-task', { attempts: 0 }, { maxAttempts: 3 });
    
    // Process the job
    await queue.processJob(job.id);
    
    // Check attempts
    const status = await queue.getJobStatus(job.id);
    expect(status.attemptsMade).toBeGreaterThan(0);
  });
}); 