import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, createWorker, PrismaAdapter } from '../../../../../src/index';
import { taskHandlers } from '../../../lib/task-handlers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // This endpoint should be protected in production
  // e.g., using a secret token or authentication
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    
    // Get batch size from request or use default
    const batchSize = req.body.batchSize || 5;
    
    // Process a batch of jobs (with timeout appropriate for serverless)
    const processedCount = await worker.processNextBatch(batchSize, 25000);
    
    // Clean up
    await worker.stop();
    await queue.shutdown();

    // Return results
    return res.status(200).json({
      success: true,
      processedCount,
      message: `Processed ${processedCount} jobs in this batch`
    });
  } catch (error) {
    console.error('Error processing jobs:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
