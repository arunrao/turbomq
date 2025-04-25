import { NextApiRequest, NextApiResponse } from 'next';
import { createQueue, PrismaAdapter } from '../../lib/queue';

// Rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // 10 requests per second

const requestCounts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Get existing requests for this IP
  let requests = requestCounts.get(ip) || [];
  
  // Remove old requests outside the window
  requests = requests.filter(time => time > windowStart);
  
  // Check if we're over the limit
  if (requests.length >= RATE_LIMIT_MAX) {
    return true;
  }
  
  // Add new request
  requests.push(now);
  requestCounts.set(ip, requests);
  
  return false;
}

// Create queue instance
const queue = createQueue(new PrismaAdapter());

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

    // Check if this is a webhook request
    const isWebhook = req.headers['x-webhook'] === 'true';

    // Set cache headers based on request type
    if (isWebhook) {
      // For webhooks, prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // For polling, allow caching with a short TTL
      res.setHeader('Cache-Control', 'public, max-age=5'); // 5 seconds cache
    }

    return res.status(200).json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
}
