import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, createWorker, PrismaAdapter } from '../../lib/queue';

// Create a wrapper function for PrismaAdapter for consistency with other examples
const createPrismaAdapter = () => new PrismaAdapter();
import { taskHandlers } from '../../lib/task-handlers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create database adapter
    const dbAdapter = createPrismaAdapter();
    
    // Create queue
    const queue = createQueue(dbAdapter);
    await queue.init();
    
    // Register task handlers
    Object.entries(taskHandlers).forEach(([taskName, handler]) => {
      queue.registerTask(taskName, handler);
    });
    
    // Check if a specific job ID was provided
    const jobId = req.query.jobId || req.body?.jobId;
    
    let processed = 0;
    
    if (jobId) {
      // Process only the specified job
      console.log(`Processing specific job: ${jobId}`);
      const job = await queue.getJobById(jobId as string);
      
      if (job && job.status === 'pending') {
        // Create worker
        const worker = createWorker(queue, dbAdapter);
        
        // Generate a worker ID
        const workerId = `worker-${Date.now()}`;
        
        // Process the job
        await queue.processJob(workerId, job);
        processed = 1;
      } else {
        console.log(`Job ${jobId} not found or not in pending status`);
      }
    } else {
      // Process up to 5 jobs
      console.log('Processing batch of pending jobs');
      const worker = createWorker(queue, dbAdapter);
      processed = await worker.processNextBatch(5);
    }
    
    // Return processing results
    return res.status(200).json({
      processed,
      succeeded: processed, // In this simple example, we assume all processed jobs succeeded
      failed: 0,
      message: 'Queue processing complete',
    });
  } catch (error) {
    console.error('Queue processing error:', error);
    return res.status(500).json({ error: 'Queue processing failed' });
  }
}
