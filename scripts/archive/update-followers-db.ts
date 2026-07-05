/**
 * Script pour mettre à jour le nombre de followers directement en base de données
 * À exécuter avec: npx tsx update-followers-db.ts
 */

import { db } from './server/db';
import { users } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function updateFollowerCount() {
  console.log('🔧 Mise à jour du nombre de followers en base de données...\n');
  
  const userId = 21;
  const newFollowerCount = 211;
  
  console.log(`📊 User ID: ${userId}`);
  console.log(`📈 Nouveau nombre de followers: ${newFollowerCount}\n`);
  
  try {
    // Mettre à jour directement en base
    const result = await db
      .update(users)
      .set({
        followersCount: newFollowerCount,
        lastAnalyzedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    if (result.length > 0) {
      console.log('✅ Mise à jour réussie !');
      console.log('\nRésultat:');
      console.log('  ID:', result[0].id);
      console.log('  Username:', result[0].username);
      console.log('  Followers:', result[0].followersCount);
      console.log('  Last analyzed:', result[0].lastAnalyzedAt);
      console.log('\n🔄 Rechargez le dashboard pour voir le changement !');
    } else {
      console.error('❌ Aucun utilisateur trouvé avec l\'ID', userId);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
  
  process.exit(0);
}

updateFollowerCount();
