import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue } from '../../../../../src/index';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskName, payload, options } = req.body;

    if (!taskName || !payload) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create queue instance
    const queue = createQueue();
    await queue.init();

    // Register task handlers (or import them from a central location)
    queue.registerTask(taskName, async () => {
      // This is just a placeholder - in a real app, you'd have actual handlers
      // The real handlers would be imported from a shared location
      return { success: true };
    });

    // Add job to queue
    const job = await queue.addJob(taskName, payload, options);

    // Clean up
    await queue.shutdown();

    // Return job details
    return res.status(200).json({
      success: true,
      job: {
        id: job.id,
        taskName: job.taskName,
        status: job.status,
        priority: job.priority,
        createdAt: job.createdAt
      }
    });
  } catch (error) {
    console.error('Error adding job to queue:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
