# File Upload Processing Flow with Next-Queue in Vercel

This document outlines how to implement a file upload processing system using next-queue in a Next.js application deployed to Vercel, with PostgreSQL as the database backend.

## Architecture Overview

The system uses a serverless-friendly job queue to handle file uploads asynchronously:

1. **User Interface**: React components for file upload
2. **API Routes**: Next.js API routes to handle upload requests
3. **Queue System**: next-queue to manage background processing
4. **Database**: PostgreSQL for job persistence
5. **Cron Job**: Scheduled job to process the queue

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User       │     │  Next.js    │     │  PostgreSQL │     │  File       │
│  Browser    │────▶│  API Routes │────▶│  Queue      │────▶│  Storage    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲                   │
                           │                   │                   │
                           ▼                   │                   ▼
                    ┌─────────────┐     ┌─────────────┐    ┌─────────────┐
                    │  Vercel     │     │  Scheduled  │    │  Processing │
                    │  Serverless │────▶│  Cron Job   │    │  Results    │
                    └─────────────┘     └─────────────┘    └─────────────┘
```

## Implementation Steps

### 1. Setup Database

Configure your PostgreSQL database in your `.env` file:

```
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://user:password@your-postgres-host.com/database"
NEXT_RUNTIME_ENV="vercel"
CRON_SECRET="your-secure-secret-here"
```

### 2. Create Upload Component

```tsx
// components/FileUpload.tsx
import { useState } from 'react';
import axios from 'axios';

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [useWebhook, setUseWebhook] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setStatus('uploading');
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    // Add webhook option if selected
    if (useWebhook) {
      // Get the current origin (protocol + host)
      const origin = window.location.origin;
      // Add webhook URL - this endpoint will receive job updates
      formData.append('webhookUrl', `${origin}/api/webhook-receiver`);
    }
    
    try {
      // Submit file to API route
      const response = await axios.post('/api/upload', formData);
      setJobId(response.data.jobId);
      setStatus('processing');
      
      // Only poll for status if not using webhooks
      if (!useWebhook) {
        pollJobStatus(response.data.jobId);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setStatus('error');
    }
  };

  const pollJobStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/job-status?id=${id}`);
        const { status, result } = response.data;
        
        setStatus(status);
        
        if (status === 'completed' || status === 'failed') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Status polling error:', error);
        clearInterval(interval);
        setStatus('error');
      }
    }, 2000);
  };

  return (
    <div className="upload-container">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input type="file" onChange={handleFileChange} />
        </div>
        
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              checked={useWebhook} 
              onChange={() => setUseWebhook(!useWebhook)} 
            />
            Use webhooks instead of polling
          </label>
          {useWebhook && (
            <p className="info-text">
              Updates will be sent to your webhook endpoint when processing completes
            </p>
          )}
        </div>
        
        <button type="submit" disabled={!file || status === 'uploading'}>
          Upload File
        </button>
      </form>
      
      {jobId && (
        <div className="status-container">
          <p>Job ID: {jobId}</p>
          <p>Status: {status}</p>
          {status === 'completed' && <p>Processing complete!</p>}
          {status === 'failed' && <p>Processing failed. Please try again.</p>}
          {useWebhook && status === 'processing' && (
            <p>Waiting for webhook notification...</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### 3. Create API Routes

#### Upload Endpoint

```typescript
// pages/api/upload.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import { createQueue, createPostgresAdapter } from 'next-queue';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
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
    const file = files.file[0];

    // Create a unique filename
    const filename = `${uuidv4()}-${file.originalFilename}`;
    
    // Save file to temporary storage
    // In production, you might upload to S3 or another storage service
    const tempPath = `/tmp/${filename}`;
    await fs.writeFile(tempPath, await fs.readFile(file.filepath));
    
    // Create queue with PostgreSQL adapter
    const queue = createQueue(createPostgresAdapter());
    await queue.init();
    
    // Register task handlers
    Object.entries(taskHandlers).forEach(([taskName, handler]) => {
      queue.registerTask(taskName, handler);
    });
    
    // Prepare job options
    const jobOptions: any = {};
    
    // Add webhook URL if provided
    if (fields.webhookUrl) {
      jobOptions.webhookUrl = fields.webhookUrl;
      
      // Add custom headers if needed
      jobOptions.webhookHeaders = {
        'X-Job-Source': 'next-queue',
        'X-Client-ID': req.headers['x-client-id'] as string || 'unknown',
      };
    }
    
    // Add job to queue
    const job = await queue.addJob('processFile', {
      filePath: tempPath,
      originalName: file.originalFilename,
      mimeType: file.mimetype,
    }, jobOptions);
    
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
async function parseForm(req: NextApiRequest) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true });
    
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}
```

#### Job Status Endpoint

```typescript
// pages/api/job-status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, createPostgresAdapter } from 'next-queue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  try {
    // Create queue with PostgreSQL adapter
    const queue = createQueue(createPostgresAdapter());
    await queue.init();
    
    // Get job by ID
    const job = await queue.getJobById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get job result if available
    let result = null;
    if (job.resultKey && job.status === 'completed') {
      result = await queue.getJobResult(job.resultKey);
    }
    
    return res.status(200).json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      result,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error('Job status error:', error);
    return res.status(500).json({ error: 'Failed to get job status' });
  }
}
```

### 4. Create Task Handlers

```typescript
// lib/task-handlers.ts
import { JobHandler } from 'next-queue';
import { promises as fs } from 'fs';
import path from 'path';

// In a real application, you might use a service like AWS S3
// This is a simplified example using the filesystem
export const taskHandlers: Record<string, JobHandler> = {
  processFile: async (payload, helpers) => {
    try {
      const { filePath, originalName, mimeType } = payload;
      
      // Update progress to indicate we've started
      await helpers.updateProgress(10);
      
      // Simulate file processing
      // In a real app, this might be image resizing, video transcoding, etc.
      await simulateProcessing(helpers);
      
      // Read the file
      const fileContent = await fs.readFile(filePath);
      
      // Process the file (this is where your actual processing logic would go)
      // For example: resize images, extract text, generate thumbnails, etc.
      const fileSize = fileContent.length;
      const fileExtension = path.extname(originalName);
      
      // Update progress to indicate processing is complete
      await helpers.updateProgress(100);
      
      // Clean up temporary file
      await fs.unlink(filePath);
      
      // Return processing results
      return {
        success: true,
        processedAt: new Date().toISOString(),
        fileInfo: {
          originalName,
          mimeType,
          size: fileSize,
          extension: fileExtension,
        },
        message: 'File processed successfully',
      };
    } catch (error) {
      console.error('File processing error:', error);
      return {
        success: false,
        error: 'File processing failed',
      };
    }
  }
};

// Helper function to simulate processing time with progress updates
async function simulateProcessing(helpers: any) {
  const steps = 9;
  const baseProgress = 10; // We start at 10%
  
  for (let i = 1; i <= steps; i++) {
    // Sleep to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update progress (from 10% to 90%)
    const progress = baseProgress + (i * (90 / steps));
    await helpers.updateProgress(Math.floor(progress));
  }
}
```

### 5. Create Webhook Receiver Endpoint

```typescript
// pages/api/webhook-receiver.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

// Store for active socket connections
let io: any = null;

// Initialize Socket.IO server if not already initialized
if (!io && typeof window === 'undefined') {
  // Create a simple HTTP server
  const httpServer = createServer();
  // Initialize Socket.IO with CORS settings
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });
  // Start listening on a port that won't conflict with Next.js
  httpServer.listen(3001);
  console.log('Socket.IO server initialized on port 3001');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    
    // Emit the job update to all connected clients via Socket.IO
    if (io) {
      io.emit('job-update', webhookData);
      console.log(`Emitted job-update event for job ${webhookData.jobId}`);
    }
    
    // You could also store the update in a database or cache
    // for clients to retrieve when they reconnect
    
    // Respond with success
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
```

### 6. Create Client-Side Socket.IO Integration

```tsx
// components/WebhookListener.tsx
import { useEffect } from 'react';
import { io } from 'socket.io-client';

interface WebhookListenerProps {
  onJobUpdate: (data: any) => void;
}

export default function WebhookListener({ onJobUpdate }: WebhookListenerProps) {
  useEffect(() => {
    // Connect to the Socket.IO server
    const socket = io('http://localhost:3001');
    
    // Listen for job updates
    socket.on('job-update', (data) => {
      console.log('Received job update via Socket.IO:', data);
      onJobUpdate(data);
    });
    
    // Clean up on unmount
    return () => {
      socket.disconnect();
    };
  }, [onJobUpdate]);
  
  // This component doesn't render anything
  return null;
}
```

### 7. Update the FileUpload Component to Use WebhookListener

```tsx
// Updated section in FileUpload.tsx
import WebhookListener from './WebhookListener';

// Inside the FileUpload component
const handleJobUpdate = (data: any) => {
  // Only update if this is for our current job
  if (data.jobId === jobId) {
    setStatus(data.status);
    
    // Store result if available
    if (data.result) {
      setResult(data.result);
    }
  }
};

// Add this to the return statement
return (
  <div className="upload-container">
    {/* Existing form and status display */}
    
    {/* Add the webhook listener if using webhooks */}
    {useWebhook && jobId && (
      <WebhookListener onJobUpdate={handleJobUpdate} />
    )}
  </div>
);
```

### 8. Create Cron Job Endpoint

```typescript
// pages/api/cron/process-queue.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, createWorker, createPostgresAdapter } from 'next-queue';
import { taskHandlers } from '../../../lib/task-handlers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the request is authorized with a secret token
  const { authorization } = req.headers;
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  
  if (authorization !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Create database adapter
    const dbAdapter = createPostgresAdapter();
    
    // Create queue
    const queue = createQueue(dbAdapter);
    await queue.init();
    
    // Register task handlers
    Object.entries(taskHandlers).forEach(([taskName, handler]) => {
      queue.registerTask(taskName, handler);
    });
    
    // Create worker and process jobs
    const worker = createWorker(queue, dbAdapter);
    
    // Process up to 10 jobs with a 25-second timeout (Vercel limit)
    const result = await worker.processNextBatch(10, 25000);
    
    return res.status(200).json({
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      message: 'Queue processing complete',
    });
  } catch (error) {
    console.error('Queue processing error:', error);
    return res.status(500).json({ error: 'Queue processing failed' });
  }
}
```

### 6. Configure Vercel Cron Jobs

Create a `vercel.json` file in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-queue",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This configures a cron job to run every 5 minutes, which will process any pending jobs in the queue.

## How It Works in Vercel

### File Upload Flow

1. **User Uploads File**:
   - User selects a file and submits the form
   - The file is temporarily stored
   - A job is added to the PostgreSQL queue
   - The API returns a job ID to the client

2. **Job Processing**:
   - The Vercel cron job runs every 5 minutes
   - It processes pending jobs in batches
   - Each job runs within the 25-second Vercel serverless function limit
   - The job updates its progress as it processes the file

3. **Status Updates** (two options):
   - **Option A: Client Polling**
     - The client polls the job status endpoint periodically
     - When the job completes, the client displays the result
     - If the job fails, the client shows an error message
   - **Option B: Webhooks**
     - The client provides a webhook URL when submitting the job
     - When the job completes or fails, a webhook notification is sent
     - The client receives real-time updates without polling

### Key Benefits of This Architecture

1. **Serverless Friendly**:
   - Works within Vercel's serverless function time limits
   - No need for long-running servers
   - Scales automatically with demand

2. **Resilient**:
   - Jobs persist in PostgreSQL even if servers restart
   - Failed jobs can be retried automatically
   - Progress is tracked and can be resumed

3. **User Experience**:
   - Users get immediate feedback when uploading
   - Progress updates during processing
   - No timeouts for large file processing
   - Option to use webhooks eliminates polling overhead

4. **Monitoring and Debugging**:
   - Job status and results are stored in the database
   - Failed jobs include error information
   - Queue statistics help with monitoring system health

## Deployment Considerations

1. **Database Connection**:
   - Use a PostgreSQL provider like Neon, Supabase, or AWS RDS
   - SSL is automatically enabled for non-local connections
   - Set `DATABASE_URL` in your Vercel environment variables

2. **File Storage**:
   - For production, replace the local file storage with a service like AWS S3
   - Vercel's `/tmp` directory is ephemeral and limited in size
   - Use presigned URLs for direct uploads to S3 for larger files

3. **Scaling**:
   - Increase cron job frequency for higher throughput
   - Consider multiple specialized queues for different file types
   - Monitor queue length and adjust processing accordingly

4. **Security**:
   - Always validate file types and sizes
   - Use the CRON_SECRET to secure the processing endpoint
   - Implement proper authentication for user uploads
   - For webhooks, implement signature verification to ensure they're coming from your system

5. **Webhook Considerations**:
   - Use a service like Socket.IO or Pusher for real-time updates
   - For production, consider using a managed service like Ably or Pusher instead of self-hosting Socket.IO
   - Implement retry logic for webhook deliveries (already built into our WebhookService)
   - Add webhook signature verification for security

## Conclusion

This architecture provides a robust solution for handling file uploads in a serverless environment. By leveraging next-queue with PostgreSQL, you can process files asynchronously while providing a responsive user experience, all within the constraints of Vercel's serverless platform.
