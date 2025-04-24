import { Job, JobOptions } from './types';

export class QueueClient {
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a new job
   * @param taskName Name of the task to execute
   * @param payload Data to pass to the task
   * @param options Optional job configuration
   */
  async createJob(taskName: string, payload: any, options?: JobOptions): Promise<Job> {
    const response = await fetch(`${this.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskName,
        payload,
        options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create job: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload a file and create a job to process it
   * @param file The file to upload
   * @param options Optional job configuration
   */
  async uploadFile(file: File, options?: JobOptions): Promise<Job> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options) {
      formData.append('options', JSON.stringify(options));
    }

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get the status of a job
   * @param jobId ID of the job to check
   */
  async getJobStatus(jobId: string): Promise<Job> {
    const response = await fetch(`${this.baseUrl}/job-status?id=${jobId}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get the result of a completed job
   * @param jobId ID of the job to get result for
   */
  async getJobResult(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/job-status?id=${jobId}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job result: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  }

  /**
   * List jobs with optional filtering
   * @param filter Optional filter criteria
   */
  async listJobs(filter?: { status?: string; taskName?: string }): Promise<Job[]> {
    const queryParams = new URLSearchParams();
    if (filter?.status) queryParams.append('status', filter.status);
    if (filter?.taskName) queryParams.append('taskName', filter.taskName);

    const response = await fetch(`${this.baseUrl}/jobs?${queryParams.toString()}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pendingCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    const response = await fetch(`${this.baseUrl}/stats`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get queue stats: ${response.statusText}`);
    }

    return response.json();
  }
} 