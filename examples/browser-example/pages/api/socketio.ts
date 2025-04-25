import type { NextApiRequest } from 'next';
import type { NextApiResponseServerIO } from '../../lib/types';
import { Server } from 'socket.io';

export default function handler(_req: NextApiRequest, res: NextApiResponseServerIO) {
  // Initialize Socket.IO if not already initialized
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server);
    res.socket.server.io = io;

    io.on('connection', socket => {
      console.log('Client connected');
      
      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });
    });
  }

  res.end();
}
