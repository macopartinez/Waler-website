/**
 * Script Node.js pour tester la notification d'unfollowers
 * Simule l'envoi de résultats d'analyse au backend
 */

const API_URL = 'http://localhost:5000/api';

async function testUnfollowerNotification() {
  console.log('🧪 Test de notification d\'unfollowers\n');

  // Vous devez remplacer ces valeurs par vos vraies données
  const userId = 21; // Remplacez par votre ID utilisateur
  const apiToken = 'votre_token_ici'; // Vous devrez obtenir le token depuis chrome.storage

  // Résultats simulés
  const mockResults = {
    unfollowedUsernames: ['user1', 'user2'],
    blockedUsernames: [],
    missingUsernames: [],
  };

  console.log('📊 Résultats à envoyer:', mockResults);

  try {
    // 1. Envoyer les résultats au backend
    console.log('\n📤 Envoi des résultats au backend...');
    const response = await fetch(`${API_URL}/extension/verify-missing-followers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(mockResults),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Résultats envoyés avec succès:', result);
    } else {
      const error = await response.text();
      console.error('❌ Erreur lors de l\'envoi:', response.status, error);
    }

    console.log('\n✅ Test terminé !');
    console.log('📱 Vérifiez le popup de l\'extension');
    console.log('🌐 Vérifiez le dashboard web');
    console.log('   Les stats devraient se mettre à jour automatiquement');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Note: Ce script nécessite un token d'authentification valide
console.log('⚠️  IMPORTANT: Vous devez d\'abord obtenir votre token d\'authentification');
console.log('   1. Ouvrez la console de l\'extension (DevTools)');
console.log('   2. Exécutez: chrome.storage.local.get([\'apiToken\', \'userId\'])');
console.log('   3. Copiez les valeurs dans ce script\n');

// Décommenter pour exécuter
// testUnfollowerNotification();
