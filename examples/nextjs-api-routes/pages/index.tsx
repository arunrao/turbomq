import React, { useState, useEffect } from 'react';
import { JobProgressMonitor } from '../components/JobProgressMonitor';

interface Job {
  id: string;
  taskName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  createdAt: string;
  progress?: number;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskName, setTaskName] = useState('sendEmail');
  const [payload, setPayload] = useState('{\n  "to": "user@example.com",\n  "subject": "Hello",\n  "body": "This is a test email"\n}');
  const [priority, setPriority] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);

  // Fetch jobs on component mount
  useEffect(() => {
    fetchJobs();
    // Set up polling to refresh job list every 5 seconds
    const intervalId = setInterval(fetchJobs, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/queue/list-jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setLoading(false);
    }
  };

  const handleAddJob = async () => {
    try {
      // Parse the payload JSON
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payload);
      } catch (error) {
        alert('Invalid JSON payload');
        return;
      }

      const response = await fetch('/api/queue/add-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName,
          payload: parsedPayload,
          options: { priority: Number(priority) }
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Job added with ID: ${data.job.id}`);
        fetchJobs();
      } else {
        const error = await response.json();
        alert(`Error adding job: ${error.error}`);
      }
    } catch (error) {
      console.error('Error adding job:', error);
      alert(`Error adding job: ${(error as Error).message}`);
    }
  };

  const handleProcessJobs = async () => {
    try {
      const response = await fetch('/api/queue/process-jobs', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Processed ${data.processedCount} jobs`);
        fetchJobs();
      } else {
        const error = await response.json();
        alert(`Error processing jobs: ${error.error}`);
      }
    } catch (error) {
      console.error('Error processing jobs:', error);
      alert(`Error processing jobs: ${(error as Error).message}`);
    }
  };

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    setJobResult(null);
  };

  const handleJobComplete = (result: any) => {
    setJobResult(result);
  };

  return (
    <div className="container">
      <h1>Next.js Job Queue System</h1>

      <div className="grid">
        <div className="job-form">
          <h2>Add New Job</h2>
          <div className="form-group">
            <label>Task Name:</label>
            <select value={taskName} onChange={(e) => setTaskName(e.target.value)}>
              <option value="sendEmail">Send Email</option>
              <option value="processImage">Process Image</option>
              <option value="importData">Import Data</option>
              <option value="generateReport">Generate Report</option>
            </select>
          </div>

          <div className="form-group">
            <label>Payload (JSON):</label>
            <textarea
              rows={6}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Priority:</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>

          <button onClick={handleAddJob}>Add Job</button>
        </div>

        <div className="job-list">
          <div className="header-row">
            <h2>Job List</h2>
            <button onClick={handleProcessJobs}>Process Jobs</button>
          </div>

          {loading ? (
            <p>Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p>No jobs found</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className={job.status}>
                    <td>{job.id.substring(0, 8)}...</td>
                    <td>{job.taskName}</td>
                    <td>{job.status}</td>
                    <td>{job.priority}</td>
                    <td>{new Date(job.createdAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => handleJobSelect(job.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedJobId && (
        <div className="job-details">
          <h2>Job Progress</h2>
          <JobProgressMonitor
            jobId={selectedJobId}
            onComplete={handleJobComplete}
            pollingInterval={1000}
          />

          {jobResult && (
            <div className="job-result">
              <h3>Job Result:</h3>
              <pre>{JSON.stringify(jobResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        
        h1 {
          color: #333;
          margin-bottom: 30px;
        }
        
        .grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 30px;
          margin-bottom: 30px;
        }
        
        .job-form, .job-list {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
        }
        
        input, select, textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        
        button {
          background: #0070f3;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        button:hover {
          background: #0051a8;
        }
        
        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th, td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        
        th {
          background: #f2f2f2;
        }
        
        tr.pending {
          background: #fff9c4;
        }
        
        tr.running {
          background: #e3f2fd;
        }
        
        tr.completed {
          background: #e8f5e9;
        }
        
        tr.failed {
          background: #ffebee;
        }
        
        .job-details {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .job-result {
          margin-top: 20px;
          padding: 15px;
          background: #f5f5f5;
          border-radius: 4px;
        }
        
        pre {
          background: #eee;
          padding: 10px;
          border-radius: 4px;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}
