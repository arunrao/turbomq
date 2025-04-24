import { PrismaClient } from '@prisma/client';

export class SimpleAdapter {
  private prisma: PrismaClient;
  private connected = false;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async init(): Promise<void> {
    if (!this.connected) {
      await this.prisma.$connect();
      this.connected = true;
    }
  }

  async shutdown(): Promise<void> {
    if (this.connected) {
      await this.prisma.$disconnect();
      this.connected = false;
    }
  }

  async getJobById(jobId: string): Promise<any> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId }
    });

    if (!job) return null;

    return {
      id: job.id,
      taskName: job.taskName,
      status: job.status,
      priority: job.priority,
      progress: job.progress || 0,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      resultKey: job.resultKey,
      webhookUrl: job.webhookUrl
    };
  }

  async getJobResult(resultKey: string): Promise<any> {
    const result = await this.prisma.jobResult.findUnique({
      where: { key: resultKey }
    });

    if (!result) return null;

    return JSON.parse(result.result);
  }
} 