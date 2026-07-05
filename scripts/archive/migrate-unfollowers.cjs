// Script pour appliquer la migration unfollowers
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Lire le fichier SQL
    const sql = fs.readFileSync('add-unfollower-status.sql', 'utf8');
    
    console.log('🔄 Application de la migration...\n');
    
    // Exécuter la migration
    await client.query(sql);
    
    console.log('✅ Migration appliquée avec succès!\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

migrate();
