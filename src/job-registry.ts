import { JobHandler, JobOptions } from './types';

export interface JobType {
  name: string;
  description: string;
  handler: JobHandler;
  defaultOptions?: JobOptions;
  validatePayload?: (payload: any) => boolean;
}

export class JobRegistry {
  private static instance: JobRegistry;
  private jobTypes: Map<string, JobType> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): JobRegistry {
    if (!JobRegistry.instance) {
      JobRegistry.instance = new JobRegistry();
    }
    return JobRegistry.instance;
  }

  /**
   * Register a new job type
   * @param jobType The job type to register
   */
  registerJobType(jobType: JobType): void {
    if (this.jobTypes.has(jobType.name)) {
      throw new Error(`Job type ${jobType.name} is already registered`);
    }
    this.jobTypes.set(jobType.name, jobType);
  }

  /**
   * Register multiple job types at once
   * @param jobTypes Array of job types to register
   */
  registerJobTypes(jobTypes: JobType[]): void {
    jobTypes.forEach(jobType => this.registerJobType(jobType));
  }

  /**
   * Get a registered job type
   * @param name Name of the job type
   */
  getJobType(name: string): JobType | undefined {
    return this.jobTypes.get(name);
  }

  /**
   * Get all registered job types
   */
  getAllJobTypes(): JobType[] {
    return Array.from(this.jobTypes.values());
  }

  /**
   * Check if a job type is registered
   * @param name Name of the job type
   */
  hasJobType(name: string): boolean {
    return this.jobTypes.has(name);
  }

  /**
   * Validate a job payload against its type's validation rules
   * @param jobTypeName Name of the job type
   * @param payload Payload to validate
   */
  validateJobPayload(jobTypeName: string, payload: any): boolean {
    const jobType = this.getJobType(jobTypeName);
    if (!jobType) {
      throw new Error(`Job type ${jobTypeName} is not registered`);
    }
    if (!jobType.validatePayload) {
      return true; // No validation rules defined
    }
    return jobType.validatePayload(payload);
  }

  /**
   * Get default options for a job type
   * @param name Name of the job type
   */
  getDefaultOptions(name: string): JobOptions | undefined {
    return this.getJobType(name)?.defaultOptions;
  }
}

// Example job type definitions
export const defaultJobTypes: JobType[] = [
  {
    name: 'processFile',
    description: 'Process an uploaded file',
    handler: async (_payload, _helpers) => {
      // File processing logic
      return { success: true };
    },
    defaultOptions: {
      maxAttempts: 3,
      priority: 1
    },
    validatePayload: (payload) => {
      return payload && typeof payload.fileName === 'string';
    }
  },
  {
    name: 'sendEmail',
    description: 'Send an email',
    handler: async (_payload, _helpers) => {
      // Email sending logic
      return { success: true };
    },
    defaultOptions: {
      maxAttempts: 5,
      priority: 2
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.to === 'string' && 
             typeof payload.subject === 'string' && 
             typeof payload.body === 'string';
    }
  },
  {
    name: 'generateReport',
    description: 'Generate a report',
    handler: async (_payload, _helpers) => {
      // Report generation logic
      return { success: true };
    },
    defaultOptions: {
      maxAttempts: 3,
      priority: 1
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.reportType === 'string' && 
             payload.dateRange && 
             typeof payload.dateRange.start === 'string' && 
             typeof payload.dateRange.end === 'string';
    }
  }
]; 