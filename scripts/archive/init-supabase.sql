-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  owner_id INTEGER,                 -- Multi-compte : login owner (NULL = login principal)
  instagram_user_id TEXT,           -- ds_user_id Instagram (dédoublonne un compte lié)
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
);

-- Create unfollowers table
CREATE TABLE IF NOT EXISTS unfollowers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recovered_at TIMESTAMP
);

-- Create followers table
CREATE TABLE IF NOT EXISTS followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create blockers table
CREATE TABLE IF NOT EXISTS blockers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  type TEXT NOT NULL DEFAULT 'blocker',
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Pro user
INSERT INTO users (username, email, password_hash, platform, subscription_tier, subscription_status)
VALUES (
  'pako_mrtz',
  'demo@example.com',
  '$2b$10$YourHashedPasswordHere',
  'instagram',
  'pro',
  'active'
) ON CONFLICT (email) DO NOTHING;
