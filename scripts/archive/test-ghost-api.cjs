// Test de l'API Ghost Followers
async function testGhostAPI() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TEST API GHOST FOLLOWERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test 1: Stats
    console.log('📊 Test 1: GET /api/unfollowers/stats');
    const statsRes = await fetch('http://localhost:5000/api/unfollowers/stats', {
      credentials: 'include'
    });
    const stats = await statsRes.json();
    console.log('Stats:', JSON.stringify(stats, null, 2));
    console.log('');

    // Test 2: Unfollowers
    console.log('👋 Test 2: GET /api/unfollowers');
    const unfollowersRes = await fetch('http://localhost:5000/api/unfollowers', {
      credentials: 'include'
    });
    const unfollowers = await unfollowersRes.json();
    console.log('Unfollowers:', JSON.stringify(unfollowers, null, 2));
    console.log('');

    // Test 3: Ghost Followers
    console.log('👻 Test 3: GET /api/ghost-followers');
    const ghostRes = await fetch('http://localhost:5000/api/ghost-followers', {
      credentials: 'include'
    });
    const ghost = await ghostRes.json();
    console.log('Ghost Followers:', JSON.stringify(ghost, null, 2));
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ RÉSUMÉ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 Stats: ${stats.unfollowed} unfollowed, ${stats.blocked} blocked, ${stats.deleted} deleted, ${stats.ghost} ghost`);
    console.log(`👋 Unfollowers: ${unfollowers.unfollowers?.length || 0} comptes`);
    console.log(`👻 Ghost: ${ghost.ghostFollowers?.length || 0} comptes`);
    
    if (ghost.ghostFollowers?.length > 0) {
      console.log('\n👻 Liste des Ghost:');
      ghost.ghostFollowers.forEach(g => {
        const emoji = g.status === 'blocked' ? '🚫' : '❌';
        console.log(`   ${emoji} @${g.username} (${g.status})`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testGhostAPI();
