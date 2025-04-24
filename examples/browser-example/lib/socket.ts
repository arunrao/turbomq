import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { NextApiResponse } from 'next';
import type { Socket as NetSocket } from 'net';
import io from 'socket.io-client';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface SocketServer extends HTTPServer {
  io?: SocketIOServer | null;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

export interface NextApiResponseServerIO extends NextApiResponse {
  socket: SocketWithIO;
}

// Module-level variable to track initialization
let ioInstance: SocketIOServer | null = null;
let isInitializing = false;

export const initSocketIO = (res: NextApiResponseServerIO) => {
  // If already initializing, wait for it to complete
  if (isInitializing) {
    console.log('Socket.IO server is initializing, waiting...');
    return ioInstance;
  }

  // If already initialized, return the instance
  if (ioInstance) {
    console.log('Socket.IO server already initialized');
    return ioInstance;
  }

  try {
    isInitializing = true;
    console.log('Initializing Socket.IO server...');
    
    // Create new Socket.IO server
    ioInstance = new SocketIOServer(res.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    // Store the Socket.IO server instance
    res.socket.server.io = ioInstance;
    
    // Set up event handlers
    ioInstance.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Handle client joining a job-specific room
      socket.on('join-job', (jobId) => {
        const roomName = `job-${jobId}`;
        socket.join(roomName);
        console.log(`Client ${socket.id} joined room: ${roomName}`);
        
        // Check if this job is already completed
        // This will prevent unnecessary connections for completed jobs
        socket.emit('check-job-status', { jobId });
      });
      
      // Handle client leaving a job room when the job is completed
      socket.on('leave-job', (jobId) => {
        const roomName = `job-${jobId}`;
        socket.leave(roomName);
        console.log(`Client ${socket.id} left room: ${roomName}`);
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
    
    console.log('Socket.IO server initialized');
    return ioInstance;
  } finally {
    isInitializing = false;
  }
};

// Client-side function to get a socket instance
export const getSocketInstance = () => {
  return io({
    path: '/api/socketio',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
};
