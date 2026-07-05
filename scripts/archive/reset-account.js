import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetAccount() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Connecting to Supabase...\n');
    
    // Create app_users table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_users (
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
        subscription_tier TEXT,
        subscription_status TEXT,
        trial_ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table app_users ready');
    
    // Delete existing user
    await client.query(`DELETE FROM app_users WHERE email = $1`, ['demo@example.com']);
    console.log('🗑️  Deleted existing account');
    
    // Hash password
    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
    console.log('🔐 Password hashed');
    
    // Create fresh Pro user
    const result = await client.query(`
      INSERT INTO app_users (username, email, password_hash, platform, subscription_tier, subscription_status, is_connected)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, subscription_tier
    `, ['pako_mrtz', 'demo@example.com', passwordHash, 'instagram', 'pro', 'active', true]);
    
    console.log('✅ Fresh Pro account created!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: demo@example.com');
    console.log('🔑 Password: ChangeMe123!');
    console.log('👤 Username: pako_mrtz');
    console.log('🎯 Tier: PRO');
    console.log('🆔 User ID:', result.rows[0].id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🚀 Login at: http://localhost:5000\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetAccount().catch(console.error);
