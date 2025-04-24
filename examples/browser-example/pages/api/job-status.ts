import { NextApiRequest, NextApiResponse } from 'next';
import { SimpleAdapter } from '../../lib/simple-adapter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  const adapter = new SimpleAdapter();

  try {
    await adapter.init();
    
    // Get job by ID
    const job = await adapter.getJobById(id);
    
    if (!job) {
      // Return a more graceful response for non-existent jobs
      return res.status(200).json({
        id,
        status: 'completed',
        progress: 100,
        isCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: { message: 'Job not found or was deleted' }
      });
    }
    
    // Get job result if available
    let result = null;
    if (job.resultKey && job.status === 'completed') {
      result = await adapter.getJobResult(job.resultKey);
    }
    
    // Add a flag to indicate if the job is completed or failed
    const isCompleted = job.status === 'completed' || job.status === 'failed';
    
    return res.status(200).json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      result,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      webhookUrl: job.webhookUrl,
      isCompleted,
    });
  } catch (error) {
    console.error('Job status error:', error);
    return res.status(500).json({ error: 'Failed to get job status' });
  } finally {
    // Clean up adapter connection
    try {
      await adapter.shutdown();
    } catch (error) {
      console.error('Error shutting down adapter:', error);
    }
  }
}
