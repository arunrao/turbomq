import { NextApiRequest, NextApiResponse } from 'next';
import type { NextApiResponseServerIO } from '../../lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIO
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the webhook payload
    const webhookData = req.body;
    
    // Validate the webhook payload
    if (!webhookData || !webhookData.jobId) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }
    
    console.log('Received webhook notification:', webhookData);
    
    // Get the Socket.IO server instance
    const io = res.socket.server.io;
    
    // If Socket.IO server is not initialized, initialize it
    if (!io) {
      console.log('Socket.IO server not initialized');
      return res.status(200).json({ 
        success: true,
        message: 'Webhook received, but no Socket.IO server available'
      });
    }
    
    // Emit the job update to all connected clients AND to a job-specific channel
    io.emit('job-update', webhookData); // Global channel for all updates
    io.to(`job-${webhookData.jobId}`).emit('job-update', webhookData); // Job-specific channel
    console.log(`Emitted job-update event for job ${webhookData.jobId} (global and job-specific channels)`);
    
    // Respond with success
    return res.status(200).json({
      success: true,
      message: 'Webhook received and broadcasted to clients'
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
