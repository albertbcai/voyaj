// Test database setup
// This file helps set up a test database for integration tests
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Use test database if TEST_DATABASE_URL is set, otherwise use regular database
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!testDbUrl) {
  console.warn('Warning: No TEST_DATABASE_URL or DATABASE_URL set. Tests may fail.');
}

export const testPool = new Pool({
  connectionString: testDbUrl,
});

export async function setupTestDatabase() {
  // Run migrations on test database
  // This would typically run schema.sql
  console.log('Setting up test database...');
}

export async function teardownTestDatabase() {
  // Clean up test data
  await testPool.end();
}



