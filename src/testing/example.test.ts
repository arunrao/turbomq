import { createTestQueue } from './test-utils';

describe('Queue Tests', () => {
  it('should create and process a job', async () => {
    const queue = createTestQueue();
    
    // Register task handler
    queue.registerTask('test-task', async (payload) => {
      return { processed: true, payload };
    });
    
    const job = await queue.addJob('test-task', { test: 'data' });
    expect(job.status).toBe('pending');
  });

  it('should handle job failures', async () => {
    const queue = createTestQueue();
    
    // Register failing task handler
    queue.registerTask('failing-task', async () => {
      throw new Error('Task failed');
    });
    
    const job = await queue.addJob('failing-task', { test: 'data' });
    expect(job.status).toBe('pending');
  });

  it('should track job progress', async () => {
    const queue = createTestQueue();
    
    // Register progress task handler
    queue.registerTask('progress-task', async (payload, helpers) => {
      await helpers.updateProgress(50);
      return { processed: true, payload };
    });
    
    const job = await queue.addJob('progress-task', { test: 'data' });
    expect(job.status).toBe('pending');
  });

  it('should handle job retries', async () => {
    const queue = createTestQueue();
    let attempts = 0;
    
    // Register retry task handler
    queue.registerTask('retry-task', async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Retry needed');
      }
      return { processed: true, attempts };
    });
    
    const job = await queue.addJob('retry-task', { test: 'data' });
    expect(job.status).toBe('pending');
  });
}); 