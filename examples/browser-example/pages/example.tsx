import { useState } from 'react';
import { QueueClient } from '../../../src/client';

// Initialize the queue client
const queueClient = new QueueClient();

export default function ExamplePage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // Example 1: Process a file
  const handleFileUpload = async (file: File) => {
    try {
      const job = await queueClient.uploadFile(file, {
        priority: 1,
        maxAttempts: 3
      });
      setJobId(job.id);
      setStatus('File upload job created');
    } catch (error) {
      console.error('Error uploading file:', error);
      setStatus('Error uploading file');
    }
  };

  // Example 2: Send an email
  const handleSendEmail = async () => {
    try {
      const job = await queueClient.createJob('sendEmail', {
        to: 'user@example.com',
        subject: 'Test Email',
        body: 'This is a test email'
      }, {
        priority: 2,
        maxAttempts: 5
      });
      setJobId(job.id);
      setStatus('Email job created');
    } catch (error) {
      console.error('Error creating email job:', error);
      setStatus('Error creating email job');
    }
  };

  // Example 3: Generate a report
  const handleGenerateReport = async () => {
    try {
      const job = await queueClient.createJob('generateReport', {
        reportType: 'monthly',
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-31'
        }
      });
      setJobId(job.id);
      setStatus('Report generation job created');
    } catch (error) {
      console.error('Error creating report job:', error);
      setStatus('Error creating report job');
    }
  };

  // Example 4: Resize an image
  const handleResizeImage = async () => {
    try {
      const job = await queueClient.createJob('resizeImage', {
        imageUrl: 'https://example.com/image.jpg',
        dimensions: {
          width: 800,
          height: 600
        }
      }, {
        priority: 2,
        maxAttempts: 3
      });
      setJobId(job.id);
      setStatus('Image resize job created');
    } catch (error) {
      console.error('Error creating image resize job:', error);
      setStatus('Error creating image resize job');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Job Queue Examples</h1>
      
      <div className="space-y-4">
        {/* File Upload Example */}
        <div className="border p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">1. Process File</h2>
          <input
            type="file"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="block mb-2"
          />
        </div>

        {/* Email Example */}
        <div className="border p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">2. Send Email</h2>
          <button
            onClick={handleSendEmail}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Send Test Email
          </button>
        </div>

        {/* Report Example */}
        <div className="border p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">3. Generate Report</h2>
          <button
            onClick={handleGenerateReport}
            className="bg-green-500 text-white px-4 py-2 rounded"
          >
            Generate Monthly Report
          </button>
        </div>

        {/* Image Resize Example */}
        <div className="border p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">4. Resize Image</h2>
          <button
            onClick={handleResizeImage}
            className="bg-purple-500 text-white px-4 py-2 rounded"
          >
            Resize Example Image
          </button>
        </div>

        {/* Status Display */}
        {status && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <p className="font-semibold">Status: {status}</p>
            {jobId && <p>Job ID: {jobId}</p>}
          </div>
        )}
      </div>
    </div>
  );
} 