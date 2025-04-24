import React, { useEffect, useState } from 'react';
import { getSocketInstance } from '../lib/socket';

interface WebhookListenerProps {
  onJobUpdate: (jobData: any) => void;
  jobId: string;
}

export default function WebhookListener({ onJobUpdate, jobId }: WebhookListenerProps) {
  const [isJobCompleted, setIsJobCompleted] = useState(false);

  // First, check if the job is already completed before establishing a socket connection
  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    
    const checkJobStatus = async () => {
      if (!isMounted) return false;
      
      try {
        // Add cache-busting parameter to prevent stale responses
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/job-status?id=${jobId}&_t=${timestamp}`, {
          // Add headers to prevent caching
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        if (!isMounted) return false;
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'completed' || data.status === 'failed') {
            console.log(`Job ${jobId} is already ${data.status}, not establishing socket connection`);
            setIsJobCompleted(true);
            // Update the job data one last time
            onJobUpdate(data);
            return true;
          }
        } else if (response.status === 404) {
          // Job doesn't exist anymore (likely deleted during cleanup)
          console.log(`Job ${jobId} not found (404), marking as completed`);
          setIsJobCompleted(true);
          // Create a fake completed job data to update the UI
          const fakeCompletedJob = {
            id: jobId,
            status: 'completed',
            progress: 100,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            result: { message: 'Job not found or was deleted' }
          };
          onJobUpdate(fakeCompletedJob);
          return true;
        } else {
          throw new Error(`HTTP error ${response.status}`);
        }
        return false;
      } catch (error) {
        console.error('Error checking job status:', error);
        
        // Only retry for network errors, not for 404s
        const isNetworkError = error instanceof Error && 
          !(error.message.includes('404') || error.message.includes('not found'));
        
        if (isNetworkError && retryCount < maxRetries && isMounted) {
          retryCount++;
          console.log(`Retrying job status check (${retryCount}/${maxRetries})...`);
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          setTimeout(checkJobStatus, delay);
        } else if (!isNetworkError) {
          // If it's a 404 or other non-network error, don't retry
          console.log('Not retrying due to non-network error');
          setIsJobCompleted(true);
        }
        
        return false;
      }
    };
    
    checkJobStatus();
    
    return () => {
      isMounted = false;
    };
  }, [jobId, onJobUpdate]);

  // Only establish socket connection if job is not completed
  useEffect(() => {
    if (isJobCompleted) {
      console.log(`Job ${jobId} is already completed, not establishing socket connection`);
      return;
    }
    
    let socketInstance: any = null;
    let connectionAttempts = 0;
    const maxConnectionAttempts = 3;
    
    const connectSocket = () => {
      try {
        console.log(`Establishing socket connection for job ${jobId}...`);
        socketInstance = getSocketInstance();
        
        // Handle connection error
        socketInstance.on('connect_error', (error: any) => {
          console.error(`Socket connection error for job ${jobId}:`, error);
          if (connectionAttempts < maxConnectionAttempts) {
            connectionAttempts++;
            console.log(`Retrying socket connection (${connectionAttempts}/${maxConnectionAttempts})...`);
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 5000);
            setTimeout(() => {
              if (socketInstance) {
                socketInstance.disconnect();
              }
              connectSocket();
            }, delay);
          }
        });
        
        // Handle successful connection
        socketInstance.on('connect', () => {
          console.log(`Socket connected for job ${jobId}`);
          // Join the job-specific room
          socketInstance.emit('join-job', jobId);
        });
        
        // Handle check-job-status event from server
        socketInstance.on('check-job-status', async ({ jobId: checkedJobId }: { jobId: string }) => {
          if (checkedJobId === jobId) {
            try {
              const timestamp = new Date().getTime();
              const response = await fetch(`/api/job-status?id=${jobId}&_t=${timestamp}`, {
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.status === 'completed' || data.status === 'failed') {
                  console.log(`Job ${jobId} is already ${data.status}, leaving room and disconnecting`);
                  setIsJobCompleted(true);
                  socketInstance.emit('leave-job', jobId);
                  cleanupSocket(socketInstance);
                }
              } else if (response.status === 404) {
                // Job doesn't exist anymore (likely deleted during cleanup)
                console.log(`Job ${jobId} not found (404), leaving room and disconnecting`);
                setIsJobCompleted(true);
                // Create a fake completed job data to update the UI
                const fakeCompletedJob = {
                  id: jobId,
                  status: 'completed',
                  progress: 100,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  result: { message: 'Job not found or was deleted' }
                };
                onJobUpdate(fakeCompletedJob);
                socketInstance.emit('leave-job', jobId);
                cleanupSocket(socketInstance);
              }
            } catch (error) {
              console.error('Error checking job status:', error);
              // If there's an error, we should still try to clean up
              if (error instanceof Error && 
                  (error.message.includes('404') || error.message.includes('not found'))) {
                console.log(`Error indicates job ${jobId} not found, disconnecting socket`);
                setIsJobCompleted(true);
                socketInstance.emit('leave-job', jobId);
                cleanupSocket(socketInstance);
              }
            }
          }
        });
        
        // Listen for job updates (both global and job-specific)
        socketInstance.on('job-update', (data: any) => {
          // Only process updates for our specific job
          if (data.jobId === jobId) {
            console.log(`Received update for job ${jobId}:`, data);
            onJobUpdate(data);
            
            // Disconnect socket if job is completed or failed
            if (data.status === 'completed' || data.status === 'failed') {
              console.log(`Job ${jobId} is ${data.status}, leaving room and disconnecting socket`);
              setIsJobCompleted(true);
              socketInstance.emit('leave-job', jobId);
              cleanupSocket(socketInstance);
            }
          }
        });
      } catch (error) {
        console.error(`Error establishing socket connection for job ${jobId}:`, error);
      }
    };
    
    const cleanupSocket = (socket: any) => {
      if (!socket) return;
      
      try {
        socket.off('job-update');
        socket.off('connect');
        socket.off('connect_error');
        socket.off('check-job-status');
        socket.disconnect();
      } catch (error) {
        console.error(`Error cleaning up socket for job ${jobId}:`, error);
      }
    };
    
    connectSocket();
    
    return () => {
      console.log(`Cleaning up socket connection for job ${jobId}...`);
      if (socketInstance) {
        try {
          socketInstance.emit('leave-job', jobId);
          cleanupSocket(socketInstance);
        } catch (error) {
          console.error(`Error during cleanup for job ${jobId}:`, error);
        }
      }
    };
  }, [jobId, isJobCompleted, onJobUpdate]);

  // This component doesn't render anything visible
  return (
    <div style={{ display: 'none' }}>
      {/* Hidden component that listens for webhook events */}
    </div>
  );
}
