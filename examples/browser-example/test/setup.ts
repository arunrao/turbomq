import { PostgresAdapter, PostgresAdapterConfig } from '../lib/postgres-adapter';
import postgres from 'postgres';

export const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'turbomq_test',
  user: 'postgres',
  password: 'postgres',
  ssl: false
};

export const getTestAdapter = () => {
  const config: PostgresAdapterConfig = {
    connectionString: `postgres://${TEST_DB_CONFIG.user}:${TEST_DB_CONFIG.password}@${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_CONFIG.database}`,
    ssl: TEST_DB_CONFIG.ssl,
    queryTimeout: 5000, // 5 seconds for tests
    connectTimeout: 5000, // 5 seconds for connection
    idleTimeout: 10, // 10 seconds idle timeout
    maxConnections: 5 // Limit connections for tests
  };
  return new PostgresAdapter(config);
};

// Function to clean the test database
export const cleanTestDatabase = async () => {
  const sql = postgres({
    ...TEST_DB_CONFIG,
    max: 1, // Single connection for cleanup
    idle_timeout: 5, // Short idle timeout for cleanup
    connect_timeout: 5000 // 5 seconds connection timeout
  });
  try {
    await sql`TRUNCATE jobs, job_results, worker_heartbeats CASCADE`;
  } finally {
    await sql.end();
  }
}; 