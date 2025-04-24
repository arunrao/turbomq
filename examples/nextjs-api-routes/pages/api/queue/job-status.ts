import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue } from '../../../../../src/index';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { jobId } = req.query;

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  try {
    // Create queue instance
    const queue = createQueue();
    await queue.init();

    // Get job details
    const job = await queue.getJobById(jobId);

    if (!job) {
      await queue.shutdown();
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get job result if completed
    let result = null;
    if (job.status === 'completed' && job.resultKey) {
      result = await queue.getJobResult(job.resultKey);
    }

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
        progress: job.progress || 0,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError
      },
      result: result
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
