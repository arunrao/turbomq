import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageAdapter } from '../types';

// Simple file system implementation for local development
export class LocalFileStorage implements StorageAdapter {
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

  async getFileStream(identifier: string): Promise<NodeJS.ReadableStream> {
    const filePath = path.join(this.storagePath, identifier);
    const nodeStream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      nodeStream.on('data', (_chunk: Buffer) => {
        // Handle chunk if needed
      });
      
      nodeStream.on('error', (err: Error) => {
        reject(err);
      });
      
      nodeStream.on('end', () => {
        resolve(nodeStream);
      });
    });
  }

  async storeFile(content: Buffer, metadata: Record<string, any> = {}): Promise<string> {
    const identifier = uuidv4();
    const filePath = path.join(this.storagePath, identifier);
    
    await fs.promises.writeFile(filePath, content);
    
    // Store metadata if provided
    if (Object.keys(metadata).length > 0) {
      const metadataPath = path.join(this.storagePath, `${identifier}.meta.json`);
      await fs.promises.writeFile(metadataPath, JSON.stringify(metadata));
    }
    
    return identifier;
  }

  async storeFileStream(stream: NodeJS.ReadableStream, metadata: Record<string, any> = {}): Promise<string> {
    const identifier = uuidv4();
    const filePath = path.join(this.storagePath, identifier);
    const nodeStream = fs.createWriteStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        nodeStream.write(chunk, (err: Error | null | undefined) => {
          if (err) {
            reject(err);
          }
        });
      });
      
      stream.on('end', async () => {
        nodeStream.end();
        
        // Store metadata if provided
        if (Object.keys(metadata).length > 0) {
          const metadataPath = path.join(this.storagePath, `${identifier}.meta.json`);
          await fs.promises.writeFile(metadataPath, JSON.stringify(metadata));
        }
        
        resolve(identifier);
      });
      
      stream.on('error', (err: Error) => {
        nodeStream.end();
        reject(err);
      });
    });
  }

  async deleteFile(identifier: string): Promise<void> {
    const filePath = path.join(this.storagePath, identifier);
    const metadataPath = path.join(this.storagePath, `${identifier}.meta.json`);
    
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    try {
      await fs.promises.unlink(metadataPath);
    } catch (error) {
      // Ignore if metadata file doesn't exist
    }
  }
}
