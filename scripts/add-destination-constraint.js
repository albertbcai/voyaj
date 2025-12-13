// Migration: Add named constraint to destination_suggestions table
// Fixes: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/voyaj',
});

async function migrate() {
  try {
    console.log('🔄 Adding named constraint to destination_suggestions table...');
    
    // Check if constraint already exists
    const checkResult = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'destination_suggestions' 
      AND constraint_name = 'unique_destination_suggestion'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Constraint already exists, skipping migration');
      await pool.end();
      process.exit(0);
    }
    
    // Drop the old unnamed unique constraint if it exists
    // First, find the constraint name that PostgreSQL auto-generated
    const findConstraint = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'destination_suggestions' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE 'destination_suggestions_%'
    `);
    
    if (findConstraint.rows.length > 0) {
      const oldConstraintName = findConstraint.rows[0].constraint_name;
      console.log(`   Dropping old constraint: ${oldConstraintName}`);
      await pool.query(`ALTER TABLE destination_suggestions DROP CONSTRAINT IF EXISTS ${oldConstraintName}`);
    }
    
    // Add the new named constraint
    await pool.query(`
      ALTER TABLE destination_suggestions 
      ADD CONSTRAINT unique_destination_suggestion 
      UNIQUE(trip_id, member_id, destination)
    `);
    
    console.log('✅ Named constraint added successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

migrate();

