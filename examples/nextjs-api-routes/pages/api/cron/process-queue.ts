import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, createWorker, PrismaAdapter } from '../../../../../src/index';
import { taskHandlers } from '../../../lib/task-handlers';

/**
 * This endpoint is designed to be called by a cron job or scheduler
 * to process jobs in the queue on a regular basis.
 * 
 * In Vercel, you can use Vercel Cron Jobs to call this endpoint.
 * In AWS, you can use EventBridge Scheduler or CloudWatch Events.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Validate secret token to ensure only authorized callers can trigger this
  const secretToken = req.headers['x-cron-secret'] || req.query.secret;
  
  if (secretToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Create queue instance
    const queue = createQueue();
    await queue.init();

    // Register all task handlers
    Object.entries(taskHandlers).forEach(([taskName, handler]) => {
      queue.registerTask(taskName, handler);
    });

    // Create a worker with appropriate settings for serverless
    const dbAdapter = new PrismaAdapter();
    const worker = createWorker(queue, dbAdapter);
    
    // Process a batch of jobs (with timeout appropriate for serverless)
    // Default to 5 jobs per batch, but can be configured via query parameter
    const batchSize = req.query.batchSize ? parseInt(req.query.batchSize as string, 10) : 5;
    const processedCount = await worker.processNextBatch(batchSize, 25000);
    
    // Clean up stale jobs
    const cleanedCount = await dbAdapter.cleanupStaleJobs();
    
    // Get queue stats
    const stats = await queue.getQueueStats();
    
    // Clean up
    await worker.stop();
    await queue.shutdown();

    // Return results
    return res.status(200).json({
      success: true,
      processedCount,
      cleanedCount,
      stats,
      message: `Processed ${processedCount} jobs, cleaned up ${cleanedCount} stale jobs`
    });
  } catch (error) {
    console.error('Error processing jobs:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
