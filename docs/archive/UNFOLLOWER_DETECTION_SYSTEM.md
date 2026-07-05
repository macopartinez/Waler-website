# Système de Détection Intelligent des Unfollowers

## Vue d'ensemble

Système automatisé de détection et classification des unfollowers avec analyse approfondie :
- **Désabonnement simple** : Profil trouvé et normal
- **Blocage** : Profil vide (0 publications, 0 abonnés, avatar par défaut) OU trouvé sur Google mais pas sur Instagram
- **Compte supprimé** : Non trouvé sur Instagram ni sur Google

## Architecture

### Extension Waler (Frontend)
- Détection automatique des baisses de followers
- Notification dans le popup
- Scan complet manuel via bouton
- Recherche automatique dans Instagram (10-15s entre chaque)
- Analyse des profils pour détecter les blocages
- Envoi des résultats au backend

### Agent B (Backend)
- Recherche Google pour les comptes non trouvés sur Instagram
- Classification finale : blocked vs deleted
- Sauvegarde dans la base de données

## Flux de Travail

### 1. Détection de la Baisse
- `instagram-tracker.ts` détecte une baisse de followers
- Envoie une notification au service worker
- Stocke `unfollowerDetected: true` dans le storage
- Affiche le badge `-X` sur l'icône de l'extension

### 2. Affichage dans le Popup
- Alerte rouge "⚠️ Unfollowers détectés"
- Bouton "🔍 Analyser les unfollowers"
- Instructions pour l'utilisateur

### 3. Lancement de l'Analyse (Manuel)
- Utilisateur clique sur le bouton
- Vérifie que le modal followers est ouvert
- Lance le scan complet avec `InstagramModalScroller`
- Compare avec la base de données pour trouver les IDs manquants

### 4. Recherche Instagram Automatique
Pour chaque ID manquant :
1. Ouvre la barre de recherche Instagram
2. Tape le username (80-150ms par caractère)
3. Attend les résultats (2-3 secondes)
4. Si trouvé :
   - Visite le profil
   - Analyse les stats (posts, followers, following, avatar)
   - Classifie : blocked (profil vide) ou unfollowed (profil normal)
   - **Supprime automatiquement l'historique de recherche** 🗑️
5. Si non trouvé :
   - Ajoute à la liste `notFoundOnInstagram[]`
   - **Supprime automatiquement l'historique de recherche** 🗑️
6. Délai de 10-15 secondes avant la recherche suivante
7. Pause de 5 minutes après 10 recherches

### 5. Envoi au Backend
- Unfollows et blocages détectés → Sauvegardés directement
- IDs non trouvés → Envoyés à l'Agent B via `/api/extension/verify-missing-followers`

### 6. Vérification Google (Agent B)
- Récupère l'Event avec `needsCheckB: true`
- Pour chaque username :
  - Recherche `site:instagram.com {username}` sur Google
  - Si trouvé → `blocked` (compte existe mais invisible)
  - Si non trouvé → `deleted` (compte supprimé)
- Sauvegarde dans `UnfollowList` avec le bon type

## Fichiers Créés

### Extension
- `waler-extension/src/content/unfollower-detector.ts` - Orchestrateur principal
- `waler-extension/src/content/instagram-search-automator.ts` - Automatisation de la recherche
- `waler-extension/src/content/profile-analyzer.ts` - Analyse des profils

### Backend
- Route `/api/extension/verify-missing-followers` dans `server/routes.ts`
- Fonction `verify_missing_via_google()` dans `agent_b.py`

### UI
- Alerte dans `waler-extension/src/popup/index.html`
- Handler dans `waler-extension/src/popup/popup-chrome.ts`

## Fichiers Modifiés

### Extension
- `waler-extension/src/content/instagram-tracker.ts`
  - Import de `UnfollowerDetector`
  - Méthode `startUnfollowerAnalysis()`
  - Modification de `handleUnfollowers()` pour notification
  - Listener pour `START_UNFOLLOWER_ANALYSIS`

- `waler-extension/src/background/service-worker.ts`
  - Handler `SEND_UNFOLLOWER_RESULTS`
  - Handler `UNFOLLOWER_ANALYSIS_PROGRESS`

### Backend
- `server/routes.ts`
  - Route POST `/api/extension/verify-missing-followers`

- `agent_b.py`
  - Fonction `search_username_on_google()`
  - Fonction `verify_missing_via_google()`
  - Logique de traitement des Events `unfollower_verification`

## Sécurité et Discrétion

### Délais Naturels
- **Entre recherches** : 10-15 secondes (variation aléatoire ±30%)
- **Saisie de texte** : 80-150ms par caractère
- **Attente résultats** : 2-3 secondes
- **Visite de profil** : 3-5 secondes avant extraction
- **Pause longue** : 5 minutes après 10 recherches

### Nettoyage Automatique 🗑️
- **Suppression de l'historique de recherche** après chaque vérification
- Aucune trace laissée dans l'historique Instagram
- Fonctionne même en cas d'erreur ou de profil non trouvé
- Méthodes multiples pour détecter et supprimer les entrées d'historique

### Limites de Sécurité
- Maximum 20 recherches par session
- Arrêt automatique si erreur Instagram
- Pauses aléatoires occasionnelles (5% de chance, 500-1500ms)

## Utilisation

### 1. Première Utilisation
```bash
# Lancer le scan initial pour créer la base de données
1. Ouvrir Instagram
2. Aller sur son profil
3. Cliquer sur l'icône Waler
4. Cliquer sur "🔍 Lancer le scan initial"
```

### 2. Détection d'Unfollowers
```bash
# Quand une baisse est détectée
1. L'extension affiche une notification
2. Ouvrir le popup Waler
3. Voir l'alerte "⚠️ Unfollowers détectés"
4. Ouvrir le modal followers sur Instagram
5. Cliquer sur "🔍 Analyser les unfollowers"
6. Attendre la fin de l'analyse (peut prendre plusieurs minutes)
```

### 3. Résultats
```bash
# L'overlay affiche :
- X unfollows (désabonnements simples)
- Y blocages (profils vides)
- Z en vérification Google (via Agent B)

# Les résultats sont automatiquement :
- Sauvegardés dans la base de données
- Synchronisés avec le backend
- Disponibles dans le dashboard Waler
```

## Logs et Debugging

### Extension (Console)
```javascript
// Activer les logs détaillés
console.log('🔍 Searching for @username...')
console.log('✅ @username found and opened')
console.log('🚫 @username classified as BLOCKED')
console.log('👋 @username classified as UNFOLLOWED')
console.log('❌ @username not found on Instagram')
console.log('🗑️ Cleaning up search history for @username...')
console.log('🗑️ Clearing search history for @username...')
console.log('🗑️ Removing @username from search history...')
console.log('✅ Search history cleared for @username')
```

### Agent B (Terminal)
```python
# Logs de recherche Google
log.info(f"Recherche Google: site:instagram.com {username}")
log.info(f"@{username} trouvé sur Google (compte existe)")
log.info(f"@{username} : Bloqué (trouvé sur Google mais pas sur Instagram)")
log.info(f"@{username} : Compte supprimé (non trouvé nulle part)")
```

## Tests

### Test de Détection
```bash
# Simuler une baisse de followers
1. Modifier manuellement lastFollowerCount dans chrome.storage.local
2. Recharger la page Instagram
3. Vérifier que la notification apparaît
```

### Test de Recherche
```bash
# Tester la recherche automatique
1. Créer une liste de test avec des usernames connus
2. Lancer l'analyse
3. Vérifier les logs dans la console
4. Vérifier que les délais sont respectés
```

### Test de Classification
```bash
# Tester la classification
1. Tester avec un compte normal → unfollowed
2. Tester avec un compte vide → blocked
3. Tester avec un compte inexistant → notFoundOnInstagram
```

## Troubleshooting

### "Search bar not found"
- Vérifier que vous êtes sur la page d'accueil Instagram
- Attendre quelques secondes que la page charge
- Recharger la page si nécessaire

### "Profile load timeout"
- Augmenter `waitForLoadTimeout` dans `ProfileAnalyzer`
- Vérifier la connexion Internet

### "Limit reached"
- Attendre 5 minutes avant de relancer
- Ou augmenter `maxSearches` dans `UnfollowerDetector`

### Agent B ne trouve pas les comptes
- Vérifier que Playwright est installé
- Vérifier la connexion Internet
- Vérifier les logs dans le terminal

## Performance

### Temps Estimés
- **Scan complet** : 2-5 minutes (selon le nombre de followers)
- **Recherche Instagram** : 10-15 secondes par username
- **Analyse de profil** : 3-5 secondes par profil
- **Recherche Google** : 2-4 secondes par username

### Exemple
Pour 10 unfollowers :
- Scan complet : ~3 minutes
- Recherche Instagram : ~2 minutes (10 × 12s)
- Analyse profils : ~40 secondes (10 × 4s)
- **Total** : ~6 minutes

## Base de Données

### Table `UnfollowList`
```sql
CREATE TABLE "UnfollowList" (
  id SERIAL PRIMARY KEY,
  "clientId" INTEGER NOT NULL,
  "followerUsername" TEXT NOT NULL,
  "followerUserId" TEXT,
  "unfollowType" TEXT NOT NULL, -- 'unfollow' | 'blocked' | 'deleted'
  "detectedAt" TIMESTAMP NOT NULL,
  "verifiedByAgent" BOOLEAN DEFAULT false,
  "eventId" TEXT
);
```

### Table `Event`
```sql
CREATE TABLE "Event" (
  id SERIAL PRIMARY KEY,
  "clientId" INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'unfollower_verification'
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'completed'
  "needsCheckB" BOOLEAN DEFAULT false,
  metadata JSONB, -- { missingUsernames: string[] }
  "createdAt" TIMESTAMP NOT NULL
);
```

## Améliorations Futures

- [ ] Support de la recherche par batch (plusieurs usernames en parallèle)
- [ ] Cache des résultats de recherche Google
- [ ] Détection des comptes privés vs blocages
- [ ] Historique des unfollows avec graphiques
- [ ] Notifications push pour les unfollows importants
- [ ] Export CSV des résultats
