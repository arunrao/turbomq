import React, { useState } from 'react';
import { QueueClient } from '../../../src/client';
import JobStatus from './JobStatus';

export default function JobCreator() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWebhook, setUseWebhook] = useState<boolean>(false);

  const handleCreateJob = async () => {
    try {
      setError(null);
      const queue = new QueueClient();
      
      // Create a job with some test data
      const job = await queue.createJob('processFile', {
        fileName: 'test.pdf',
        fileSize: 1024,
        timestamp: new Date().toISOString()
      }, {
        priority: 1,
        maxAttempts: 3,
        webhookUrl: useWebhook ? `${window.location.origin}/api/webhook-receiver` : undefined
      });

      setJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  return (
    <div className="job-creator">
      <h2>Create a Test Job</h2>
      
      <div className="form-group checkbox">
        <label>
          <input 
            type="checkbox" 
            checked={useWebhook} 
            onChange={() => setUseWebhook(!useWebhook)} 
          />
          <span>Use webhooks instead of polling</span>
        </label>
        {useWebhook && (
          <p className="info-text">
            Updates will be sent via WebSocket when processing completes
          </p>
        )}
      </div>
      
      <button onClick={handleCreateJob} disabled={!!jobId}>
        Create Test Job
      </button>
      
      {error && <p className="error">{error}</p>}
      
      {jobId && (
        <div className="job-status-container">
          <h3>Job Status</h3>
          <JobStatus jobId={jobId} />
        </div>
      )}
      
      <style jsx>{`
        .job-creator {
          padding: 1rem;
          border: 1px solid #eaeaea;
          border-radius: 5px;
          background: #fafafa;
          margin-bottom: 1rem;
        }
        
        h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }
        
        .form-group {
          margin-bottom: 1rem;
        }
        
        .checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .info-text {
          font-size: 0.875rem;
          color: #666;
          margin-top: 0.5rem;
        }
        
        button {
          padding: 0.5rem 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:disabled {
          background: #93c5fd;
          cursor: not-allowed;
        }
        
        .error {
          color: #ef4444;
          margin-top: 1rem;
        }
        
        .job-status-container {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #eaeaea;
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
} 