import { createQueue, createWorker, createWorkerPool, PrismaAdapter } from '../../../src';

async function main() {
  try {
    // Create a PrismaAdapter instance
    const dbAdapter = new PrismaAdapter();

    // Create queue with the adapter
    const queue = await createQueue(dbAdapter);

    // Create worker with queue and adapter
    const worker = await createWorker(queue, dbAdapter);

    // Create worker pool with queue and adapter
    const pool = await createWorkerPool(queue, dbAdapter);

    // Example: Add a job
    const job = await queue.addJob('test-task', { message: 'Hello World' });
    console.log('Job created:', job);

    // Start the worker
    await worker.start();

    // Start the worker pool
    await pool.start();

  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 