import { createQueue, createWorker } from '../src';
import { PrismaAdapter } from '../src/adapters/prisma-adapter';

// Example of using the queue in a Next.js API route
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Create queue instance with Prisma adapter
      const dbAdapter = new PrismaAdapter();
      const queue = createQueue(dbAdapter);
      await queue.init();
      
      // Register task handlers
      queue.registerTask('processImage', async (payload: { imageId: string; settings?: Record<string, any> }, helpers) => {
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
      
      // Check if this is a scheduled job request
      if (req.body.schedule) {
        if (req.body.schedule.recurring) {
          // Schedule a recurring job
          const recurringJob = await queue.scheduleRecurringJob('processImage', {
            imageId: req.body.imageId,
            settings: req.body.settings || {}
          }, {
            pattern: req.body.schedule.pattern, // cron pattern
            priority: req.body.priority || 5,
            maxAttempts: req.body.maxAttempts || 3,
            metadata: req.body.metadata || {}
          });
          
          // Clean up
          await queue.shutdown();
          
          // Return scheduled job ID to client
          res.status(200).json({ 
            success: true, 
            scheduledJobId: recurringJob.id,
            nextRunAt: recurringJob.nextRunAt,
            message: 'Recurring image processing job scheduled' 
          });
        } else {
          // Schedule a one-time job
          const runAt = new Date(req.body.schedule.runAt);
          const scheduledJob = await queue.scheduleJob('processImage', {
            imageId: req.body.imageId,
            settings: req.body.settings || {}
          }, {
            runAt: runAt,
            priority: req.body.priority || 5,
            maxAttempts: req.body.maxAttempts || 3,
            metadata: req.body.metadata || {}
          });
          
          // Clean up
          await queue.shutdown();
          
          // Return scheduled job ID to client
          res.status(200).json({ 
            success: true, 
            scheduledJobId: scheduledJob.id,
            runAt: scheduledJob.runAt,
            message: 'One-time image processing job scheduled' 
          });
        }
      } else {
        // Add immediate job to queue
        const job = await queue.addJob('processImage', {
          imageId: req.body.imageId,
          settings: req.body.settings || {}
        }, {
          priority: req.body.priority || 5,
          maxAttempts: req.body.maxAttempts || 3
        });
        
        // Clean up
        await queue.shutdown();
        
        // Return job ID to client
        res.status(200).json({ 
          success: true, 
          jobId: job.id,
          message: 'Image processing job added to queue' 
        });
      }
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
  const dbAdapter = new PrismaAdapter();
  const queue = createQueue(dbAdapter);
  await queue.init();
  
  // Register the same task handlers
  queue.registerTask('processImage', async (payload: { imageId: string; settings?: Record<string, any> }, helpers) => {
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
  const worker = createWorker(queue, dbAdapter);
  
  // Process a batch of jobs (with timeout appropriate for serverless)
  const processedCount = await worker.processNextBatch(5, 25000);
  console.log(`Processed ${processedCount} jobs in this batch`);
  
  // Clean up
  await worker.stop();
  await queue.shutdown();
  
  return { processedCount };
}

// Example of a serverless function to check and execute scheduled jobs
export async function processScheduledJobs() {
  const dbAdapter = new PrismaAdapter();
  const queue = createQueue(dbAdapter);
  await queue.init();
  
  // Register task handlers
  queue.registerTask('processImage', async (payload: { imageId: string; settings?: Record<string, any> }, helpers) => {
    // Image processing logic
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
  
  // Get scheduler metrics before processing
  const beforeMetrics = await queue.getSchedulerMetrics();
  
  // Process any scheduled jobs that are due
  // Note: This happens automatically when queue.init() is called,
  // but we can also manually trigger it for serverless environments
  const overduejobsCount = await queue.rescheduleOverdueJobs();
  
  // Clean up old completed scheduled jobs (optional)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cleanedUpCount = await queue.cleanupCompletedScheduledJobs(thirtyDaysAgo);
  
  // Get scheduler metrics after processing
  const afterMetrics = await queue.getSchedulerMetrics();
  
  // Clean up
  await queue.shutdown();
  
  return { 
    beforeMetrics,
    afterMetrics,
    overduejobsCount,
    cleanedUpCount
  };
}

// Example of a serverless function to manage scheduled jobs
export async function manageScheduledJobs(req) {
  const dbAdapter = new PrismaAdapter();
  const queue = createQueue(dbAdapter);
  await queue.init();
  
  const { action, jobId, updates } = req.body;
  
  let result;
  
  switch (action) {
    case 'list':
      result = await queue.listScheduledJobs(req.body.filter || {});
      break;
    case 'get':
      result = await queue.getScheduledJobById(jobId);
      break;
    case 'update':
      result = await queue.updateScheduledJob(jobId, updates);
      break;
    case 'pause':
      result = await queue.pauseScheduledJob(jobId);
      break;
    case 'resume':
      result = await queue.resumeScheduledJob(jobId);
      break;
    case 'cancel':
      await queue.cancelScheduledJob(jobId);
      result = { success: true, message: `Job ${jobId} cancelled` };
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  
  // Clean up
  await queue.shutdown();
  
  return result;
}
