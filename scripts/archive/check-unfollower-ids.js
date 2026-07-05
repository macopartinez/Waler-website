/**
 * Script pour vérifier si les IDs des unfollowers ont été trouvés
 * À exécuter dans la console d'une page Instagram (F12)
 */

(function checkUnfollowerIds() {
  console.log('🔍 Vérification des IDs des unfollowers...\n');

  // 1. Vérifier dans localStorage
  const unfollowerCheckState = localStorage.getItem('unfollowerCheckState');
  
  if (!unfollowerCheckState) {
    console.log('❌ Aucun état d\'analyse trouvé dans localStorage');
    console.log('💡 L\'analyse n\'a peut-être pas été lancée ou a été nettoyée');
    return null;
  }

  const state = JSON.parse(unfollowerCheckState);
  
  console.log('📊 ÉTAT DE L\'ANALYSE:');
  console.log(`  - Username: ${state.myUsername}`);
  console.log(`  - Progression: ${state.currentIndex}/${state.missingFollowers?.length || 0}`);
  console.log(`  - Followers manquants à vérifier:`, state.missingFollowers);
  
  console.log('\n📋 RÉSULTATS:');
  console.log(`  - Unfollowed: ${state.results.unfollowed.length}`);
  console.log(`  - Blocked: ${state.results.blocked.length}`);
  console.log(`  - Not found: ${state.results.notFoundOnInstagram.length}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('DÉTAILS DES UNFOLLOWERS:');
  console.log('='.repeat(60));
  
  if (state.results.unfollowed.length > 0) {
    console.log('\n✅ UNFOLLOWED (IDs trouvés):');
    state.results.unfollowed.forEach((username, index) => {
      console.log(`   ${index + 1}. @${username}`);
    });
    console.log('\n   ℹ️  Ces comptes existent toujours sur Instagram');
    console.log('      Ils vous ont simplement unfollowé');
  } else {
    console.log('\n❌ Aucun unfollower simple détecté');
  }
  
  if (state.results.blocked.length > 0) {
    console.log('\n🚫 BLOCKED (IDs trouvés mais compte privé/bloqué):');
    state.results.blocked.forEach((username, index) => {
      console.log(`   ${index + 1}. @${username}`);
    });
    console.log('\n   ℹ️  Ces comptes existent mais vous ne pouvez pas y accéder');
    console.log('      Ils vous ont peut-être bloqué ou mis leur compte en privé');
  } else {
    console.log('\n✅ Aucun compte bloqué détecté');
  }
  
  if (state.results.notFoundOnInstagram.length > 0) {
    console.log('\n❓ NOT FOUND (IDs non trouvés):');
    state.results.notFoundOnInstagram.forEach((username, index) => {
      console.log(`   ${index + 1}. @${username}`);
    });
    console.log('\n   ⚠️  Ces comptes n\'existent plus sur Instagram');
    console.log('      Compte supprimé ou username changé');
  } else {
    console.log('\n✅ Tous les comptes ont été trouvés sur Instagram');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('RÉSUMÉ:');
  console.log('='.repeat(60));
  
  const total = state.results.unfollowed.length + 
                state.results.blocked.length + 
                state.results.notFoundOnInstagram.length;
  
  console.log(`\n📊 Total d'unfollowers détectés: ${total}`);
  console.log(`   - Unfollowed (IDs OK): ${state.results.unfollowed.length}`);
  console.log(`   - Blocked (IDs OK mais inaccessibles): ${state.results.blocked.length}`);
  console.log(`   - Not found (IDs non trouvés): ${state.results.notFoundOnInstagram.length}`);
  
  if (state.currentIndex >= state.missingFollowers.length) {
    console.log('\n✅ ANALYSE TERMINÉE');
    console.log('   Tous les unfollowers ont été vérifiés');
    
    if (total === 2) {
      console.log('\n🎯 PARFAIT! Les 2 unfollowers manquants ont été identifiés:');
      const allUnfollowers = [
        ...state.results.unfollowed,
        ...state.results.blocked,
        ...state.results.notFoundOnInstagram
      ];
      allUnfollowers.forEach((username, index) => {
        console.log(`   ${index + 1}. @${username}`);
      });
    }
  } else {
    console.log('\n⏸️  ANALYSE INCOMPLÈTE');
    console.log(`   Progression: ${state.currentIndex}/${state.missingFollowers.length}`);
  }
  
  console.log('\n💡 PROCHAINES ÉTAPES:');
  if (total > 0) {
    console.log('   1. Les IDs ont été trouvés ✅');
    console.log('   2. MAIS les résultats n\'ont pas été envoyés au backend ❌');
    console.log('   3. Utilisez send-pending-results.js pour envoyer les résultats');
  } else {
    console.log('   Aucun unfollower détecté dans cette analyse');
  }
  
  return state;
})();
