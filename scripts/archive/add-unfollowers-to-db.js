/**
 * Script pour ajouter les 2 unfollowers dans la base de données
 */

import { db } from './server/db.ts';
import { unfollowers } from './shared/schema.ts';

async function addUnfollowersToDb() {
  console.log('📤 Ajout des 2 unfollowers dans la base de données...\n');

  const userId = 21; // Votre ID utilisateur

  const newUnfollowers = [
    {
      userId: userId,
      username: 'emmaa.roussel',
      status: 'unfollowed',
      detectedAt: new Date(),
    },
    {
      userId: userId,
      username: 't0m.pei',
      status: 'unfollowed',
      detectedAt: new Date(),
    }
  ];

  try {
    console.log('Ajout de:');
    console.log('  1. @emmaa.roussel');
    console.log('  2. @t0m.pei\n');

    const result = await db.insert(unfollowers).values(newUnfollowers);

    console.log('✅ Unfollowers ajoutés avec succès!');
    console.log('\nVérification...');

    // Vérifier que l'ajout a fonctionné
    const { eq } = await import('drizzle-orm');
    const allUnfollowers = await db
      .select()
      .from(unfollowers)
      .where(eq(unfollowers.userId, userId));

    console.log(`\n📊 Total d'unfollowers pour l'utilisateur ${userId}: ${allUnfollowers.length}`);
    
    console.log('\nDerniers unfollowers:');
    allUnfollowers.slice(-5).forEach((u, i) => {
      console.log(`  ${i + 1}. @${u.username} (${u.status}) - ${u.detectedAt}`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    process.exit(0);
  }
}

addUnfollowersToDb();
