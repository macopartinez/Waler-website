/**
 * Script Node.js pour vérifier les unfollowers dans la base de données backend
 */

import { db } from './server/db.ts';
import { followers, unfollowers } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

async function checkBackendUnfollowers() {
  console.log('🔍 Vérification des unfollowers dans la base de données...\n');

  try {
    // Récupérer l'utilisateur ID 21 (ou votre ID)
    const userId = 21;

    // Récupérer tous les followers actifs
    const allFollowers = await db
      .select()
      .from(followers)
      .where(eq(followers.userId, userId));

    console.log(`📊 Total de followers actifs dans la DB: ${allFollowers.length}`);

    // Récupérer tous les unfollowers
    const unfollowersList = await db
      .select()
      .from(unfollowers)
      .where(eq(unfollowers.userId, userId));
    
    console.log(`❌ Unfollowers détectés: ${unfollowersList.length}`);

    if (unfollowersList.length > 0) {
      console.log('\n📋 Liste des unfollowers:');
      unfollowersList.forEach((unfollower, index) => {
        console.log(`\n${index + 1}. @${unfollower.username}`);
        console.log(`   - Status: ${unfollower.status}`);
        console.log(`   - Détecté le: ${unfollower.detectedAt}`);
        console.log(`   - Vérifié le: ${unfollower.verifiedAt || 'Non vérifié'}`);
        console.log(`   - Avatar: ${unfollower.avatarUrl || 'N/A'}`);
      });

      // Vérifier les unfollowers récents (dernières 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentUnfollowers = unfollowersList.filter(f => 
        f.detectedAt && new Date(f.detectedAt) > oneDayAgo
      );

      console.log(`\n🆕 Unfollowers récents (dernières 24h): ${recentUnfollowers.length}`);
      if (recentUnfollowers.length > 0) {
        recentUnfollowers.forEach((unfollower, index) => {
          console.log(`   ${index + 1}. @${unfollower.username} (${new Date(unfollower.detectedAt).toLocaleString()})`);
        });
      }
    } else {
      console.log('\n✅ Aucun unfollower dans la base de données');
    }

    // Statistiques
    console.log('\n' + '='.repeat(60));
    console.log('STATISTIQUES:');
    console.log('='.repeat(60));
    console.log(`✅ Followers actifs: ${allFollowers.length}`);
    console.log(`❌ Unfollowers: ${unfollowersList.length}`);
    console.log(`📊 Total enregistré: ${allFollowers.length + unfollowersList.length}`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    process.exit(0);
  }
}

checkBackendUnfollowers();
