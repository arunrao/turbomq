import React, { useState, useEffect } from 'react';

interface JobProgressProps {
  jobId: string;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
  pollingInterval?: number;
}

interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  lastError?: string;
  result?: any;
}

export const JobProgressMonitor: React.FC<JobProgressProps> = ({
  jobId,
  onComplete,
  onError,
  pollingInterval = 2000,
}) => {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let mounted = true;
    let intervalId: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      try {
        const response = await fetch(`/api/queue/job-status?jobId=${jobId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch job status: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (mounted) {
          setJob(data.job);
          setLoading(false);
          
          // If job is completed, call onComplete callback
          if (data.job.status === 'completed' && onComplete && data.result) {
            onComplete(data.result);
            // Clear the interval once the job is complete
            clearInterval(intervalId);
          }
          
          // If job failed, call onError callback
          if (data.job.status === 'failed' && onError) {
            onError(new Error(data.job.lastError || 'Job failed'));
            // Clear the interval once the job has failed
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        if (mounted) {
          setError((err as Error).message);
          setLoading(false);
          if (onError) onError(err as Error);
        }
      }
    };

    // Fetch immediately
    fetchJobStatus();
    
    // Then set up polling
    intervalId = setInterval(fetchJobStatus, pollingInterval);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [jobId, onComplete, onError, pollingInterval]);

  if (loading) {
    return <div className="loading">Loading job status...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!job) {
    return <div className="not-found">Job not found</div>;
  }

  return (
    <div className="job-progress">
      <div className="job-info">
        <h3>Job: {job.id}</h3>
        <div className="status">Status: {job.status}</div>
      </div>
      
      <div className="progress-container">
        <div 
          className="progress-bar" 
          style={{ width: `${job.progress}%` }}
          data-status={job.status}
        />
        <div className="progress-text">{job.progress}%</div>
      </div>
      
      {job.lastError && (
        <div className="error-message">
          Error: {job.lastError}
        </div>
      )}
      
      {job.status === 'completed' && (
        <div className="success-message">
          Job completed successfully!
        </div>
      )}
    </div>
  );
};

// Example usage:
/*
function MyComponent() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  const handleStartJob = async () => {
    try {
      const response = await fetch('/api/queue/add-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName: 'processImage',
          payload: { imageId: 'img123', width: 800, height: 600 }
        })
      });
      
      const data = await response.json();
      setJobId(data.job.id);
    } catch (error) {
      console.error('Error starting job:', error);
    }
  };
  
  const handleJobComplete = (jobResult: any) => {
    setResult(jobResult);
  };
  
  return (
    <div>
      <button onClick={handleStartJob}>Start Processing</button>
      
      {jobId && (
        <JobProgressMonitor 
          jobId={jobId}
          onComplete={handleJobComplete}
          onError={(err) => console.error('Job error:', err)}
        />
      )}
      
      {result && (
        <div className="result">
          <h3>Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
*/
