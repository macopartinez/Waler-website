/**
 * Script pour envoyer les résultats d'analyse en attente
 * À exécuter dans la console d'une page Instagram
 * 
 * Ce script récupère les résultats stockés dans localStorage
 * et les envoie au backend + met à jour les stats
 */

(async function sendPendingResults() {
  console.log('📤 Envoi des résultats en attente...\n');

  // 1. Vérifier s'il y a des résultats en attente
  const unfollowerCheckState = localStorage.getItem('unfollowerCheckState');
  
  if (!unfollowerCheckState) {
    console.log('❌ Aucun résultat en attente dans localStorage');
    return;
  }

  const state = JSON.parse(unfollowerCheckState);
  
  console.log('📊 Résultats trouvés:');
  console.log(`  - Unfollowed: ${state.results.unfollowed.length}`);
  console.log(`  - Blocked: ${state.results.blocked.length}`);
  console.log(`  - Not found: ${state.results.notFoundOnInstagram.length}`);

  // 2. Envoyer au backend
  console.log('\n📤 Envoi au backend...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_UNFOLLOWER_RESULTS',
      data: {
        unfollowedUsernames: state.results.unfollowed,
        blockedUsernames: state.results.blocked,
        missingUsernames: state.results.notFoundOnInstagram,
      },
    });

    if (response && response.success) {
      console.log('✅ Résultats envoyés au backend avec succès');
    } else {
      console.error('❌ Erreur lors de l\'envoi au backend:', response);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }

  // 3. Mettre à jour les stats de session
  console.log('\n📊 Mise à jour des stats de session...');
  
  const totalUnfollowers = state.results.unfollowed.length;
  const totalBlockers = state.results.blocked.length + state.results.notFoundOnInstagram.length;

  try {
    const updateResponse = await chrome.runtime.sendMessage({
      type: 'UPDATE_UNFOLLOWER_STATS',
      data: {
        unfollowers: totalUnfollowers,
        potentialBlockers: totalBlockers,
      },
    });

    if (updateResponse && updateResponse.success) {
      console.log('✅ Stats de session mises à jour');
    } else {
      console.error('❌ Erreur lors de la mise à jour des stats:', updateResponse);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }

  // 4. Envoyer la notification de fin d'analyse
  console.log('\n📢 Envoi de la notification de fin d\'analyse...');
  
  try {
    const completedResponse = await chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETED',
      data: {
        unfollowers: totalUnfollowers,
        blocked: state.results.blocked.length,
        notFound: state.results.notFoundOnInstagram.length,
      },
    });

    if (completedResponse && completedResponse.success) {
      console.log('✅ Notification envoyée');
      console.log('   → Le popup devrait se rafraîchir automatiquement');
      console.log('   → Le dashboard devrait se rafraîchir automatiquement');
    } else {
      console.error('❌ Erreur lors de l\'envoi de la notification:', completedResponse);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }

  // 5. Nettoyer le localStorage
  console.log('\n🧹 Nettoyage du localStorage...');
  localStorage.removeItem('unfollowerCheckState');
  console.log('✅ État nettoyé');

  // 6. Marquer l'analyse comme terminée
  await chrome.storage.local.set({ isAnalyzing: false });

  console.log('\n' + '='.repeat(60));
  console.log('✅ TERMINÉ !');
  console.log('='.repeat(60));
  console.log('\n📱 Vérifiez maintenant:');
  console.log('   1. Ouvrez le popup de l\'extension');
  console.log(`      → Vous devriez voir ${totalUnfollowers} unfollower(s)`);
  console.log('   2. Ouvrez le dashboard');
  console.log('      → Il devrait afficher les nouvelles stats');
  console.log('\n💡 Les stats devraient se mettre à jour automatiquement!');

  return {
    unfollowers: totalUnfollowers,
    blockers: totalBlockers,
    details: state.results
  };
})();
