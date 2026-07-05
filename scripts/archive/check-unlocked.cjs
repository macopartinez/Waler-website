const { Client } = require('pg');
require('dotenv').config();

async function checkUnlocked() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Vérifier les comptes débloqués
    const result = await client.query(`
      SELECT 
        uu.unfollower_id,
        uu.unlocked_at,
        u.username,
        u.status
      FROM unlocked_unfollowers uu
      JOIN unfollowers u ON u.id = uu.unfollower_id
      WHERE uu.user_id = 21
      ORDER BY uu.unlocked_at DESC
    `);

    console.log('🔓 Comptes débloqués:\n');
    
    if (result.rows.length === 0) {
      console.log('❌ Aucun compte débloqué');
    } else {
      result.rows.forEach(row => {
        const emoji = row.status === 'blocked' ? '🚫' : row.status === 'deleted' ? '❌' : '👋';
        const date = new Date(row.unlocked_at);
        console.log(`   ${emoji} ID: ${row.unfollower_id} | @${row.username} | ${row.status} | Débloqué: ${date.toLocaleString('fr-FR')}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

checkUnlocked();
