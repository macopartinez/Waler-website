# Fix: Extension Auth ne se charge pas

## Problème identifié

L'authentification de l'extension Waler ne fonctionnait pas car **la route `/extension-auth` n'existait pas** dans le backend.

### Flux d'authentification prévu

1. L'utilisateur clique sur "Se connecter" dans le popup de l'extension
2. L'extension ouvre `http://localhost:5000/extension-auth`
3. Le backend génère un token temporaire et affiche une page HTML
4. La page HTML ajoute le token dans l'URL (`?waler_token=xxx&waler_user_id=yyy`)
5. Le content script `auth-listener.ts` détecte ces paramètres dans l'URL
6. Il envoie un message `WALER_AUTH` au service worker
7. Le service worker valide le token et stocke l'authentification

## Corrections apportées

### 1. Ajout de la route `/extension-auth` dans `server/routes.ts`

**Ligne 290-438** : Nouvelle route GET qui :
- Vérifie que l'utilisateur est authentifié (`requireAuth`)
- Génère un token temporaire (valide 5 minutes)
- Retourne une page HTML élégante qui :
  - Ajoute le token dans l'URL
  - Affiche un spinner et un message de confirmation
  - Se ferme automatiquement après 2 secondes

### 2. Amélioration du service worker

**Fichier** : `waler-extension/src/background/service-worker.ts` (lignes 75-106)

**Avant** : Le service worker acceptait le token sans validation
```typescript
case 'WALER_AUTH':
  await chrome.storage.local.set({
    isAuthenticated: true,
    userId: message.userId,
    apiToken: message.apiToken,
  });
  sendResponse({ success: true });
  break;
```

**Après** : Le service worker valide le token auprès du backend
```typescript
case 'WALER_AUTH':
  const validateResponse = await fetch('http://localhost:5000/api/extension/validate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: message.apiToken }),
  });
  
  const validateData = await validateResponse.json();
  
  if (validateData.valid && validateData.userId === message.userId) {
    await chrome.storage.local.set({
      isAuthenticated: true,
      userId: message.userId,
      apiToken: message.apiToken,
      lastSync: Date.now(),
    });
    sendResponse({ success: true });
  }
  break;
```

## Test de la solution

### 1. Rebuild l'extension
```bash
cd waler-extension
npm run build
```

### 2. Recharger l'extension dans Chrome
1. Aller sur `chrome://extensions/`
2. Cliquer sur le bouton "Recharger" (icône circulaire) sur l'extension Waler

### 3. Tester l'authentification
1. Ouvrir le popup de l'extension
2. Cliquer sur "Se connecter"
3. Une nouvelle page s'ouvre avec un spinner
4. L'authentification se fait automatiquement
5. La page se ferme après 2 secondes
6. Le popup affiche maintenant les statistiques

## Sécurité

- ✅ Token temporaire (expire après 5 minutes)
- ✅ Token à usage unique (supprimé après validation)
- ✅ Validation côté serveur obligatoire
- ✅ Authentification requise pour générer le token
- ✅ Token nettoyé de l'URL après capture

## Fichiers modifiés

1. `server/routes.ts` - Ajout de la route `/extension-auth`
2. `waler-extension/src/background/service-worker.ts` - Validation du token
3. Extension rebuild avec `npm run build`
