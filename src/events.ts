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
  private jobCreatedListeners: Array<(job: Job<any>) => void> = [];
  private jobCompletedListeners: Array<(job: Job<any>) => void> = [];
  private jobFailedListeners: Array<(job: Job<any>, error: Error) => void> = [];
  private jobProgressListeners: Array<(job: Job<any>, progress: number) => void> = [];

  onJobCreated<T>(listener: (job: Job<T>) => void): void {
    this.jobCreatedListeners.push(listener);
  }

  onJobCompleted<T>(listener: (job: Job<T>) => void): void {
    this.jobCompletedListeners.push(listener);
  }

  onJobFailed<T>(listener: (job: Job<T>, error: Error) => void): void {
    this.jobFailedListeners.push(listener);
  }

  onJobProgress<T>(listener: (job: Job<T>, progress: number) => void): void {
    this.jobProgressListeners.push(listener);
  }

  emitJobCreated<T>(job: Job<T>): void {
    this.jobCreatedListeners.forEach(listener => listener(job));
  }

  emitJobCompleted<T>(job: Job<T>): void {
    this.jobCompletedListeners.forEach(listener => listener(job));
  }

  emitJobFailed<T>(job: Job<T>, error: Error): void {
    this.jobFailedListeners.forEach(listener => listener(job, error));
  }

  emitJobProgress<T>(job: Job<T>, progress: number): void {
    this.jobProgressListeners.forEach(listener => listener(job, progress));
  }
}
