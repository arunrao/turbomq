import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import JobStatus from '../components/JobStatus';

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobId, setJobId] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobError, setJobError] = useState<string>('');
  const [jobResult, setJobResult] = useState<any>(null);
  const [isConnected, setConnected] = useState(false);
  
  // Initialize Socket.IO connection when the page loads
  useEffect(() => {
    console.log('Initializing Socket.IO connection...');
    
    // Call the Socket.IO initialization endpoint
    fetch('/api/socketio')
      .then(response => {
        console.log('Socket.IO initialization response status:', response.status);
        if (!response.ok) {
          throw new Error(`Failed to initialize Socket.IO: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Socket.IO initialization successful:', data);
        if (data.connected) {
          setConnected(true);
        } else {
          throw new Error('Socket.IO initialization failed: Server not connected');
        }
      })
      .catch(error => {
        console.error('Socket.IO initialization error:', error);
        setConnected(false);
      });
  }, []);
  
  // Handle job creation
  const handleJobCreated = (id: string, showProgress = false) => {
    setJobId(id);
    setIsProcessing(false);
    if (!showProgress) {
      // Reset upload progress if we're not showing it
      setUploadProgress(undefined);
      setShowProgressBar(false);
    }
  };
  
  // Handle upload progress
  const handleUploadProgress = (progress: number) => {
    setUploadProgress(progress);
    setShowProgressBar(true);
  };
  
  // Handle job status updates
  const handleJobUpdate = (data: any) => {
    setJobStatus(data.status);
    setJobProgress(data.progress || 0);
    setJobError(data.error || '');
    setJobResult(data.result || null);
    if (data.status === 'completed' || data.status === 'failed') {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="container">
      <Head>
        <title>Next-Queue Browser Example</title>
        <meta name="description" content="Example of next-queue with webhooks" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>Next-Queue Browser Example</h1>
        
        <div className="card">
          <h2>File Upload Example</h2>
          <p>Upload a file to process it using the next-queue system.</p>
          <p>Choose between client polling or webhooks for status updates.</p>
          
          {!isConnected && (
            <div className="connection-warning">
              Not connected to server
            </div>
          )}
          
          <FileUpload 
            onJobCreated={handleJobCreated} 
            onUploadProgress={handleUploadProgress} 
          />
          
          {isProcessing && (
            <div className="processing-indicator">
              Processing job... {jobStatus && `(${jobStatus})`}
              {jobProgress > 0 && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${jobProgress}%` }} />
                </div>
              )}
              {jobError && (
                <div className="error-message">
                  Error: {jobError}
                </div>
              )}
              {jobResult && (
                <div className="result-message">
                  Result: {JSON.stringify(jobResult)}
                </div>
              )}
            </div>
          )}
          
          {(jobId || showProgressBar) && (
            <div className="status-section">
              <h3>Job Status</h3>
              {jobId ? (
                <JobStatus 
                  jobId={jobId} 
                  onComplete={handleJobUpdate}
                />
              ) : showProgressBar && (
                <div className="progress-container">
                  <div className="progress-label">
                    Upload Progress: {uploadProgress || 0}%
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${uploadProgress || 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="info-section">
          <h2>How It Works</h2>
          <p>This example demonstrates two approaches to tracking job progress:</p>
          <ul>
            <li><strong>Client Polling:</strong> The client periodically checks the job status</li>
            <li><strong>Webhooks:</strong> The server notifies the client when the job status changes</li>
          </ul>
          <p>Both approaches use the same underlying queue system, but webhooks are more efficient for long-running jobs.</p>
        </div>
      </main>

      <footer>
        <p>Powered by next-queue</p>
      </footer>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          max-width: 800px;
          margin: 0 auto;
        }

        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 100%;
          max-width: 800px;
        }

        h1 {
          margin: 0 0 2rem 0;
          line-height: 1.15;
          font-size: 2.5rem;
          text-align: center;
        }

        h2 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        h3 {
          margin: 1.5rem 0 0.5rem 0;
          font-size: 1.25rem;
        }

        .card {
          width: 100%;
          padding: 1.5rem;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          margin-bottom: 2rem;
        }

        .info-section {
          width: 100%;
        }

        .status-section {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #eaeaea;
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

        .processing-indicator {
          margin: 1rem 0;
          padding: 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          text-align: center;
          color: #4b5563;
        }

        ul {
          padding-left: 1.5rem;
        }

        li {
          margin-bottom: 0.5rem;
        }

        .connection-warning {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: #fef2f2;
          border: 1px solid #fde2e2;
          border-radius: 4px;
          text-align: center;
          color: #b91c1c;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
