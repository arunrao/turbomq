# Type-Safe Job Handling

TurboMQ provides type-safe job handling to ensure type safety throughout your job processing pipeline.

## Defining Job Data Types

First, define your job data types:

```typescript
interface DocumentProcessingJob {
  userId: string;
  documentId: string;
  options?: {
    format: 'pdf' | 'docx';
    quality: 'high' | 'medium' | 'low';
  };
}

interface EmailJob {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
  }>;
}
```

## Type-Safe Job Registration

Register your job handlers with type information:

```typescript
// Type-safe job registration
queue.registerTask<DocumentProcessingJob>('process-document', async (job) => {
  // job.payload is now typed as DocumentProcessingJob
  const { userId, documentId, options } = job.payload;
  
  // TypeScript will provide autocomplete and type checking
  if (options?.format === 'pdf') {
    // Process PDF
  }
});

queue.registerTask<EmailJob>('send-email', async (job) => {
  // job.payload is now typed as EmailJob
  const { to, subject, body, attachments } = job.payload;
  
  // TypeScript will ensure all required fields are present
  if (!to || !subject || !body) {
    throw new Error('Missing required email fields');
  }
});
```

## Type-Safe Job Addition

Add jobs with type checking:

```typescript
// Type-safe job addition
await queue.addJob<DocumentProcessingJob>('process-document', {
  userId: '123',
  documentId: '456',
  options: {
    format: 'pdf',
    quality: 'high'
  }
});

// TypeScript will show errors for missing or invalid fields
await queue.addJob<EmailJob>('send-email', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World'
});
```

## Type-Safe Event Handling

Listen to job events with type information:

```typescript
// Type-safe event listeners
queue.onJobCreated<DocumentProcessingJob>((job) => {
  // job.payload is typed as DocumentProcessingJob
  console.log(`Processing document ${job.payload.documentId}`);
});

queue.onJobCompleted<EmailJob>((job) => {
  // job.payload is typed as EmailJob
  console.log(`Email sent to ${job.payload.to}`);
});

queue.onJobFailed<DocumentProcessingJob>((job, error) => {
  // job.payload is typed as DocumentProcessingJob
  console.error(`Failed to process document ${job.payload.documentId}:`, error);
});
```

## Type-Safe Job Helpers

Use type-safe job helpers in your handlers:

```typescript
queue.registerTask<DocumentProcessingJob>('process-document', async (job, helpers) => {
  // helpers.getJobDetails() returns Job<DocumentProcessingJob>
  const updatedJob = await helpers.getJobDetails();
  
  // TypeScript will provide autocomplete for job properties
  console.log(`Processing document ${updatedJob.payload.documentId}`);
  
  // Update progress with type safety
  await helpers.updateProgress(50);
});
```

## Benefits of Type Safety

1. **Compile-time Type Checking**: Catch type errors before runtime
2. **Better IDE Support**: Get autocomplete and inline documentation
3. **Safer Refactoring**: TypeScript will help identify affected code
4. **Self-documenting Code**: Types serve as documentation
5. **Reduced Runtime Errors**: Catch type mismatches early

## Best Practices

1. Define clear interfaces for your job data
2. Use strict TypeScript settings
3. Avoid using `any` type when possible
4. Document complex job data structures
5. Use type guards for runtime type checking when needed 