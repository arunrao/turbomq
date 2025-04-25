import { NextApiRequest, NextApiResponse } from 'next';
import { queue } from '../../lib/queue';

// Rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS = 10; // max requests per window
const requestCounts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Get existing requests for this IP
  let requests = requestCounts.get(ip) || [];
  
  // Remove old requests outside the window
  requests = requests.filter(time => time > windowStart);
  
  // Check if we're over the limit
  if (requests.length >= MAX_REQUESTS) {
    return true;
  }
  
  // Add new request
  requests.push(now);
  requestCounts.set(ip, requests);
  
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (isRateLimited(ip as string)) {
    return res.status(429).json({ 
      error: 'Too many requests',
      retryAfter: RATE_LIMIT_WINDOW / 1000
    });
  }

  try {
    const job = await queue.getJobById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.status(200).json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
