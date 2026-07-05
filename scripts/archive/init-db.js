import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const db = new Database('./waler.db');

// Drop existing table if schema mismatch
db.exec(`DROP TABLE IF EXISTS users`);

// Create users table with correct Drizzle schema
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    platform TEXT NOT NULL,
    avatar_url TEXT,
    is_connected INTEGER DEFAULT 1,
    is_verified INTEGER DEFAULT 0,
    verification_code TEXT,
    verification_token TEXT,
    verification_token_expiry TEXT,
    verification_attempts INTEGER DEFAULT 0,
    subscription_tier TEXT DEFAULT 'pro',
    subscription_status TEXT DEFAULT 'active',
    trial_ends_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Check if user exists
const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get('demo@example.com');

// Create Pro user (table was dropped, so always create)
const passwordHash = bcrypt.hashSync('ChangeMe123!', 10);

db.prepare(`
  INSERT INTO users (email, password_hash, username, platform, subscription_tier, subscription_status)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('demo@example.com', passwordHash, 'pako_mrtz', 'instagram', 'pro', 'active');

console.log('✅ Database initialized and Pro user created!');

console.log('\n📧 Email: demo@example.com');
console.log('🔑 Password: ChangeMe123!');
console.log('🎯 Tier: PRO');
console.log('🚀 Login at: http://localhost:5000\n');

db.close();
