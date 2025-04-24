import React, { useState, useEffect } from 'react';
import WebhookListener from './WebhookListener';
import { QueueClient } from '../../../src/client';
import { Job } from '../../../src/types';

interface JobStatusProps {
  jobId: string;
  uploadProgress?: number;
  onJobUpdate?: (data: any) => void;
}

interface JobWithResult extends Job {
  result?: any;
}

export default function JobStatus({ jobId, uploadProgress, onJobUpdate }: JobStatusProps) {
  const [job, setJob] = useState<JobWithResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState<boolean>(uploadProgress !== undefined);
  const [isJobCompleted, setIsJobCompleted] = useState(false);
  const [isJobStarted, setIsJobStarted] = useState(false);
  const queue = new QueueClient();

  // Function to fetch job status
  const fetchJobStatus = async () => {
    // Skip fetching if job is already completed or failed
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      return;
    }

    try {
      const data = await queue.getJobStatus(jobId);
      setJob(data as JobWithResult);
      setLoading(false);
      
      // Mark job as started if we get a valid response
      if (!isJobStarted) {
        setIsJobStarted(true);
      }
      
      // Call the onJobUpdate callback if provided
      if (onJobUpdate) {
        onJobUpdate(data);
      }
      
      // If job is completed or failed, stop polling
      if (data.status === 'completed' || data.status === 'failed') {
        setIsJobCompleted(true);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (err) {
      console.error('Error fetching job status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch job status');
      setLoading(false);
      
      // Check if error is related to job not found (404)
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        console.log('Job not found error detected, stopping polling');
        setIsJobCompleted(true);
      }
      
      // Stop polling on error
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  };

  // Handle webhook updates
  const handleWebhookUpdate = (data: any) => {
    // Only update if this is for our job
    if (data.jobId === jobId) {
      console.log(`Received webhook update for job ${jobId}:`, data);
      
      // Update job data with the received information
      setJob(prevJob => {
        if (!prevJob) return null;
        
        const updatedJob = {
          ...prevJob,
          status: data.status || prevJob.status,
          progress: data.progress !== undefined ? data.progress : prevJob.progress,
          result: data.result || prevJob.result,
          updatedAt: new Date(data.updatedAt || prevJob.updatedAt),
        };
        
        // Call the onJobUpdate callback if provided
        if (onJobUpdate) {
          onJobUpdate(updatedJob);
        }
        
        return updatedJob;
      });
      
      // Stop polling if job is completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
        console.log(`Job ${jobId} completed via webhook, stopping polling`);
        setIsJobCompleted(true);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    }
  };

  // Handle upload progress updates
  useEffect(() => {
    if (uploadProgress !== undefined) {
      setShowUploadProgress(true);
      
      // Create a temporary job object for upload progress
      if (!job) {
        setJob({
          id: jobId,
          taskName: 'upload',
          status: 'pending',
          progress: uploadProgress,
          priority: 0,
          runAt: new Date(),
          attemptsMade: 0,
          maxAttempts: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          payload: { fileName: 'uploading...' }
        });
      } else if (job.status !== 'completed' && job.status !== 'failed') {
        // Only update progress if job is not completed or failed
        setJob(prevJob => ({
          ...prevJob!,
          progress: uploadProgress
        }));
      }
    }
  }, [uploadProgress, jobId, job]);

  // Update isJobCompleted when job status changes
  useEffect(() => {
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      setIsJobCompleted(true);
      // Clear any existing polling intervals
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [job, pollingInterval]);
  
  // Initial fetch and polling setup
  useEffect(() => {
    // Reset completion state when job ID changes
    setIsJobCompleted(false);
    setIsJobStarted(false);
    
    // Fetch job status immediately
    fetchJobStatus();
    
    // Only set up polling if job is not already known to be completed
    if (!isJobCompleted) {
      const interval = setInterval(() => {
        // Only continue polling if the job is not completed or failed
        if (!isJobCompleted && isJobStarted) {
          fetchJobStatus();
        } else {
          // Stop polling if job is completed or failed
          clearInterval(interval);
        }
      }, 2000);
      
      setPollingInterval(interval);
      
      // Clean up on unmount or when job ID changes
      return () => {
        clearInterval(interval);
      };
    }
    
    return undefined;
  }, [jobId, isJobCompleted, isJobStarted]);
  
  // Clean up any lingering intervals when component unmounts
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  if (loading && !showUploadProgress) {
    return <div className="loading">Loading job status...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!job) {
    return <div className="error">Job not found</div>;
  }

  // Determine if we're using webhooks
  const usingWebhooks = !!job.webhookUrl;

  return (
    <div className="job-status">
      {/* Status information */}
      <div className="status-info">
        <div className="status-row">
          <span className="label">Status:</span>
          <span className={`value status-${job.status}`}>{job.status}</span>
        </div>
        
        <div className="status-row">
          <span className="label">Job ID:</span>
          <span className="value">{job.id}</span>
        </div>
        
        <div className="status-row">
          <span className="label">Created:</span>
          <span className="value">{new Date(job.createdAt).toLocaleString()}</span>
        </div>
        
        <div className="status-row">
          <span className="label">Updated:</span>
          <span className="value">{new Date(job.updatedAt).toLocaleString()}</span>
        </div>
        
        <div className="status-row">
          <span className="label">Updates via:</span>
          <span className="value">{usingWebhooks ? 'Webhooks' : 'Polling'}</span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="progress-container">
        <div className="progress-label">
          Progress: {job.progress || 0}%
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${job.progress || 0}%` }}
          />
        </div>
      </div>
      
      {/* Result (if available) */}
      {job.status === 'completed' && job.result && (
        <div className="result">
          <h4>Result:</h4>
          <pre>{JSON.stringify(job.result, null, 2)}</pre>
        </div>
      )}
      
      {/* Error (if failed) */}
      {job.status === 'failed' && job.result && job.result.error && (
        <div className="error-result">
          <h4>Error:</h4>
          <pre>{job.result.error}</pre>
        </div>
      )}
      
      {/* Webhook listener (if using webhooks) */}
      {usingWebhooks && <WebhookListener onJobUpdate={handleWebhookUpdate} jobId={jobId} />}
      
      <style jsx>{`
        .job-status {
          padding: 1rem;
          border: 1px solid #eaeaea;
          border-radius: 5px;
          background: #fafafa;
        }
        
        .status-info {
          margin-bottom: 1rem;
        }
        
        .status-row {
          display: flex;
          margin-bottom: 0.5rem;
        }
        
        .label {
          width: 100px;
          font-weight: 500;
        }
        
        .value {
          flex: 1;
        }
        
        .status-pending {
          color: #f59e0b;
        }
        
        .status-running {
          color: #3b82f6;
        }
        
        .status-completed {
          color: #10b981;
        }
        
        .status-failed {
          color: #ef4444;
        }
        
        .progress-container {
          margin: 1rem 0;
        }
        
        .progress-label {
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }
        
        .progress-bar {
          height: 10px;
          background: #eaeaea;
          border-radius: 5px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }
        
        .result, .error-result {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 5px;
        }
        
        .result {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
        }
        
        .error-result {
          background: #fef2f2;
          border: 1px solid #fecaca;
        }
        
        h4 {
          margin-top: 0;
          margin-bottom: 0.5rem;
        }
        
        pre {
          background: rgba(0, 0, 0, 0.05);
          padding: 0.5rem;
          border-radius: 3px;
          overflow: auto;
          font-size: 0.875rem;
        }
        
        .loading {
          padding: 1rem;
          color: #666;
        }
        
        .error {
          padding: 1rem;
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
