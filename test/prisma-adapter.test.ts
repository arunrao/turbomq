import { PrismaAdapter } from '../src/adapters/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { JobStatus } from '../src/types';

describe('PrismaAdapter', () => {
  let adapter: PrismaAdapter;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Set up test database
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.DIRECT_URL = 'file:./test.db';

    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();

    // Create adapter
    adapter = new PrismaAdapter();
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter.disconnect();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up any existing jobs
    await prisma.job.deleteMany();
    await prisma.jobResult.deleteMany();
    await prisma.workerHeartbeat.deleteMany();
  });

  it('should create and fetch a job', async () => {
    const job = await adapter.createJob('test-task', { data: 'test' });
    expect(job.status).toBe(JobStatus.PENDING);
    expect(job.taskName).toBe('test-task');

    const fetchedJob = await adapter.getJobById(job.id);
    expect(fetchedJob).toBeDefined();
    expect(fetchedJob?.id).toBe(job.id);
  });

  it('should update job status and progress', async () => {
    const job = await adapter.createJob('test-task', { data: 'test' });
    
    await adapter.updateJobStatus(job.id, JobStatus.RUNNING);
    await adapter.updateJobProgress(job.id, 50);

    const updatedJob = await adapter.getJobById(job.id);
    expect(updatedJob?.status).toBe(JobStatus.RUNNING);
    expect(updatedJob?.progress).toBe(50);
  });

  it('should get queue stats', async () => {
    await adapter.createJob('task1', { data: 'test1' });
    await adapter.createJob('task2', { data: 'test2' });

    const stats = await adapter.getQueueStats();
    expect(stats.pendingCount).toBe(2);
    expect(stats.runningCount).toBe(0);
  });

  it('should get detailed job info', async () => {
    await adapter.createJob('task1', { data: 'test1' });
    await adapter.createJob('task2', { data: 'test2' });

    const info = await adapter.getDetailedJobInfo();
    expect(info.jobs.length).toBe(2);
    expect(info.total).toBe(2);
    expect(info.stats.byStatus[JobStatus.PENDING]).toBe(2);
  });

  it('should remove jobs by status', async () => {
    await adapter.createJob('task1', { data: 'test1' });
    await adapter.createJob('task2', { data: 'test2' });

    const removedCount = await adapter.removeJobsByStatus(JobStatus.PENDING);
    expect(removedCount).toBe(2);

    const stats = await adapter.getQueueStats();
    expect(stats.pendingCount).toBe(0);
  });
}); 