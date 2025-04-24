import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

/**
 * Cleans up the database and uploads directory when the server starts
 */
export async function cleanupOnStartup() {
  console.log('🧹 Starting cleanup process...');
  
  // Clean up database
  await cleanupDatabase();
  
  // Clean up uploads directory
  cleanupUploadsDirectory();
  
  console.log('✅ Cleanup completed successfully');
}

/**
 * Deletes all jobs and job results from the database
 */
async function cleanupDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🗄️  Cleaning up database...');
    
    // Delete all job results first (due to foreign key constraints)
    const deletedResults = await prisma.jobResult.deleteMany({});
    console.log(`🗑️  Deleted ${deletedResults.count} job results`);
    
    // Delete all jobs
    const deletedJobs = await prisma.job.deleteMany({});
    console.log(`🗑️  Deleted ${deletedJobs.count} jobs`);
    
  } catch (error) {
    console.error('❌ Error cleaning up database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Deletes all files in the uploads directory
 */
function cleanupUploadsDirectory() {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
    return;
  }
  
  console.log('📁 Cleaning up uploads directory...');
  
  try {
    const files = fs.readdirSync(uploadsDir);
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      
      // Skip directories and only delete files
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    
    console.log(`🗑️  Deleted ${files.length} files from uploads directory`);
  } catch (error) {
    console.error('❌ Error cleaning up uploads directory:', error);
  }
}
