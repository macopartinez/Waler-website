import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Parse DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initSupabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Connecting to Supabase...');
    
    // Drop existing users table if exists
    await client.query(`DROP TABLE IF EXISTS users CASCADE`);
    console.log('🗑️  Dropped existing users table');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        platform TEXT NOT NULL,
        avatar_url TEXT,
        is_connected BOOLEAN DEFAULT true,
        is_verified BOOLEAN DEFAULT false,
        verification_code TEXT,
        verification_token TEXT,
        verification_token_expiry TIMESTAMP,
        verification_attempts INTEGER DEFAULT 0,
        subscription_tier TEXT DEFAULT 'pro',
        subscription_status TEXT DEFAULT 'active',
        trial_ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created');
    
    // Create unfollowers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS unfollowers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Unfollowers table created');
    
    // Create followers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS followers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Followers table created');
    
    // Create blockers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blockers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        type TEXT NOT NULL DEFAULT 'blocker',
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Blockers table created');
    
    // Hash password
    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
    
    // Insert Pro user
    await client.query(`
      INSERT INTO users (username, email, "password_hash", platform, "subscription_tier", "subscription_status")
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        "password_hash" = EXCLUDED."password_hash",
        "subscription_tier" = EXCLUDED."subscription_tier",
        "subscription_status" = EXCLUDED."subscription_status"
    `, ['pako_mrtz', 'demo@example.com', passwordHash, 'instagram', 'pro', 'active']);
    
    console.log('✅ Pro user created/updated');
    
    console.log('\n🎉 Supabase initialized successfully!\n');
    console.log('📧 Email: demo@example.com');
    console.log('🔑 Password: ChangeMe123!');
    console.log('🎯 Tier: PRO');
    console.log('🚀 Login at: http://localhost:5000\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

initSupabase().catch(console.error);
