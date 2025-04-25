import { useEffect, useState } from 'react';
import { Job } from '../lib/queue';

interface JobStatusProps {
  jobId: string;
  onComplete?: (result: any) => void;
}

export default function JobStatus({ jobId, onComplete }: JobStatusProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Initial fetch
    fetch(`/api/job-status?id=${jobId}`)
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        if (data.error) {
          setError(data.error);
        } else {
          setJob(data);
        }
      })
      .catch(err => {
        if (!mounted) return;
        setError(err.message);
      });

    // Set up polling with exponential backoff
    let pollInterval = 2000; // Start with 2 seconds
    const maxInterval = 10000; // Max 10 seconds
    let timeoutId: NodeJS.Timeout;

    const poll = () => {
      if (!mounted) return;

      fetch(`/api/job-status?id=${jobId}`)
        .then(res => res.json())
        .then(data => {
          if (!mounted) return;
          if (data.error) {
            setError(data.error);
          } else {
            setJob(data);
            
            // If job is completed or failed, stop polling
            if (data.status === 'completed' || data.status === 'failed') {
              if (onComplete && data.status === 'completed') {
                onComplete(data);
              }
              return;
            }
            
            // Continue polling with exponential backoff
            timeoutId = setTimeout(poll, Math.min(pollInterval * 1.5, maxInterval));
            pollInterval = Math.min(pollInterval * 1.5, maxInterval);
          }
        })
        .catch(err => {
          if (!mounted) return;
          setError(err.message);
          // On error, retry with exponential backoff
          timeoutId = setTimeout(poll, Math.min(pollInterval * 1.5, maxInterval));
          pollInterval = Math.min(pollInterval * 1.5, maxInterval);
        });
    };

    // Start polling
    timeoutId = setTimeout(poll, pollInterval);

    // Cleanup
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [jobId, onComplete]);

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!job) {
    return <div>Loading...</div>;
  }

  return (
    <div className="job-status">
      <h3>Job Status: {job.status}</h3>
      {job.progress !== undefined && (
        <div className="progress">
          <div 
            className="progress-bar" 
            style={{ width: `${job.progress}%` }}
          />
          <span>{job.progress}%</span>
        </div>
      )}
      {job.lastError && (
        <div className="error">Error: {job.lastError}</div>
      )}
    </div>
  );
}
