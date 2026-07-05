/**
 * Script pour vérifier l'authentification de l'extension
 * À exécuter dans la console Instagram (F12 → Console)
 */

chrome.storage.local.get(['userId', 'token', 'isAuthenticated', 'apiToken'], (result) => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔐 ÉTAT D\'AUTHENTIFICATION DE L\'EXTENSION');
  console.log('═══════════════════════════════════════════════════════');
  
  if (result.userId) {
    console.log('✅ User ID:', result.userId);
  } else {
    console.log('❌ User ID: NON TROUVÉ');
  }
  
  if (result.token) {
    console.log('✅ Token:', result.token.substring(0, 20) + '...');
  } else if (result.apiToken) {
    console.log('✅ API Token:', result.apiToken.substring(0, 20) + '...');
  } else {
    console.log('❌ Token: NON TROUVÉ');
  }
  
  if (result.isAuthenticated) {
    console.log('✅ Is Authenticated:', result.isAuthenticated);
  } else {
    console.log('❌ Is Authenticated: FALSE ou NON DÉFINI');
  }
  
  console.log('═══════════════════════════════════════════════════════');
  
  if (!result.userId || (!result.token && !result.apiToken)) {
    console.log('');
    console.log('⚠️ PROBLÈME DÉTECTÉ : Extension non authentifiée');
    console.log('');
    console.log('📝 SOLUTION :');
    console.log('1. Allez sur le dashboard Waler');
    console.log('2. Déconnectez-vous');
    console.log('3. Reconnectez-vous');
    console.log('4. L\'extension devrait recevoir le token automatiquement');
    console.log('');
  } else {
    console.log('');
    console.log('✅ Extension correctement authentifiée !');
    console.log('');
  }
});
