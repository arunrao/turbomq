import { Job } from './types';

// Events System
export class EventEmitter {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners[event]) return;
    
    const index = this.listeners[event].indexOf(listener);
    if (index !== -1) {
      this.listeners[event].splice(index, 1);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (!this.listeners[event]) return;
    
    for (const listener of this.listeners[event]) {
      listener(...args);
    }
  }
}

export class EventManager {
  private emitter = new EventEmitter();

  onJobCreated(listener: (job: Job) => void): void {
    this.emitter.on('job:created', listener);
  }

  onJobCompleted(listener: (job: Job) => void): void {
    this.emitter.on('job:completed', listener);
  }
  
  onJobFailed(listener: (job: Job, error: Error) => void): void {
    this.emitter.on('job:failed', listener);
  }

  onJobProgress(listener: (job: Job, progress: number) => void): void {
    this.emitter.on('job:progress', listener);
  }

  emitJobCreated(job: Job): void {
    this.emitter.emit('job:created', job);
  }

  emitJobCompleted(job: Job): void {
    this.emitter.emit('job:completed', job);
  }

  emitJobFailed(job: Job, error: Error): void {
    this.emitter.emit('job:failed', job, error);
  }

  emitJobProgress(job: Job, progress: number): void {
    this.emitter.emit('job:progress', job, progress);
  }
}
