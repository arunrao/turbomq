import { createQueue, createWorker } from '../src';
import { PrismaAdapter } from '../src/adapters/prisma-adapter';

// Example of using the queue in a Next.js API route
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Create queue instance
      const queue = createQueue();
      await queue.init();
      
      // Register task handlers
      queue.registerTask('processImage', async (payload, helpers) => {
        // Image processing logic
        await helpers.updateProgress(50);
        
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await helpers.updateProgress(100);
        
        return {
          processedUrl: `https://example.com/processed/${payload.imageId}`,
          metadata: {
            width: 800,
            height: 600,
            format: 'webp'
          }
        };
      });
      
      // Add job to queue
      const job = await queue.addJob('processImage', {
        imageId: req.body.imageId,
        settings: req.body.settings || {}
      });
      
      // Clean up
      await queue.shutdown();
      
      // Return job ID to client
      res.status(200).json({ 
        success: true, 
        jobId: job.id,
        message: 'Image processing job added to queue' 
      });
    } catch (error) {
      console.error('Error adding job to queue:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Example of a worker function that can be called from a serverless function
export async function processQueueBatch() {
  const queue = createQueue();
  await queue.init();
  
  // Register the same task handlers
  queue.registerTask('processImage', async (payload, helpers) => {
    // Image processing logic (same as above)
    await helpers.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await helpers.updateProgress(100);
    
    return {
      processedUrl: `https://example.com/processed/${payload.imageId}`,
      metadata: {
        width: 800,
        height: 600,
        format: 'webp'
      }
    };
  });
  
  // Create a worker with appropriate settings for serverless
  const dbAdapter = new PrismaAdapter();
  const worker = createWorker(queue, dbAdapter);
  
  // Process a batch of jobs (with timeout appropriate for serverless)
  const processedCount = await worker.processNextBatch(5, 25000);
  console.log(`Processed ${processedCount} jobs in this batch`);
  
  // Clean up
  await worker.stop();
  await queue.shutdown();
  
  return { processedCount };
}
