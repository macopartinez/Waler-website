const { Client } = require('pg');
require('dotenv').config();

async function checkTodayUnfollowers() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Vérifier les unfollowers d'aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await client.query(`
      SELECT id, username, status, detected_at
      FROM unfollowers
      WHERE user_id = 21
        AND detected_at >= $1
      ORDER BY detected_at DESC
    `, [today]);

    console.log(`📊 Unfollowers détectés aujourd'hui (${today.toLocaleDateString('fr-FR')}):\n`);
    
    if (result.rows.length === 0) {
      console.log('❌ Aucun unfollower détecté aujourd\'hui');
    } else {
      result.rows.forEach(row => {
        const emoji = row.status === 'blocked' ? '🚫' : row.status === 'deleted' ? '❌' : '👋';
        const date = new Date(row.detected_at);
        console.log(`   ${emoji} ID: ${row.id} | @${row.username} | ${row.status} | ${date.toLocaleString('fr-FR')}`);
      });
    }

    console.log('\n📊 TOUS les unfollowers (derniers 10):');
    const allResult = await client.query(`
      SELECT id, username, status, detected_at
      FROM unfollowers
      WHERE user_id = 21
      ORDER BY detected_at DESC
      LIMIT 10
    `);

    allResult.rows.forEach(row => {
      const emoji = row.status === 'blocked' ? '🚫' : row.status === 'deleted' ? '❌' : '👋';
      const date = new Date(row.detected_at);
      console.log(`   ${emoji} ID: ${row.id} | @${row.username} | ${row.status} | ${date.toLocaleString('fr-FR')}`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

checkTodayUnfollowers();
