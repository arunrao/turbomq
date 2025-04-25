import { createQueue, createWorker, createWorkerPool, PrismaAdapter, Queue, Worker, WorkerPool } from '../../../src';

export class QueueService {
  private queue!: Queue;
  private worker!: Worker;
  private pool!: WorkerPool;

  async initialize() {
    try {
      const dbAdapter = new PrismaAdapter();
      
      // Create queue with the adapter directly
      this.queue = await createQueue(dbAdapter);
      
      // Create worker with queue and adapter
      this.worker = await createWorker(this.queue, dbAdapter);
      
      // Create worker pool with queue and adapter
      this.pool = await createWorkerPool(this.queue, dbAdapter);
      
      // Start the worker and pool
      await this.worker.start();
      await this.pool.start();
      
      console.log('Queue service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  // ... rest of your service methods ...
} 