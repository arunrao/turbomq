import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import { promises as fs } from 'fs';
import path from 'path';
import { createQueue, PrismaAdapter } from '../../lib/queue';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

// Create a wrapper function for PrismaAdapter for consistency with other examples
const createPrismaAdapter = () => new PrismaAdapter();
import { taskHandlers } from '../../lib/task-handlers';

// Disable body parsing to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the incoming form
    const { fields, files } = await parseForm(req);
    const file = files.file?.[0];
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Create a unique filename
    const filename = `${uuidv4()}-${file.originalFilename || 'uploaded-file'}`;
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch (err) {
      console.error('Error creating uploads directory:', err);
    }
    
    // Save file to uploads directory
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, await fs.readFile(file.filepath));
    
    // Create queue with SQLite adapter
    const queue = createQueue(createPrismaAdapter());
    await queue.init();
    
    // Register task handlers
    Object.entries(taskHandlers).forEach(([taskName, handler]) => {
      queue.registerTask(taskName, handler);
    });
    
    // Prepare job options
    const jobOptions: any = {};
    
    // Add webhook URL if provided
    if (fields.webhookUrl) {
      jobOptions.webhookUrl = fields.webhookUrl[0];
      
      // Add custom headers if needed
      jobOptions.webhookHeaders = {
        'X-Job-Source': 'next-queue-browser-example',
      };
    }
    
    // Add job to queue
    const job = await queue.addJob('processFile', {
      filePath,
      originalName: file.originalFilename,
      mimeType: file.mimetype,
    }, jobOptions);
    
    // Trigger job processing (this would typically be done by a cron job in production)
    try {
      // Call the process-jobs endpoint to process only this specific job
      const processResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId: job.id })
      });
      console.log(`Processing triggered for job ${job.id}:`, await processResponse.json());
    } catch (processError) {
      console.error(`Error triggering processing for job ${job.id}:`, processError);
      // We don't fail the upload if processing trigger fails
    }
    
    // Return job ID to client
    return res.status(200).json({ 
      jobId: job.id,
      message: 'File uploaded and queued for processing',
      webhookEnabled: !!jobOptions.webhookUrl
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}

// Helper function to parse multipart form data
async function parseForm(req: NextApiRequest): Promise<{ fields: any, files: any }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ 
      multiples: true,
      keepExtensions: true,
    });
    
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}
