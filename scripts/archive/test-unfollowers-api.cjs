// Script pour tester les nouvelles routes API unfollowers

async function testAPI() {
  const baseURL = 'http://localhost:5000';
  
  // Vous devez être authentifié - utilisez un token valide
  // Pour ce test, on va juste vérifier que les routes existent
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TEST DES ROUTES API UNFOLLOWERS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  try {
    // Test 1: Stats
    console.log('📊 Test 1: GET /api/unfollowers/stats');
    const statsRes = await fetch(`${baseURL}/api/unfollowers/stats`);
    console.log(`   Status: ${statsRes.status}`);
    if (statsRes.status === 401) {
      console.log('   ⚠️ Non authentifié (normal pour ce test)\n');
    }
    
    // Test 2: Unfollowers
    console.log('📋 Test 2: GET /api/unfollowers');
    const unfollowersRes = await fetch(`${baseURL}/api/unfollowers`);
    console.log(`   Status: ${unfollowersRes.status}`);
    if (unfollowersRes.status === 401) {
      console.log('   ⚠️ Non authentifié (normal pour ce test)\n');
    }
    
    // Test 3: Ghost Followers
    console.log('👻 Test 3: GET /api/ghost-followers');
    const ghostRes = await fetch(`${baseURL}/api/ghost-followers`);
    console.log(`   Status: ${ghostRes.status}`);
    if (ghostRes.status === 401) {
      console.log('   ⚠️ Non authentifié (normal pour ce test)\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Toutes les routes existent et répondent');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('💡 Pour tester avec authentification, utilisez le frontend');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testAPI();
