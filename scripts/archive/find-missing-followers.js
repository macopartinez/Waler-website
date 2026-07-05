/**
 * Script pour identifier les 2 followers manquants
 * À exécuter dans la console du Service Worker de l'extension
 */

(async function findMissingFollowers() {
  console.log('🔍 Recherche des followers manquants...\n');

  // 1. Récupérer la base de données locale de l'extension
  const stored = await chrome.storage.local.get('followerDatabase');
  const followerDatabase = stored.followerDatabase;

  if (!followerDatabase || !followerDatabase.followers) {
    console.error('❌ Aucune base de données de followers trouvée dans l\'extension');
    console.log('💡 Vous devez d\'abord faire un scan initial des followers');
    return;
  }

  const localFollowers = Object.keys(followerDatabase.followers);
  console.log(`📊 Followers dans la DB locale de l'extension: ${localFollowers.length}`);
  console.log(`📊 Followers actuels sur Instagram: 211`);
  console.log(`📊 Différence: ${localFollowers.length - 211} unfollower(s)\n`);

  if (localFollowers.length === 211) {
    console.log('✅ Aucun unfollower détecté - La DB est à jour');
    return;
  }

  console.log('🔍 Pour identifier les unfollowers, vous devez:');
  console.log('1. Ouvrir Instagram');
  console.log('2. Ouvrir le modal de vos followers');
  console.log('3. Lancer l\'analyse des unfollowers depuis le popup de l\'extension');
  console.log('\nL\'extension va automatiquement:');
  console.log('- Scanner vos 211 followers actuels');
  console.log('- Comparer avec les ' + localFollowers.length + ' en base');
  console.log('- Identifier les ' + (localFollowers.length - 211) + ' manquants');
  console.log('- Mettre à jour le popup et le dashboard automatiquement ✨');

  console.log('\n💡 Ou utilisez le script de test pour simuler la détection:');
  console.log('   Voir: Test-Instructions.txt');
})();
