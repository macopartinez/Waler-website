/**
 * Script pour mettre à jour le nombre de followers MAINTENANT
 * À exécuter avec: node update-followers-now.mjs
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL manquant. Définissez-le dans votre environnement (.env).');
  process.exit(1);
}

async function updateFollowerCount() {
  console.log('🔧 Mise à jour du nombre de followers...\n');
  
  const userId = 21;
  const newFollowerCount = 212; // Nombre REEL actuel sur Instagram
  
  console.log(`📊 User ID: ${userId}`);
  console.log(`📈 Nouveau nombre de followers: ${newFollowerCount}\n`);
  
  const sql = postgres(DATABASE_URL);
  
  try {
    console.log('🔌 Connexion à la base de données...');
    
    // Lister toutes les tables
    console.log('🔍 Vérification des tables disponibles...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables disponibles:', tables.map(t => t.table_name).join(', '));
    console.log('');
    
    // Vérifier les colonnes de app_users
    console.log('🔍 Vérification des colonnes de app_users...');
    const appUsersColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'app_users'
    `;
    console.log('Colonnes app_users:', appUsersColumns.map(c => c.column_name).join(', '));
    console.log('');
    
    const result = await sql`
      UPDATE app_users 
      SET followers_count = ${newFollowerCount}, 
          last_analyzed_at = NOW() 
      WHERE id = ${userId}
      RETURNING id, username, followers_count, last_analyzed_at
    `;
    
    if (result.length > 0) {
      console.log('✅ Mise à jour réussie !\n');
      console.log('Résultat:');
      console.log('  ID:', result[0].id);
      console.log('  Username:', result[0].username);
      console.log('  Followers:', result[0].followers_count);
      console.log('  Last analyzed:', result[0].last_analyzed_at);
      console.log('\n🔄 Rechargez le dashboard maintenant !');
    } else {
      console.error('❌ Aucun utilisateur trouvé avec l\'ID', userId);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await sql.end();
  }
}

updateFollowerCount();
