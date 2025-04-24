import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue } from '../../../../../src';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create queue instance
    const queue = createQueue();
    await queue.init();

    // Get filter parameters from query
    const status = req.query.status as string | undefined;
    const taskName = req.query.taskName as string | undefined;

    // List jobs with optional filtering
    const jobs = await queue.listJobs({
      status: status as any,
      taskName
    });

    // Get queue stats
    const stats = await queue.getQueueStats();

    // Clean up
    await queue.shutdown();

    // Return jobs list
    return res.status(200).json({
      success: true,
      jobs,
      stats
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
