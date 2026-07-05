const { Client } = require('pg');
require('dotenv').config();

async function createTable() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS unlocked_unfollowers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        unfollower_id INTEGER NOT NULL,
        unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, unfollower_id)
      );
    `);
    
    console.log('✅ Table unlocked_unfollowers créée avec succès');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unlocked_unfollowers_user_id ON unlocked_unfollowers(user_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unlocked_unfollowers_unfollower_id ON unlocked_unfollowers(unfollower_id);
    `);
    
    console.log('✅ Index créés avec succès');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

createTable();
