# Scaling and Deployment

TurboMQ supports various deployment and scaling strategies to handle different workloads.

## Current Limitations

In serverless environments (Vercel/Amplify), we're limited to:
- 1 worker per instance
- 5-10 jobs per batch
- 25-30 second execution time limits

This means jobs run sequentially in batches, which may not be ideal for high-volume processing.

## Scaling Options

### 1. Horizontal Scaling

You can run multiple instances of your application, each with its own worker pool:

```typescript
// Each instance can have its own worker pool
const workerPool1 = createWorkerPool(queue, adapter);
const workerPool2 = createWorkerPool(queue, adapter);
// Each pool can process different types of jobs
```

### 2. Job Type Separation

Register different workers for different job types:

```typescript
// Register different workers for different job types
queue.registerTask<EmailJob>('send-email', async (job) => {
  // Email processing
});

queue.registerTask<FileProcessingJob>('process-file', async (job) => {
  // File processing
});

queue.registerTask<ReportJob>('generate-report', async (job) => {
  // Report generation
});
```

### 3. Dedicated Worker Service

For high-volume processing, use a dedicated worker service (AWS ECS, Kubernetes, or dedicated server):

```typescript
// In a dedicated worker service
const config = {
  worker: {
    mode: 'continuous',
    minWorkers: 5,
    maxWorkers: 20,
    pollInterval: 1000,
    maxExecutionTime: 0
  }
};
```

### 4. Hybrid Approach

Combine serverless for API with dedicated workers:

```typescript
// Main application (Vercel/Amplify)
const queue = createQueue(adapter);

// Register jobs
queue.registerTask<EmailJob>('send-email', async (job) => {
  // Email processing
});

// Dedicated worker service
const workerPool = createWorkerPool(queue, adapter);
workerPool.start();
```

## AWS Lambda Worker Setup

To run workers on AWS Lambda:

1. Create a Lambda function for each worker type:

```typescript
// email-worker.ts
import { createQueue, createPostgresAdapter } from 'turbomq';

export const handler = async (event: any) => {
  const adapter = createPostgresAdapter({
    connectionString: process.env.DATABASE_URL,
    createSchema: true
  });
  
  const queue = createQueue(adapter);
  
  // Register only email-related tasks
  queue.registerTask<EmailJob>('send-email', async (job) => {
    // Email processing
  });
  
  // Process jobs
  await queue.processJobs();
};
```

2. Create separate Lambda functions for different job types:

```typescript
// file-processor.ts
export const handler = async (event: any) => {
  const adapter = createPostgresAdapter({
    connectionString: process.env.DATABASE_URL
  });
  
  const queue = createQueue(adapter);
  
  // Register only file processing tasks
  queue.registerTask<FileProcessingJob>('process-file', async (job) => {
    // File processing
  });
  
  await queue.processJobs();
};
```

3. Configure Lambda settings:
   - Memory: 256MB-1024MB depending on job complexity
   - Timeout: 5-15 minutes
   - Environment variables: DATABASE_URL, etc.

4. Set up CloudWatch Events to trigger workers:
```yaml
# serverless.yml
functions:
  emailWorker:
    handler: email-worker.handler
    events:
      - schedule: rate(1 minute)
    environment:
      DATABASE_URL: ${env:DATABASE_URL}
  
  fileProcessor:
    handler: file-processor.handler
    events:
      - schedule: rate(1 minute)
    environment:
      DATABASE_URL: ${env:DATABASE_URL}
```

5. Use AWS Step Functions for complex workflows:
```typescript
// Define workflow
const workflow = {
  startAt: 'ProcessFile',
  states: {
    ProcessFile: {
      type: 'Task',
      resource: 'arn:aws:lambda:region:account:function:file-processor',
      next: 'GenerateReport'
    },
    GenerateReport: {
      type: 'Task',
      resource: 'arn:aws:lambda:region:account:function:report-generator',
      next: 'SendEmail'
    },
    SendEmail: {
      type: 'Task',
      resource: 'arn:aws:lambda:region:account:function:email-worker',
      end: true
    }
  }
};
```

## Scaling Recommendations

1. **For High Volume**:
   - Use a dedicated worker service
   - Use serverless for API and job registration
   - Use a dedicated database (PostgreSQL)
   - Consider using a message queue (RabbitMQ) for very high volumes

2. **For Moderate Volume**:
   - Use AWS Lambda workers
   - Separate workers by job type
   - Use Step Functions for complex workflows

3. **For Low Volume**:
   - Use serverless workers (Vercel/Amplify)
   - Single worker with batch processing
   - Simple database setup

## Best Practices

1. Monitor worker performance and adjust resources
2. Use appropriate timeouts and retry strategies
3. Implement proper error handling and logging
4. Consider using AWS X-Ray for tracing
5. Set up CloudWatch alarms for monitoring
6. Use AWS Secrets Manager for sensitive data
7. Implement proper IAM roles and permissions 