# Script PowerShell pour mettre à jour le nombre de followers MAINTENANT
# Usage: .\UPDATE-FOLLOWERS-MAINTENANT.ps1

Write-Host "`n🔧 MISE À JOUR IMMÉDIATE DU NOMBRE DE FOLLOWERS" -ForegroundColor Cyan
Write-Host "===============================================`n" -ForegroundColor Cyan

# Configuration
$userId = 21
$newFollowerCount = 211

Write-Host "📊 User ID: $userId" -ForegroundColor Yellow
Write-Host "📈 Nouveau nombre de followers: $newFollowerCount`n" -ForegroundColor Yellow

# Connexion à PostgreSQL via psql
Write-Host "🔌 Connexion à la base de données..." -ForegroundColor Cyan

# Commande SQL
$sqlCommand = @"
UPDATE users 
SET followers_count = $newFollowerCount, 
    last_analyzed_at = NOW() 
WHERE id = $userId 
RETURNING id, username, followers_count, last_analyzed_at;
"@

Write-Host "📝 Commande SQL:" -ForegroundColor Yellow
Write-Host $sqlCommand -ForegroundColor White
Write-Host ""

# Exécuter via psql (si disponible)
try {
    # Essayer avec psql
    $env:PGPASSWORD = "postgres"
    $result = & psql -U postgres -d waler -h localhost -c $sqlCommand 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Mise à jour réussie !" -ForegroundColor Green
        Write-Host $result -ForegroundColor White
    } else {
        throw "Erreur psql"
    }
} catch {
    Write-Host "⚠️ psql non disponible, utilisation de l'API..." -ForegroundColor Yellow
    Write-Host ""
    
    # Alternative : Utiliser l'API directement
    Write-Host "📤 Envoi via l'API..." -ForegroundColor Cyan
    
    # Note: Cette méthode nécessite d'être authentifié
    Write-Host "❌ Impossible de mettre à jour via l'API sans authentification" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 SOLUTION MANUELLE:" -ForegroundColor Yellow
    Write-Host "1. Ouvrez pgAdmin ou un client PostgreSQL" -ForegroundColor White
    Write-Host "2. Connectez-vous à la base 'waler'" -ForegroundColor White
    Write-Host "3. Exécutez cette commande SQL:" -ForegroundColor White
    Write-Host ""
    Write-Host $sqlCommand -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "`n🔄 Après la mise à jour:" -ForegroundColor Yellow
Write-Host "  1. Rechargez le dashboard (F5)" -ForegroundColor White
Write-Host "  2. Le nombre devrait être 211`n" -ForegroundColor White
