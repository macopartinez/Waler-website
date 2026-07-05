/**
 * Script pour mettre à jour le nombre de followers via l'API backend
 * À exécuter avec: node update-via-api.js
 */

const fetch = require('node-fetch');

async function updateFollowerCount() {
  console.log('🔧 Mise à jour du nombre de followers...\n');
  
  const userId = 21;
  const newFollowerCount = 211;
  
  console.log(`📊 User ID: ${userId}`);
  console.log(`📈 Nouveau nombre: ${newFollowerCount}\n`);
  
  try {
    // Méthode 1 : Via l'endpoint public (si disponible)
    console.log('📤 Tentative via l\'API...');
    
    const response = await fetch('http://localhost:5000/api/users/instagram-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        followersCount: newFollowerCount,
        followingCount: 0,
        postsCount: 0,
        bio: '',
        isPrivate: false,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Mise à jour réussie !');
      console.log('Réponse:', data);
    } else {
      const error = await response.text();
      console.error('❌ Erreur:', response.status, error);
      console.log('\n📝 Utilisez plutôt le script SQL direct:');
      console.log('   update-db-direct.sql');
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.log('\n📝 Utilisez plutôt le script SQL direct:');
    console.log('   update-db-direct.sql');
  }
}

updateFollowerCount();
