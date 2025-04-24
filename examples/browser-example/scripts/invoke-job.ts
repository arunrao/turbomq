import { PrismaAdapter } from '../lib/prisma-adapter';
import { Queue } from '../lib/queue';
import { JobOptions } from '../lib/queue';

async function invokeJob() {
  // Get command line arguments
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: ts-node invoke-job.ts <taskName> [payload] [options]');
    process.exit(1);
  }

  const taskName = args[0];
  const payload = args[1] ? JSON.parse(args[1]) : {};
  const options: JobOptions = args[2] ? JSON.parse(args[2]) : {};

  try {
    // Initialize the queue with Prisma adapter
    const adapter = new PrismaAdapter();
    await adapter.connect();
    const queue = new Queue(adapter);

    // Register task handlers
    queue.registerTask('processFile', async (payload, _helpers) => {
      console.log('Processing file:', payload);
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { success: true, message: 'File processed successfully' };
    });

    // Add the job
    const job = await queue.addJob(taskName, payload, options);
    console.log('Job created:', job);

    // Disconnect from the database
    await adapter.disconnect();
  } catch (error) {
    console.error('Error creating job:', error);
    process.exit(1);
  }
}

invokeJob(); 