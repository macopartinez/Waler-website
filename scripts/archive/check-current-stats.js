/**
 * Script pour vérifier les stats actuelles de l'extension
 * À exécuter dans la console du Service Worker de l'extension
 */

(async function checkCurrentStats() {
  console.log('🔍 Vérification des stats actuelles...\n');

  // 1. Vérifier les stats de session
  const stored = await chrome.storage.local.get([
    'sessionStats',
    'followerDatabase',
    'unfollowerDetected',
    'unfollowerCount',
    'lastSync',
    'isAnalyzing',
    'unfollowerCheckState'
  ]);

  console.log('📊 Stats de session:');
  console.log(stored.sessionStats || 'Aucune stat de session');

  console.log('\n📁 Base de données de followers:');
  if (stored.followerDatabase) {
    const db = stored.followerDatabase;
    console.log(`  - Total count: ${db.totalCount}`);
    console.log(`  - Followers en DB: ${Object.keys(db.followers || {}).length}`);
    console.log(`  - Dernière mise à jour: ${db.lastScanDate}`);
    console.log(`  - Initialisé: ${db.isInitialized}`);
  } else {
    console.log('  Aucune base de données');
  }

  console.log('\n🔔 Détection d\'unfollowers:');
  console.log(`  - Unfollowers détectés: ${stored.unfollowerDetected || false}`);
  console.log(`  - Nombre d'unfollowers: ${stored.unfollowerCount || 0}`);

  console.log('\n🔄 Synchronisation:');
  if (stored.lastSync) {
    const lastSync = new Date(stored.lastSync);
    console.log(`  - Dernière sync: ${lastSync.toLocaleString()}`);
  } else {
    console.log('  - Jamais synchronisé');
  }

  console.log('\n⚙️  État de l\'analyse:');
  console.log(`  - Analyse en cours: ${stored.isAnalyzing || false}`);
  if (stored.unfollowerCheckState) {
    const state = stored.unfollowerCheckState;
    console.log(`  - Progression: ${state.currentIndex}/${state.missingFollowers?.length || 0}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('RÉSUMÉ:');
  console.log('='.repeat(60));
  
  const stats = stored.sessionStats || { followers: 0, unfollowers: 0, potentialBlockers: 0 };
  console.log(`✅ Followers: ${stats.followers}`);
  console.log(`❌ Unfollowers: ${stats.unfollowers}`);
  console.log(`🚫 Potential Blockers: ${stats.potentialBlockers}`);
  
  if (stats.unfollowers > 0) {
    console.log('\n⚠️  UNFOLLOWERS DÉTECTÉS!');
    console.log(`   Vous avez ${stats.unfollowers} unfollower(s) dans les stats de session`);
  } else {
    console.log('\n✅ Aucun unfollower dans les stats de session');
  }

  return stored;
})();
