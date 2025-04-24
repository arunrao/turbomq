import { DbAdapter } from './types';
import { Queue } from './queue';
import { v4 as uuidv4 } from 'uuid';

export class Worker {
  private running = false;
  private shuttingDown = false;
  private workerId: string;
  private currentJobId?: string;
  private heartbeatInterval?: NodeJS.Timeout;
  
  constructor(
    private queue: Queue,
    private db: DbAdapter,
    private pollInterval: number = 5000,
    private maxExecutionTime: number = 0 // 0 means no limit (for continuous mode)
  ) {
    this.workerId = `worker-${Date.now()}-${uuidv4().substring(0, 8)}`;
  }

  async start(): Promise<void> {
    if (this.running) return;
    
    this.running = true;
    this.startHeartbeat();
    
    // If we have a time limit, run in batch mode
    if (this.maxExecutionTime > 0) {
      await this.processNextBatch(Infinity, this.maxExecutionTime);
      this.running = false;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      return;
    }
    
    // Otherwise run in continuous mode
    while (this.running) {
      try {
        // Clean up any stale jobs first
        await this.db.cleanupStaleJobs();
        
        // Get all registered task names
        const availableTasks = Array.from(this.queue.getHandlers().keys());
        
        // Try to get and process a job
        const job = await this.db.fetchNextJob(this.workerId, availableTasks);
        
        if (job) {
          this.currentJobId = job.id;
          await this.queue.processJob(this.workerId, job);
          this.currentJobId = undefined;
          
          // If shutting down, exit after completing current job
          if (this.shuttingDown) {
            this.running = false;
            break;
          }
        } else {
          // No job available, wait for poll interval
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
          
          // If shutting down and no current job, exit immediately
          if (this.shuttingDown) {
            this.running = false;
            break;
          }
        }
      } catch (error) {
        console.error('Worker error:', error);
        this.currentJobId = undefined;
        // Wait a bit before trying again
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  async gracefulShutdown(timeout: number = 30000): Promise<boolean> {
    if (!this.currentJobId) {
      // No active job, can shut down immediately
      this.running = false;
      return true;
    }
    
    // Set shutdown flag
    this.shuttingDown = true;
    
    // Wait for current job to complete or timeout
    const startTime = Date.now();
    while (this.currentJobId && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    this.running = false;
    return !this.currentJobId; // Return true if shutdown was clean
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.db.heartbeat(this.workerId, this.currentJobId);
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, Math.min(30000, this.pollInterval * 2)); // Every 30 seconds or twice the poll interval, whichever is smaller
  }

  // Process a batch of jobs (good for serverless environments)
  async processNextBatch(maxJobs: number = 5, timeout: number = 25000): Promise<number> {
    let processedCount = 0;
    const startTime = Date.now();
    
    try {
      // Clean up stale jobs first
      await this.db.cleanupStaleJobs();
      
      // Get all registered task names
      const availableTasks = Array.from(this.queue.getHandlers().keys());
      
      // Try to get multiple jobs at once for efficiency
      const batchSize = Math.min(maxJobs, 5); // Process up to 5 at a time
      const jobs = await this.db.fetchNextBatch(this.workerId, availableTasks, batchSize);
      
      // Process jobs until we hit the limit or timeout
      for (const job of jobs) {
        if (processedCount >= maxJobs || 
            (timeout > 0 && Date.now() - startTime > timeout)) {
          break;
        }
        
        this.currentJobId = job.id;
        await this.queue.processJob(this.workerId, job);
        this.currentJobId = undefined;
        processedCount++;
      }
      
      // If no jobs were fetched in the batch and we still have time/quota
      // try to get individual jobs (fallback)
      if (jobs.length === 0 && processedCount < maxJobs && 
          (timeout === 0 || Date.now() - startTime < timeout)) {
        
        // Process up to maxJobs or until timeout
        while (
          processedCount < maxJobs && 
          (timeout === 0 || Date.now() - startTime < timeout)
        ) {
          const job = await this.db.fetchNextJob(this.workerId, availableTasks);
          
          if (!job) {
            if (timeout === 0) {
              // In continuous mode, wait for poll interval if no jobs
              await new Promise(resolve => setTimeout(resolve, this.pollInterval));
              continue;
            } else {
              // In batch mode, exit if no jobs
              break;
            }
          }
          
          this.currentJobId = job.id;
          await this.queue.processJob(this.workerId, job);
          this.currentJobId = undefined;
          processedCount++;
        }
      }
    } catch (error) {
      console.error('Batch processing error:', error);
      this.currentJobId = undefined;
    }
    
    return processedCount;
  }
}
