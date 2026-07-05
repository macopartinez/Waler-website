const { Client } = require('pg');
require('dotenv').config();

async function updateStatus() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Vérifier le statut actuel
    const current = await client.query(`
      SELECT id, username, status FROM unfollowers
      WHERE username = 'socialuhq' AND user_id = 21
    `);

    if (current.rows.length === 0) {
      console.log('❌ Compte socialuhq non trouvé');
      return;
    }

    console.log('📊 Statut actuel:');
    console.log(`   ID: ${current.rows[0].id} | @${current.rows[0].username} | ${current.rows[0].status}`);

    // Mettre à jour le statut
    await client.query(`
      UPDATE unfollowers
      SET status = 'deleted'
      WHERE username = 'socialuhq' AND user_id = 21
    `);

    console.log('\n✅ Statut mis à jour de "blocked" à "deleted"');

    // Vérifier la mise à jour
    const updated = await client.query(`
      SELECT id, username, status FROM unfollowers
      WHERE username = 'socialuhq' AND user_id = 21
    `);

    console.log('\n📊 Nouveau statut:');
    console.log(`   ID: ${updated.rows[0].id} | @${updated.rows[0].username} | ${updated.rows[0].status}`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

updateStatus();
