import { PrismaClient } from '@prisma/client';
import { inspectSchema, migrateSchema } from '../src/schema';

async function migrateSchemaScript() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Inspecting schema...');
    const issues = await inspectSchema(prisma.$pool);
    
    if (issues.length === 0) {
      console.log('✅ Schema is up to date!');
      return;
    }
    
    console.log('\nFound issues:', issues);
    
    // Group issues by type
    const missingTables = issues.filter(i => i.type === 'missing_table');
    const missingColumns = issues.filter(i => i.type === 'missing_column');
    const invalidTypes = issues.filter(i => i.type === 'invalid_type');
    
    if (missingTables.length > 0) {
      console.log('\n⚠️ Missing tables:', missingTables.map(t => t.table));
    }
    
    if (missingColumns.length > 0) {
      console.log('\n⚠️ Missing columns:', missingColumns.map(c => `${c.table}.${c.column}`));
    }
    
    if (invalidTypes.length > 0) {
      console.log('\n⚠️ Invalid column types:', invalidTypes.map(t => 
        `${t.table}.${t.column} (expected: ${t.expectedType})`
      ));
    }
    
    // Run migrations
    console.log('\nRunning migrations...');
    await migrateSchema(prisma.$pool, '1.0.0', '1.2.0');
    
    console.log('\n✅ Schema migration complete!');
  } catch (error) {
    console.error('❌ Error during schema migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateSchemaScript().catch(console.error); 