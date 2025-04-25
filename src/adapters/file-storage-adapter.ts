import * as fs from 'fs';
import * as path from 'path';
import { FileStorage } from '../types';

// Simple file system implementation for local development
export class LocalFileStorage implements FileStorage {
  private storagePath: string;

  constructor(storagePath: string = path.join(process.cwd(), 'storage')) {
    this.storagePath = storagePath;
    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async store(key: string, data: any): Promise<void> {
    const filePath = path.join(this.storagePath, key);
    await fs.promises.writeFile(filePath, JSON.stringify(data));
  }

  async retrieve(key: string): Promise<any> {
    const filePath = path.join(this.storagePath, key);
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.storagePath, key);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}
