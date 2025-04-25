// Simple script to clean up the database and uploads directory
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

async function cleanupDatabase() {
  console.log('🧹 Starting database cleanup...');
  const prisma = new PrismaClient();
  
  try {
    // Delete all job results first (due to foreign key constraints)
    const deletedResults = await prisma.jobResult.deleteMany({});
    console.log(`🗑️  Deleted ${deletedResults.count} job results`);
    
    // Delete all jobs
    const deletedJobs = await prisma.job.deleteMany({});
    console.log(`🗑️  Deleted ${deletedJobs.count} jobs`);
    
    console.log('✅ Database cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error cleaning up database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function cleanupUploadsDirectory() {
  console.log('🧹 Starting uploads directory cleanup...');
  const uploadsDir = path.join(process.cwd(), 'uploads');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
    return;
  }
  
  try {
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      
      // Skip directories and only delete files
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    console.log(`🗑️  Deleted ${deletedCount} files from uploads directory`);
    console.log('✅ Uploads directory cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error cleaning up uploads directory:', error);
  }
}

// Run both cleanup functions
async function runCleanup() {
  await cleanupDatabase();
  cleanupUploadsDirectory();
}

// Execute cleanup
runCleanup().then(() => {
  console.log('🎉 All cleanup tasks completed!');
});
