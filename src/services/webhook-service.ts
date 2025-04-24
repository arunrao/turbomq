import axios from 'axios';
import { Job } from '../types';

/**
 * Service for sending webhook notifications
 */
export class WebhookService {
  /**
   * Send a webhook notification for a job
   * @param job The job to send a notification for
   * @param result Optional job result to include in the notification
   */
  static async sendNotification(job: Job, result?: any): Promise<boolean> {
    // Skip if no webhook URL is defined
    if (!job.webhookUrl) {
      return false;
    }

    try {
      // Prepare webhook payload
      const payload = {
        jobId: job.id,
        taskName: job.taskName,
        status: job.status,
        progress: job.progress || 0,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        result: result || null,
      };

      // Set default headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'NextQueue-Webhook/1.0',
        ...job.webhookHeaders, // Add any custom headers
      };

      // Send the webhook
      const response = await axios.post(job.webhookUrl, payload, { headers });
      
      console.log(`Webhook sent for job ${job.id} to ${job.webhookUrl}, status: ${response.status}`);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error(`Webhook failed for job ${job.id}:`, error);
      return false;
    }
  }

  /**
   * Retry sending a webhook notification with exponential backoff
   * @param job The job to send a notification for
   * @param result Optional job result to include in the notification
   * @param maxRetries Maximum number of retry attempts
   * @param initialDelay Initial delay in milliseconds
   */
  static async sendWithRetry(
    job: Job, 
    result?: any, 
    maxRetries: number = 3, 
    initialDelay: number = 1000
  ): Promise<boolean> {
    let retries = 0;
    let delay = initialDelay;

    while (retries <= maxRetries) {
      const success = await this.sendNotification(job, result);
      
      if (success) {
        return true;
      }

      // If we've reached max retries, give up
      if (retries === maxRetries) {
        console.error(`Webhook for job ${job.id} failed after ${maxRetries} retries`);
        return false;
      }

      // Exponential backoff with jitter
      delay = delay * 2 + Math.floor(Math.random() * 1000);
      console.log(`Retrying webhook for job ${job.id} in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      retries++;
    }

    return false;
  }
}
