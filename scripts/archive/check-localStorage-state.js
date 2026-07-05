/**
 * Script pour vérifier l'état dans localStorage
 * À exécuter dans la console d'une page Instagram (pas le Service Worker)
 */

(function checkLocalStorageState() {
  console.log('🔍 Vérification du localStorage...\n');

  const unfollowerCheckState = localStorage.getItem('unfollowerCheckState');
  
  if (unfollowerCheckState) {
    console.log('📋 ÉTAT DE VÉRIFICATION DES UNFOLLOWERS TROUVÉ:');
    const state = JSON.parse(unfollowerCheckState);
    
    console.log(`  - Username: ${state.myUsername}`);
    console.log(`  - Progression: ${state.currentIndex}/${state.missingFollowers?.length || 0}`);
    console.log(`  - Followers manquants:`, state.missingFollowers);
    console.log('\n📊 RÉSULTATS:');
    console.log(`  - Unfollowed: ${state.results.unfollowed.length}`, state.results.unfollowed);
    console.log(`  - Blocked: ${state.results.blocked.length}`, state.results.blocked);
    console.log(`  - Not found: ${state.results.notFoundOnInstagram.length}`, state.results.notFoundOnInstagram);
    
    console.log('\n' + '='.repeat(60));
    
    if (state.currentIndex >= state.missingFollowers.length) {
      console.log('✅ ANALYSE TERMINÉE');
      console.log('\n⚠️  MAIS les résultats n\'ont peut-être pas été envoyés!');
      console.log('   C\'est le bug que nous avons corrigé.');
      console.log('\n💡 Les résultats sont là:');
      console.log(`   - ${state.results.unfollowed.length} unfollower(s)`);
      console.log(`   - ${state.results.blocked.length} bloqué(s)`);
      console.log(`   - ${state.results.notFoundOnInstagram.length} non trouvé(s)`);
      
      console.log('\n🔧 Pour envoyer ces résultats maintenant:');
      console.log('   Exécutez le script: send-pending-results.js');
    } else {
      console.log('⏸️  ANALYSE INCOMPLÈTE');
      console.log(`   Progression: ${state.currentIndex}/${state.missingFollowers.length}`);
      console.log('   L\'analyse a été interrompue.');
    }
  } else {
    console.log('✅ Aucun état d\'analyse en attente dans localStorage');
  }
  
  return unfollowerCheckState ? JSON.parse(unfollowerCheckState) : null;
})();
