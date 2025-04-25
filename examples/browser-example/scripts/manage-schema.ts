import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

interface TableInfo {
  name: string;
  sql: string;
}

async function manageSchema() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Inspecting schema...');
    
    // For SQLite, we'll use a simplified schema check
    const tables = await prisma.$queryRaw<TableInfo[]>`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    `;
    
    console.log('\nFound tables:', tables);
    
    // Check required tables
    const requiredTables = ['Job', 'JobResult', 'WorkerHeartbeat'];
    const missingTables = requiredTables.filter(
      table => !tables.some(t => t.name.toLowerCase() === table.toLowerCase())
    );
    
    if (missingTables.length > 0) {
      console.log('\n⚠️ Missing tables:', missingTables);
      console.log('\nRunning prisma db push to create missing tables...');
      
      // Use prisma db push to create missing tables
      execSync('npx prisma db push', { stdio: 'inherit' });
      
      console.log('\n✅ Schema update complete!');
    } else {
      console.log('\n✅ All required tables exist!');
    }
    
    // Display current schema
    console.log('\nCurrent schema:');
    const schema = await prisma.$queryRaw<TableInfo[]>`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    `;
    console.log(JSON.stringify(schema, null, 2));
    
  } catch (error) {
    console.error('❌ Error managing schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

manageSchema().catch(console.error); 