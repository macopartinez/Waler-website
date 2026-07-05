/**
 * Script pour mettre à jour le nombre de followers dans la base de données
 * À exécuter dans la console du dashboard Waler
 */

(async () => {
  console.log('🔍 Mise à jour du nombre de followers...');
  
  try {
    // Demander le nouveau nombre de followers
    const newCount = prompt('Entrez le nombre actuel de followers sur Instagram:', '211');
    
    if (!newCount) {
      console.log('❌ Annulé');
      return;
    }
    
    const followersCount = parseInt(newCount);
    
    if (isNaN(followersCount)) {
      console.error('❌ Nombre invalide');
      return;
    }
    
    console.log(`📊 Mise à jour vers ${followersCount} followers...`);
    
    // Envoyer la mise à jour au backend
    const response = await fetch('/api/users/instagram-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        followersCount: followersCount,
        followingCount: 0, // Vous pouvez aussi mettre à jour ce nombre
        postsCount: 0,
        bio: '',
        isPrivate: false,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Nombre de followers mis à jour !', data);
      console.log('🔄 Rechargez la page pour voir le changement');
      
      // Recharger la page après 2 secondes
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      const error = await response.json();
      console.error('❌ Erreur:', error);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
})();
