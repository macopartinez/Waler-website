/**
 * Script pour simuler la détection des 2 unfollowers manquants
 * À exécuter dans la console du Service Worker de l'extension
 * 
 * Situation actuelle:
 * - DB locale: 213 followers
 * - Instagram actuel: 211 followers
 * - Différence: 2 unfollowers non détectés
 */

(async function simulate2Unfollowers() {
  console.log('🎬 Simulation de la détection de 2 unfollowers...\n');

  // 1. Vérifier les stats actuelles
  const stored = await chrome.storage.local.get(['sessionStats', 'followerDatabase']);
  const currentStats = stored.sessionStats || {
    followers: 0,
    unfollowers: 0,
    potentialBlockers: 0,
    engagements: 0,
  };

  console.log('📊 Stats AVANT la détection:');
  console.log(`   - Followers: ${currentStats.followers}`);
  console.log(`   - Unfollowers: ${currentStats.unfollowers}`);
  console.log(`   - Potential Blockers: ${currentStats.potentialBlockers}`);

  // 2. Mettre à jour les stats pour refléter les 2 unfollowers
  const newStats = {
    ...currentStats,
    unfollowers: currentStats.unfollowers + 2,
  };

  await chrome.storage.local.set({ sessionStats: newStats });

  console.log('\n📊 Stats APRÈS la détection:');
  console.log(`   - Followers: ${newStats.followers}`);
  console.log(`   - Unfollowers: ${newStats.unfollowers} (+2) ⬆️`);
  console.log(`   - Potential Blockers: ${newStats.potentialBlockers}`);

  // 3. Mettre à jour le compteur de followers dans la DB
  if (stored.followerDatabase) {
    const db = stored.followerDatabase;
    const oldCount = db.totalCount;
    db.totalCount = 211; // Le nombre réel actuel sur Instagram

    await chrome.storage.local.set({ 
      followerDatabase: db,
      lastFollowerCount: 211
    });

    console.log(`\n📉 Compteur de followers mis à jour: ${oldCount} → 211`);
  }

  // 4. Marquer qu'il y a des unfollowers détectés
  await chrome.storage.local.set({
    unfollowerDetected: true,
    unfollowerCount: 2
  });

  console.log('\n🔔 Unfollowers marqués comme détectés');

  // 5. Envoyer la notification ANALYSIS_COMPLETED
  console.log('\n📤 Envoi de la notification de fin d\'analyse...');

  const mockResults = {
    unfollowers: 2,
    blocked: 0,
    notFound: 0,
  };

  // Notifier tous les onglets du dashboard
  const tabs = await chrome.tabs.query({});
  let dashboardNotified = 0;
  
  for (const tab of tabs) {
    if (tab.url?.includes('localhost:5000/dashboard')) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'REFRESH_DASHBOARD',
          data: mockResults
        });
        console.log(`   ✅ Dashboard tab ${tab.id} notifié`);
        dashboardNotified++;
      } catch (e) {
        console.log(`   ⚠️  Tab ${tab.id}: ${e.message}`);
      }
    }
  }

  if (dashboardNotified === 0) {
    console.log('   ℹ️  Aucun onglet dashboard ouvert');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ SIMULATION TERMINÉE !');
  console.log('='.repeat(60));
  console.log('\n📱 Actions à faire maintenant:');
  console.log('   1. Ouvrez le popup de l\'extension');
  console.log('      → Vous devriez voir 2 unfollowers');
  console.log('   2. Si vous avez un dashboard ouvert:');
  console.log('      → Il devrait se rafraîchir automatiquement');
  console.log('   3. Vérifiez que les stats sont à jour sans recharger ✨');
  
  console.log('\n💡 Pour voir les stats actuelles:');
  console.log('   Ouvrez le popup ou exécutez:');
  console.log('   (async () => {');
  console.log('     const s = await chrome.storage.local.get("sessionStats");');
  console.log('     console.log(s.sessionStats);');
  console.log('   })();');

  return {
    before: currentStats,
    after: newStats,
    difference: {
      unfollowers: 2
    }
  };
})();
