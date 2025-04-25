import { Server } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';

interface SocketServer extends HTTPServer {
  io?: Server;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

const ioHandler = (_req: NextApiRequest, res: NextApiResponseWithSocket) => {
  console.log('Socket.IO handler called');
  console.log('Server IO exists:', !!res.socket.server.io);
  
  if (!res.socket.server.io) {
    console.log('Initializing Socket.IO server...');
    const io = new Server(res.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    res.socket.server.io = io;

    io.on('connection', socket => {
      console.log('Client connected:', socket.id);
      console.log('Total connected clients:', io.engine.clientsCount);
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        console.log('Remaining connected clients:', io.engine.clientsCount);
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });

    io.engine.on('connection_error', (error) => {
      console.error('Connection error:', error);
    });
  } else {
    console.log('Socket.IO server already initialized');
  }

  // Send a response to indicate successful initialization
  res.status(200).json({ connected: true });
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default ioHandler; 