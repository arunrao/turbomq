import { createQueue, Queue } from '../index';
import { TestAdapter } from './test-adapter';

export async function createTestQueue(): Promise<Queue> {
  const adapter = new TestAdapter();
  const queue = await createQueue(adapter);
  return queue;
}

export function createTestJob(taskName: string, payload: any = {}) {
  return {
    id: `test-${Date.now()}`,
    taskName,
    payload,
    status: 'pending',
    priority: 0,
    runAt: new Date(),
    attemptsMade: 0,
    maxAttempts: 3,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export function createTestJobResult(jobId: string, result: any = {}) {
  return {
    key: `result-${jobId}`,
    jobId,
    result: JSON.stringify(result),
    createdAt: new Date()
  };
}

export function createTestWorkerHeartbeat(workerId: string, jobId?: string) {
  return {
    workerId,
    currentJob: jobId,
    lastSeen: new Date()
  };
} 