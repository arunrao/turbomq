import { DbAdapter } from './types';
import { Queue } from './queue';
import { Worker } from './worker';

export class WorkerPool {
  private workers: Worker[] = [];
  private maxWorkers: number;
  private minWorkers: number;
  private currentWorkers: number = 0;
  private checkInterval?: NodeJS.Timeout;
  
  constructor(
    private queueInstance: Queue,
    private dbAdapter: DbAdapter,
    minWorkers = 0,
    maxWorkers = 5
  ) {
    this.minWorkers = minWorkers;
    this.maxWorkers = maxWorkers;
  }
  
  async start(): Promise<void> {
    // Start minimum workers
    for (let i = 0; i < this.minWorkers; i++) {
      this.startWorker();
    }
    
    // Start monitoring queue depth
    this.checkInterval = setInterval(() => this.adjustWorkerCount(), 10000);
  }
  
  private async adjustWorkerCount(): Promise<void> {
    try {
      const queueStats = await this.dbAdapter.getQueueStats();
      const pendingJobs = queueStats.pendingCount;
      
      if (pendingJobs > this.currentWorkers * 3 && this.currentWorkers < this.maxWorkers) {
        // Scale up: More than 3 jobs per worker
        this.startWorker();
      } else if (pendingJobs === 0 && this.currentWorkers > this.minWorkers) {
        // Scale down: No pending jobs
        this.stopWorker();
      }
    } catch (error) {
      console.error('Error adjusting worker count:', error);
    }
  }
  
  private startWorker(): void {
    const worker = new Worker(this.queueInstance, this.dbAdapter);
    worker.start().catch(console.error);
    this.workers.push(worker);
    this.currentWorkers++;
  }
  
  private async stopWorker(): Promise<void> {
    if (this.workers.length > 0) {
      const worker = this.workers.pop();
      if (worker) {
        await worker.gracefulShutdown();
        this.currentWorkers--;
      }
    }
  }
  
  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Stop all workers gracefully
    const shutdownPromises = this.workers.map(worker => worker.gracefulShutdown());
    await Promise.all(shutdownPromises);
    
    this.workers = [];
    this.currentWorkers = 0;
  }
}
