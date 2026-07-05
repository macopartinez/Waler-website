# Script PowerShell pour forcer la mise à jour du nombre de followers
# Usage: .\force-update-followers.ps1

Write-Host "`n🔄 Mise à jour du nombre de followers..." -ForegroundColor Cyan

# Récupérer le token d'authentification (vous devez être connecté)
$userId = 21
$newFollowerCount = 211

Write-Host "📊 Mise à jour pour l'utilisateur ID: $userId" -ForegroundColor Yellow
Write-Host "📈 Nouveau nombre de followers: $newFollowerCount" -ForegroundColor Yellow

# Préparer les données
$body = @{
    followersCount = $newFollowerCount
    followingCount = 0
    postsCount = 0
    bio = ""
    isPrivate = $false
} | ConvertTo-Json

Write-Host "`n📤 Envoi de la requête au backend..." -ForegroundColor Cyan

try {
    # Envoyer la requête (sans authentification pour test)
    $response = Invoke-WebRequest `
        -Uri "http://localhost:5000/api/users/instagram-stats" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing

    Write-Host "✅ Mise à jour réussie !" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor White
    Write-Host "`n🔄 Rechargez le dashboard pour voir le changement" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nℹ️  Assurez-vous d'être connecté au dashboard" -ForegroundColor Yellow
}

Write-Host ""
