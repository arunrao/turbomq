#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Setting up the Next-Queue Browser Example...');

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log('Creating uploads directory...');
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Install dependencies
console.log('Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('Failed to install dependencies:', error);
  process.exit(1);
}

// Generate Prisma client
console.log('Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('Failed to generate Prisma client:', error);
  process.exit(1);
}

// Push schema to database
console.log('Creating database schema...');
try {
  execSync('npx prisma db push', { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('Failed to push database schema:', error);
  process.exit(1);
}

console.log('\n✅ Setup complete!');
console.log('\nTo start the development server, run:');
console.log('  cd examples/browser-example');
console.log('  npm run dev');
console.log('\nThen open http://localhost:3000 in your browser.');
