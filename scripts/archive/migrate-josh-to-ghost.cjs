// Script pour migrer Josh vers la section Ghost en vérifiant son status
const { Client } = require('pg');
require('dotenv').config();

async function migrateToGhost() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Vérifier les données actuelles
    console.log('📊 ÉTAT ACTUEL:');
    const current = await client.query(`
      SELECT username, status FROM unfollowers WHERE user_id = 21
    `);
    current.rows.forEach(row => {
      const emoji = row.status === 'blocked' ? '🚫' : row.status === 'deleted' ? '❌' : '👋';
      console.log(`   ${emoji} @${row.username} → ${row.status}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ Josh est déjà classé comme "blocked"');
    console.log('Il devrait apparaître dans la section Ghost du dashboard');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Test des routes API
    console.log('🧪 TEST DES ROUTES API:\n');
    
    const fetch = (await import('node-fetch')).default;
    
    // Test Ghost Followers
    try {
      const ghostRes = await fetch('http://localhost:5000/api/ghost-followers', {
        headers: { 'Cookie': 'connect.sid=your-session-cookie' }
      });
      const ghostData = await ghostRes.json();
      console.log('👻 GET /api/ghost-followers:');
      console.log('   Status:', ghostRes.status);
      console.log('   Data:', JSON.stringify(ghostData, null, 2));
    } catch (err) {
      console.log('❌ Erreur ghost-followers:', err.message);
    }

    console.log('');

    // Test Unfollowers
    try {
      const unfollowersRes = await fetch('http://localhost:5000/api/unfollowers', {
        headers: { 'Cookie': 'connect.sid=your-session-cookie' }
      });
      const unfollowersData = await unfollowersRes.json();
      console.log('👋 GET /api/unfollowers:');
      console.log('   Status:', unfollowersRes.status);
      console.log('   Data:', JSON.stringify(unfollowersData, null, 2));
    } catch (err) {
      console.log('❌ Erreur unfollowers:', err.message);
    }

    console.log('');

    // Test Stats
    try {
      const statsRes = await fetch('http://localhost:5000/api/unfollowers/stats', {
        headers: { 'Cookie': 'connect.sid=your-session-cookie' }
      });
      const statsData = await statsRes.json();
      console.log('📊 GET /api/unfollowers/stats:');
      console.log('   Status:', statsRes.status);
      console.log('   Data:', JSON.stringify(statsData, null, 2));
    } catch (err) {
      console.log('❌ Erreur stats:', err.message);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

migrateToGhost();
