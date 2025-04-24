import { Environment, EnvironmentConfig } from './types';

const configs: Record<Environment, EnvironmentConfig> = {
  local: {
    worker: {
      mode: 'continuous',
      pollInterval: 5000,
      maxExecutionTime: 0, // No time limit in local dev
      maxJobsPerBatch: Infinity,
      minWorkers: 1,
      maxWorkers: 4
    }
  },
  vercel: {
    worker: {
      mode: 'batch',
      pollInterval: 1000,
      maxExecutionTime: 25000, // Stay under Vercel's 30s limit
      maxJobsPerBatch: 5,
      minWorkers: 0,
      maxWorkers: 1
    }
  },
  amplify: {
    worker: {
      mode: 'batch',
      pollInterval: 1000,
      maxExecutionTime: 25000, // Similar limits to Vercel
      maxJobsPerBatch: 5,
      minWorkers: 0,
      maxWorkers: 1
    }
  },
  other: {
    worker: {
      mode: 'batch',
      pollInterval: 3000,
      maxExecutionTime: 55000, // Assume 60s limit
      maxJobsPerBatch: 10,
      minWorkers: 0,
      maxWorkers: 1
    }
  }
};

export function getConfig(): EnvironmentConfig {
  // Determine environment based on process.env or other indicators
  let env: Environment = 'local';
  
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_RUNTIME_ENV) {
      env = process.env.NEXT_RUNTIME_ENV as Environment;
    } else if (process.env.VERCEL) {
      env = 'vercel';
    } else if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      env = 'amplify';
    }
  }
  
  return configs[env] || configs.other;
}

// Helper function to detect serverless environment
export function isServerlessEnvironment(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  
  return !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.NEXT_RUNTIME_ENV === 'vercel' ||
    process.env.NEXT_RUNTIME_ENV === 'amplify'
  );
}

// Helper function to generate unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}
