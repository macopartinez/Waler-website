# Script PowerShell pour tester la mise à jour automatique des stats
# Ce script affiche les instructions pour tester manuellement

Write-Host "🧪 Test de mise à jour automatique des stats d'unfollowers" -ForegroundColor Cyan
Write-Host ""

# Verifier que le serveur est en cours d'execution
Write-Host "Verification du serveur..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/" -UseBasicParsing -TimeoutSec 2
    Write-Host "✅ Serveur accessible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Serveur non accessible. Lancez 'npm run dev' d'abord." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Instructions pour tester:" -ForegroundColor Cyan
Write-Host ""
Write-Host "OPTION 1 - Test via la console de l'extension (RECOMMANDÉ)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "1. Ouvrez Chrome et allez sur: chrome://extensions/"
Write-Host "2. Activez le 'Mode développeur' en haut à droite"
Write-Host "3. Trouvez l'extension 'Waler'"
Write-Host "4. Cliquez sur 'Service worker' (lien bleu)"
Write-Host "5. Dans la console qui s'ouvre, copiez-collez ce code:"
Write-Host ""

$testCode = @'
(async function testUnfollowerUpdate() {
  console.log('🧪 Test de mise à jour automatique\n');
  
  // Mettre à jour les stats
  const stored = await chrome.storage.local.get('sessionStats');
  const currentStats = stored.sessionStats || {
    followers: 0,
    unfollowers: 0,
    potentialBlockers: 0,
    engagements: 0,
  };
  
  console.log('📊 Stats avant:', currentStats);
  
  const newStats = {
    ...currentStats,
    unfollowers: currentStats.unfollowers + 2,
  };
  
  await chrome.storage.local.set({ sessionStats: newStats });
  console.log('✅ Stats après:', newStats);
  
  // Notifier les dashboards
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url?.includes('localhost:5000/dashboard')) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'REFRESH_DASHBOARD',
          data: { unfollowers: 2, blocked: 0, notFound: 0 }
        });
        console.log(`✅ Dashboard tab ${tab.id} notifié`);
      } catch (e) {
        console.log(`⚠️  Tab ${tab.id}: ${e.message}`);
      }
    }
  }
  
  console.log('\n✅ Test terminé!');
  console.log('📱 Ouvrez le popup pour voir +2 unfollowers');
})();
'@

Write-Host $testCode -ForegroundColor Gray
Write-Host ""
Write-Host "6. Appuyez sur Entree pour executer"
Write-Host "7. Ouvrez le popup de l'extension (cliquez sur l'icone)"
Write-Host "8. Verifiez que les unfollowers ont augmente de 2" -ForegroundColor Green
Write-Host ""

Write-Host "OPTION 2 - Verifier les stats actuelles" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Dans la même console, exécutez:"
Write-Host ""

$checkCode = @'
(async function() {
  const stored = await chrome.storage.local.get('sessionStats');
  console.log('📊 Stats actuelles:', stored.sessionStats);
})();
'@

Write-Host $checkCode -ForegroundColor Gray
Write-Host ""

Write-Host "OPTION 3 - Reinitialiser les stats" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host "Pour remettre à zéro:"
Write-Host ""

$resetCode = @'
(async function() {
  await chrome.storage.local.set({
    sessionStats: {
      followers: 0,
      unfollowers: 0,
      potentialBlockers: 0,
      engagements: 0,
    }
  });
  console.log('✅ Stats réinitialisées');
})();
'@

Write-Host $resetCode -ForegroundColor Gray
Write-Host ""

Write-Host "Plus d'infos dans le fichier: waler-extension/CONSOLE_TEST.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pret pour les tests!" -ForegroundColor Green
