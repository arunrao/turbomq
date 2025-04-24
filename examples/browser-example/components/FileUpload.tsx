import React, { useState, FormEvent, ChangeEvent } from 'react';

interface FileUploadProps {
  onJobCreated: (jobId: string, showProgress?: boolean) => void;
  onUploadProgress?: (progress: number) => void;
}

export default function FileUpload({ onJobCreated, onUploadProgress }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useWebhook, setUseWebhook] = useState<boolean>(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
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
      
      // Create an XMLHttpRequest to track upload progress
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      if (onUploadProgress) {
        // Start with 0% progress
        onUploadProgress(0);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onUploadProgress(percentComplete);
          }
        };
      }
      
      // Create a promise to handle the XHR response
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.open('POST', '/api/upload');
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });
      
      // Wait for the upload to complete
      const data = await uploadPromise;
      
      // Call the onJobCreated callback with the job ID
      onJobCreated(data.jobId, true);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      // Reset progress if there was an error
      if (onUploadProgress) {
        onUploadProgress(0);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="file-input">Select a file to process:</label>
          <input 
            id="file-input"
            type="file" 
            onChange={handleFileChange} 
            disabled={uploading}
          />
          {file && <p className="file-info">Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)</p>}
        </div>
        
        <div className="form-group checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={useWebhook} 
              onChange={() => setUseWebhook(!useWebhook)} 
              disabled={uploading}
            />
            <span>Use webhooks instead of polling</span>
          </label>
          {useWebhook && (
            <p className="info-text">
              Updates will be sent via WebSocket when processing completes
            </p>
          )}
        </div>
        
        <button 
          type="submit" 
          disabled={!file || uploading}
          className={uploading ? 'loading' : ''}
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
        
        {error && <p className="error">{error}</p>}
      </form>

      <style jsx>{`
        .upload-container {
          margin: 1rem 0;
        }
        
        .form-group {
          margin-bottom: 1rem;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }
        
        .checkbox {
          display: flex;
          align-items: center;
        }
        
        .checkbox label {
          display: flex;
          align-items: center;
          margin-bottom: 0;
        }
        
        .checkbox span {
          margin-left: 0.5rem;
        }
        
        .info-text {
          margin: 0.5rem 0 0 1.5rem;
          font-size: 0.875rem;
          color: #666;
        }
        
        .file-info {
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: #666;
        }
        
        button {
          padding: 0.5rem 1rem;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.2s;
        }
        
        button:hover:not(:disabled) {
          background-color: #0051a8;
        }
        
        button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        
        button.loading {
          position: relative;
          color: transparent;
        }
        
        button.loading:after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 1rem;
          height: 1rem;
          margin-left: -0.5rem;
          margin-top: -0.5rem;
          border: 2px solid white;
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .error {
          color: #e00;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
