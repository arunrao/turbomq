import { NextApiRequest } from 'next';
import { NextApiResponseServerIO, initSocketIO } from '../../lib/socket';

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  // Initialize Socket.IO if not already initialized
  initSocketIO(res);
  
  // Return a success response
  res.status(200).json({ success: true, message: 'Socket.IO server initialized' });
}
