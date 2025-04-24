import { FileStorage } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

  async getFile(identifier: string): Promise<Buffer> {
    const filePath = path.join(this.storagePath, identifier);
    return fs.promises.readFile(filePath);
  }

  async getFileStream(identifier: string): Promise<ReadableStream> {
    const filePath = path.join(this.storagePath, identifier);
    const nodeStream = fs.createReadStream(filePath);
    
    // Convert Node.js stream to Web API ReadableStream
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        nodeStream.on('end', () => {
          controller.close();
        });
        nodeStream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      }
    });
  }

  async storeFile(content: Buffer, metadata: any = {}): Promise<string> {
    const identifier = `${Date.now()}-${uuidv4()}`;
    const filePath = path.join(this.storagePath, identifier);
    
    // Store the file
    await fs.promises.writeFile(filePath, content);
    
    // Store metadata if provided
    if (Object.keys(metadata).length > 0) {
      const metaPath = `${filePath}.meta.json`;
      await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    }
    
    return identifier;
  }

  async storeFileFromStream(stream: ReadableStream, identifier: string): Promise<string> {
    const filePath = path.join(this.storagePath, identifier);
    
    // Convert Web API ReadableStream to Node.js stream
    const reader = stream.getReader();
    const writer = fs.createWriteStream(filePath);
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
      }
      writer.end();
    } catch (error) {
      writer.destroy(error as Error);
      throw error;
    }
    
    return identifier;
  }

  async getWriteStream(identifier: string): Promise<WritableStream> {
    const filePath = path.join(this.storagePath, identifier);
    const nodeStream = fs.createWriteStream(filePath);
    
    // Convert Node.js stream to Web API WritableStream
    return new WritableStream({
      write(chunk) {
        return new Promise((resolve, reject) => {
          nodeStream.write(chunk, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      close() {
        return new Promise((resolve) => {
          nodeStream.end(() => {
            resolve();
          });
        });
      },
      abort(reason) {
        nodeStream.destroy(reason);
      }
    });
  }
}
