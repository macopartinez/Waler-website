// Script pour vérifier les unfollowers dans la base de données
const { Client } = require('pg');
require('dotenv').config();

async function checkUnfollowers() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    const result = await client.query(`
      SELECT * FROM unfollowers 
      WHERE user_id = 21 
      ORDER BY detected_at DESC 
      LIMIT 10
    `);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 UNFOLLOWERS DANS LA BASE DE DONNÉES');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (result.rows.length === 0) {
      console.log('ℹ️ Aucun unfollower trouvé pour user_id = 21\n');
    } else {
      console.log(`Total: ${result.rows.length} unfollower(s)\n`);
      
      result.rows.forEach((row, index) => {
        const statusEmoji = row.status === 'blocked' ? '🚫' : row.status === 'deleted' ? '❌' : '👋';
        console.log(`${index + 1}. ${statusEmoji} @${row.username}`);
        console.log(`   ID: ${row.id}`);
        console.log(`   User ID: ${row.user_id}`);
        console.log(`   Status: ${row.status || 'unfollowed'}`);
        console.log(`   Détecté le: ${row.detected_at}`);
        console.log(`   Vérifié le: ${row.verified_at || 'N/A'}`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

checkUnfollowers();
