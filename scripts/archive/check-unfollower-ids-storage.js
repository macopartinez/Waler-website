/**
 * Script pour vérifier les IDs des unfollowers dans chrome.storage
 * À exécuter dans la console du Service Worker de l'extension
 */

(async function checkUnfollowerIdsInStorage() {
  console.log('🔍 Vérification des IDs dans chrome.storage...\n');

  const stored = await chrome.storage.local.get([
    'unfollowerCheckState',
    'sessionStats',
    'followerDatabase'
  ]);

  // 1. Vérifier l'état de vérification
  if (stored.unfollowerCheckState) {
    const state = stored.unfollowerCheckState;
    console.log('📋 ÉTAT DE VÉRIFICATION TROUVÉ:');
    console.log(`  - Progression: ${state.currentIndex}/${state.missingFollowers?.length || 0}`);
    console.log(`  - Followers manquants:`, state.missingFollowers);
    console.log(`  - Résultats:`, state.results);
  } else {
    console.log('❌ Aucun état de vérification dans chrome.storage');
  }

  // 2. Vérifier la base de données de followers
  if (stored.followerDatabase) {
    const db = stored.followerDatabase;
    const followersList = Object.keys(db.followers || {});
    
    console.log('\n📁 BASE DE DONNÉES DE FOLLOWERS:');
    console.log(`  - Total count: ${db.totalCount}`);
    console.log(`  - Followers en DB: ${followersList.length}`);
    console.log(`  - Différence avec Instagram (211): ${followersList.length - 211}`);
    
    if (followersList.length > 211) {
      console.log('\n⚠️  Il y a des followers en DB qui ne sont plus sur Instagram');
      console.log('   Ces usernames sont connus mais il faut vérifier s\'ils existent encore');
    }
  }

  // 3. Vérifier les stats de session
  if (stored.sessionStats) {
    console.log('\n📊 STATS DE SESSION:');
    console.log(`  - Unfollowers: ${stored.sessionStats.unfollowers || 0}`);
    console.log(`  - Potential Blockers: ${stored.sessionStats.potentialBlockers || 0}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSTIC:');
  console.log('='.repeat(60));

  const dbCount = stored.followerDatabase?.totalCount || 0;
  const actualCount = 211;
  const difference = dbCount - actualCount;

  if (difference > 0) {
    console.log(`\n📊 ${difference} unfollower(s) manquant(s) entre DB et Instagram`);
    
    const statsUnfollowers = stored.sessionStats?.unfollowers || 0;
    
    if (statsUnfollowers === 0) {
      console.log('❌ MAIS les stats n\'ont pas été mises à jour');
      console.log('\n💡 SOLUTIONS:');
      console.log('   1. Vérifier localStorage sur une page Instagram');
      console.log('      → Exécutez: check-unfollower-ids.js');
      console.log('   2. Si les résultats sont là, envoyez-les');
      console.log('      → Exécutez: send-pending-results.js');
    } else {
      console.log(`✅ Stats mises à jour: ${statsUnfollowers} unfollower(s)`);
    }
  } else {
    console.log('\n✅ Aucune différence - Tout est à jour');
  }

  return stored;
})();
