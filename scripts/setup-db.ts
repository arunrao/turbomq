import { PrismaClient } from '@prisma/client';

async function setupDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    
    console.log('Database connected successfully!');
    
    // Check if we have any jobs in the database
    const jobCount = await prisma.job.count();
    console.log(`Found ${jobCount} existing jobs in the database.`);
    
    // Create a test job if the database is empty
    if (jobCount === 0) {
      console.log('Creating a test job...');
      
      const job = await prisma.job.create({
        data: {
          taskName: 'testTask',
          payload: JSON.stringify({ message: 'This is a test job' }),
          status: 'pending',
          priority: 0,
          runAt: new Date(),
          attemptsMade: 0,
          maxAttempts: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      
      console.log('Test job created:', job.id);
    }
    
    console.log('Database setup complete!');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase().catch(console.error);
