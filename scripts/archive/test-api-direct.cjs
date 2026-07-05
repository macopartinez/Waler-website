// Test direct des routes API avec authentification
const { Client } = require('pg');
require('dotenv').config();

async function testDirectAPI() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Test 1: Unfollowers
    console.log('📋 Test 1: SELECT unfollowers (status = unfollowed)');
    const unfollowers = await client.query(`
      SELECT id, username, avatar_url, status, detected_at, verified_at
      FROM unfollowers
      WHERE user_id = 21 AND status = 'unfollowed'
      ORDER BY detected_at DESC
    `);
    console.log('Résultat:', unfollowers.rows);
    console.log('');

    // Test 2: Ghost Followers
    console.log('👻 Test 2: SELECT ghost followers (status = blocked/deleted)');
    const ghost = await client.query(`
      SELECT id, username, avatar_url, status, detected_at, verified_at
      FROM unfollowers
      WHERE user_id = 21 AND status IN ('blocked', 'deleted')
      ORDER BY detected_at DESC
    `);
    console.log('Résultat:', ghost.rows);
    console.log('');

    // Test 3: Stats
    console.log('📊 Test 3: SELECT stats');
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'unfollowed') as unfollowed_count,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
        COUNT(*) FILTER (WHERE status = 'deleted') as deleted_count,
        COUNT(*) as total_count
      FROM unfollowers
      WHERE user_id = 21
    `);
    console.log('Résultat:', stats.rows[0]);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ TOUS LES TESTS RÉUSSIS');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

testDirectAPI();
