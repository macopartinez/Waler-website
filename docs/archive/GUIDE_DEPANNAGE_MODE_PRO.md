# Guide de Dépannage - Mode Pro ne charge pas

## Symptômes
- La page du mode pro ne s'affiche pas
- Erreurs dans la console du navigateur
- Redirection automatique vers pricing
- Page blanche

## Solutions Rapides

### Solution 1: Activer le mode Pro via script (RECOMMANDÉ)

1. **Assurez-vous que le serveur est lancé**
   ```bash
   cd server
   npm run dev
   ```

2. **Connectez-vous à l'application** dans votre navigateur
   - Allez sur http://localhost:5000
   - Connectez-vous avec votre compte

3. **Exécutez le script d'activation**
   ```bash
   # Double-cliquez sur:
   activate-pro-mode.bat
   ```

4. **Rechargez la page** dans votre navigateur (F5)

### Solution 2: Via la console du navigateur

1. Ouvrez la console (F12)
2. Exécutez:
   ```javascript
   fetch('/api/subscription/force-pro', {
     method: 'POST',
     credentials: 'include'
   })
   .then(r => r.json())
   .then(console.log)
   .then(() => location.reload())
   ```

### Solution 3: Via la base de données

1. Ouvrez la base de données SQLite:
   ```bash
   cd server
   sqlite3 waler.db
   ```

2. Trouvez votre ID utilisateur:
   ```sql
   SELECT id, username, email, subscription_tier FROM users;
   ```

3. Mettez à jour votre abonnement:
   ```sql
   UPDATE users 
   SET subscription_tier = 'pro', 
       subscription_status = 'active' 
   WHERE id = VOTRE_ID;
   ```

4. Vérifiez:
   ```sql
   SELECT id, username, subscription_tier, subscription_status FROM users WHERE id = VOTRE_ID;
   ```

5. Quittez SQLite:
   ```sql
   .quit
   ```

## Diagnostic

### Vérifier le statut d'abonnement

**Dans la console du navigateur:**
```javascript
fetch('/api/subscription/status', { credentials: 'include' })
  .then(r => r.json())
  .then(data => {
    console.log('📊 Subscription Status:', data);
    console.log('isPro:', data.tier === 'pro');
  })
```

**Résultat attendu:**
```json
{
  "tier": "pro",
  "status": "active",
  "trialEndsAt": null
}
```

### Vérifier les logs de la console

Cherchez ces messages dans la console:
- ✅ `Rendering Pro Dashboard` → Le composant se charge
- ⚠️ `Redirecting non-Pro user` → Vous n'êtes pas Pro
- 🔍 `Pro Mode Check` → Détails du statut

### Vérifier les erreurs de composants

Si vous voyez des erreurs comme:
- `Cannot find module` → Problème d'import
- `undefined is not a function` → Composant manquant
- `Maximum update depth exceeded` → Boucle infinie

**Partagez ces erreurs pour diagnostic approfondi.**

## Erreurs Courantes

### Erreur 1: "Redirecting non-Pro user"
**Cause:** `isPro` est `false`
**Solution:** Utilisez Solution 1 ou 2 ci-dessus

### Erreur 2: "Error rendering Pro Dashboard"
**Cause:** Erreur dans le composant ProDashboard
**Solution:** Vérifiez la console pour l'erreur exacte

### Erreur 3: Page blanche sans erreur
**Cause:** Problème de chargement ou redirection
**Solution:** 
1. Vérifiez les logs console
2. Vérifiez Network tab (F12 → Network)
3. Videz le cache (Ctrl+Shift+Delete)

### Erreur 4: "subLoading" reste à true
**Cause:** L'API `/api/subscription/status` ne répond pas
**Solution:**
1. Vérifiez que le serveur est lancé
2. Vérifiez les logs serveur
3. Testez l'API manuellement

## Vérifications Supplémentaires

### 1. Vérifier que le serveur répond
```bash
curl http://localhost:5000/api/subscription/status
```

### 2. Vérifier les cookies de session
Dans la console:
```javascript
document.cookie
```

### 3. Vérifier le localStorage
```javascript
console.log('LocalStorage:', localStorage);
```

### 4. Forcer le mode Pro temporairement (DEV ONLY)
Dans `Dashboard.tsx`, ligne 536, modifiez:
```typescript
if (mode === 'professional' && !isPro && !subLoading && false) {
  // Ajoutez && false pour désactiver la redirection
```

## Fichiers Modifiés

Les modifications suivantes ont été apportées pour le débogage:

1. **`Dashboard.tsx`** (lignes 527-547)
   - Ajout de logs de débogage
   - Ajout d'un try-catch autour du ProDashboard
   - Vérification de `subLoading` avant redirection

2. **`routes.ts`** (lignes 217-241)
   - Ajout de l'endpoint `/api/subscription/force-pro`

3. **Scripts créés:**
   - `activate-pro-mode.bat` - Active le mode Pro
   - `test-subscription.bat` - Teste le statut
   - `fix-pro-subscription.sql` - Script SQL

## Support

Si le problème persiste:

1. **Partagez les erreurs de la console**
2. **Partagez le résultat de `/api/subscription/status`**
3. **Partagez les logs serveur**
4. **Indiquez quelle solution vous avez essayée**

## Notes de Développement

- L'endpoint `/api/subscription/force-pro` est **DEV ONLY**
- Ne pas utiliser en production
- Supprimer cet endpoint avant le déploiement
