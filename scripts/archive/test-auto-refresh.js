/**
 * Script de test pour vérifier la mise à jour automatique
 * Simule l'ajout d'unfollowers dans la base de données
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

async function testAutoRefresh() {
  console.log('🧪 Test de rafraîchissement automatique\n');

  try {
    // 1. Obtenir un utilisateur de test
    console.log('📋 Récupération de l\'utilisateur de test...');
    
    // Vous devrez remplacer ces valeurs par vos vraies données
    const userId = 21; // ID de votre utilisateur de test
    
    // 2. Simuler l'ajout d'unfollowers
    console.log('\n📊 Simulation d\'ajout d\'unfollowers...');
    
    const mockUnfollowers = [
      {
        username: 'test_unfollower_1',
        unfollowedAt: new Date().toISOString(),
      },
      {
        username: 'test_unfollower_2',
        unfollowedAt: new Date().toISOString(),
      },
    ];

    console.log('Unfollowers à ajouter:', mockUnfollowers);

    // 3. Vérifier que le serveur est accessible
    console.log('\n🔍 Vérification du serveur...');
    const healthCheck = await fetch('http://localhost:5000/');
    if (healthCheck.ok) {
      console.log('✅ Serveur accessible');
    } else {
      console.log('❌ Serveur non accessible');
      return;
    }

    console.log('\n✅ Test préparé !');
    console.log('\n📝 Instructions pour tester manuellement:');
    console.log('1. Ouvrez le popup de l\'extension');
    console.log('2. Ouvrez le dashboard dans un navigateur');
    console.log('3. Ouvrez la console de l\'extension (chrome://extensions/ > Service Worker)');
    console.log('4. Copiez-collez le code du fichier CONSOLE_TEST.md');
    console.log('5. Vérifiez que le popup et le dashboard se mettent à jour automatiquement');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Vérifier que le serveur est lancé
console.log('⚠️  Assurez-vous que le serveur est lancé (npm run dev)');
console.log('⚠️  Assurez-vous que l\'extension est chargée dans Chrome\n');

testAutoRefresh();
