'use client';

import React from 'react';
import { QueueClient } from '@arunrao/next-queue';
import { useState } from 'react';

export default function TestPage() {
  const [status, setStatus] = useState<string>('');

  const testQueue = async () => {
    try {
      const client = new QueueClient();
      const job = await client.createJob('test', { message: 'Hello World' });
      setStatus(`Job created with ID: ${job.id}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Next Queue Test</h1>
      <button
        onClick={testQueue}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Test Queue
      </button>
      {status && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <p>{status}</p>
        </div>
      )}
    </div>
  );
} 