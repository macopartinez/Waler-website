/**
 * Script pour vérifier l'état de la dernière analyse
 * À exécuter dans la console du Service Worker de l'extension
 */

(async function checkAnalysisState() {
  console.log('🔍 Vérification de l\'état de l\'analyse...\n');

  const stored = await chrome.storage.local.get([
    'sessionStats',
    'followerDatabase',
    'unfollowerDetected',
    'unfollowerCount',
    'unfollowerCheckState',
    'isAnalyzing',
    'unfollowerAnalysisProgress',
    'lastSync'
  ]);

  console.log('📊 STATS DE SESSION:');
  console.log(stored.sessionStats || 'Aucune stat');

  console.log('\n📁 BASE DE DONNÉES:');
  if (stored.followerDatabase) {
    const db = stored.followerDatabase;
    console.log(`  - Total count: ${db.totalCount}`);
    console.log(`  - Followers en DB: ${Object.keys(db.followers || {}).length}`);
    console.log(`  - Dernière mise à jour: ${db.lastScanDate}`);
  }

  console.log('\n🔔 DÉTECTION D\'UNFOLLOWERS:');
  console.log(`  - Unfollowers détectés: ${stored.unfollowerDetected || false}`);
  console.log(`  - Nombre: ${stored.unfollowerCount || 0}`);

  console.log('\n⚙️  ÉTAT DE L\'ANALYSE:');
  console.log(`  - Analyse en cours: ${stored.isAnalyzing || false}`);
  
  if (stored.unfollowerCheckState) {
    const state = stored.unfollowerCheckState;
    console.log('\n📋 ÉTAT DE VÉRIFICATION DES UNFOLLOWERS:');
    console.log(`  - Progression: ${state.currentIndex}/${state.missingFollowers?.length || 0}`);
    console.log(`  - Username: ${state.myUsername}`);
    console.log(`  - Followers manquants à vérifier:`, state.missingFollowers);
    console.log(`  - Résultats:`, state.results);
    
    console.log('\n⚠️  ANALYSE INCOMPLÈTE DÉTECTÉE!');
    console.log('   L\'analyse a été interrompue ou n\'a pas envoyé les résultats.');
    console.log('\n💡 Solutions:');
    console.log('   1. Relancer l\'analyse pour terminer');
    console.log('   2. Ou nettoyer l\'état et utiliser la simulation');
  }

  if (stored.unfollowerAnalysisProgress) {
    console.log('\n📈 PROGRESSION DE L\'ANALYSE:');
    console.log(stored.unfollowerAnalysisProgress);
  }

  console.log('\n🔄 SYNCHRONISATION:');
  if (stored.lastSync) {
    const lastSync = new Date(stored.lastSync);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSync.getTime()) / 60000);
    console.log(`  - Dernière sync: ${lastSync.toLocaleString()}`);
    console.log(`  - Il y a ${diffMinutes} minutes`);
  } else {
    console.log('  - Jamais synchronisé');
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSTIC:');
  console.log('='.repeat(60));

  const stats = stored.sessionStats || { unfollowers: 0 };
  const dbCount = stored.followerDatabase?.totalCount || 0;
  const actualCount = 211; // Nombre réel sur Instagram

  if (dbCount > actualCount) {
    const missing = dbCount - actualCount;
    console.log(`❌ ${missing} unfollower(s) détecté(s) mais non enregistré(s) dans les stats`);
    console.log(`   - DB: ${dbCount} followers`);
    console.log(`   - Instagram: ${actualCount} followers`);
    console.log(`   - Stats unfollowers: ${stats.unfollowers}`);
    
    if (stats.unfollowers === 0) {
      console.log('\n⚠️  PROBLÈME CONFIRMÉ:');
      console.log('   L\'analyse a trouvé les unfollowers mais n\'a pas mis à jour les stats!');
      console.log('   C\'est exactement le bug que nous avons corrigé.');
    }
  } else {
    console.log('✅ Tout semble à jour');
  }

  return stored;
})();
