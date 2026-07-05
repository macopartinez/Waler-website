# 🧪 Guide de Test - Waler Extension

Guide complet pour tester l'extension Chrome de surveillance Instagram.

## 📋 Prérequis

- ✅ Chrome ou Edge (navigateur Chromium)
- ✅ Node.js installé
- ✅ Compte Instagram actif
- ✅ Backend Waler lancé

## 🚀 Étape 1 : Build de l'Extension

### 1.1 Installer les dépendances

```bash
cd waler-extension
npm install
```

### 1.2 Build l'extension

```bash
npm run build
```

Cela va créer un dossier `dist/` avec l'extension compilée.

### 1.3 Vérifier le build

```bash
# Le dossier dist/ doit contenir :
dist/
  ├── manifest.json
  ├── background.js
  ├── content.js
  ├── popup.html
  ├── popup.js
  └── icons/
```

## 🔧 Étape 2 : Charger l'Extension dans Chrome

### 2.1 Ouvrir la page des extensions

1. Ouvrir Chrome/Edge
2. Aller à `chrome://extensions/` (ou `edge://extensions/`)
3. Activer le **Mode développeur** (toggle en haut à droite)

### 2.2 Charger l'extension

1. Cliquer sur **"Charger l'extension non empaquetée"**
2. Sélectionner le dossier `waler-extension/dist/`
3. L'extension apparaît dans la liste

### 2.3 Épingler l'extension

1. Cliquer sur l'icône puzzle 🧩 dans la barre Chrome
2. Trouver "Waler Extension"
3. Cliquer sur l'icône épingle 📌

## 🎯 Étape 3 : Configuration Initiale

### 3.1 Lancer le backend

```bash
# Dans le dossier Waler
npm run dev
```

Le backend doit être accessible sur `http://localhost:5000`

### 3.2 Créer un compte utilisateur

1. Aller sur `http://localhost:5000`
2. S'inscrire avec email/mot de passe
3. Se connecter

### 3.3 Initialiser la base de données

```bash
# Créer les tables de surveillance
npm run init-classification-db
```

## 📱 Étape 4 : Tester l'Extension

### 4.1 Se connecter à Instagram

1. Ouvrir un nouvel onglet
2. Aller sur `https://www.instagram.com`
3. Se connecter avec votre compte Instagram

### 4.2 Ouvrir le popup de l'extension

1. Cliquer sur l'icône Waler dans la barre Chrome
2. Le popup s'ouvre avec les stats

**Ce que vous devriez voir** :
```
┌─────────────────────────────┐
│   Waler Extension           │
├─────────────────────────────┤
│ 👥 Followers: 0             │
│ 📉 Unfollowers: 0           │
│ 🚫 Blockers: 0              │
│ 💬 DMs: 0                   │
├─────────────────────────────┤
│ [Synchroniser maintenant]   │
│ [Ouvrir Dashboard]          │
└─────────────────────────────┘
```

### 4.3 Tester la collecte de données

#### Test 1 : Followers/Following

1. Sur Instagram, aller sur votre profil
2. Cliquer sur "Abonnements" ou "Abonnés"
3. L'extension intercepte automatiquement les données
4. Ouvrir le popup → Les chiffres se mettent à jour

#### Test 2 : Messages DM

1. Sur Instagram, aller dans les Messages (DM)
2. Ouvrir une conversation
3. Envoyer/recevoir un message
4. L'extension intercepte le message
5. Vérifier dans le popup : "💬 DMs: 1"

#### Test 3 : Synchronisation manuelle

1. Cliquer sur "Synchroniser maintenant" dans le popup
2. Attendre 2-3 secondes
3. Un message de confirmation apparaît
4. Les données sont envoyées au backend

### 4.4 Vérifier dans le Dashboard

1. Cliquer sur "Ouvrir Dashboard" dans le popup
2. Vous êtes redirigé vers `http://localhost:5000`
3. Aller dans la section "Classification"
4. Vous devriez voir vos contacts et DMs

## 🔍 Étape 5 : Tests Avancés

### 5.1 Tester la Surveillance Différenciée

#### Synchroniser avec la classification

1. Aller sur `http://localhost:5000/classification`
2. Vérifier que des contacts ont des scores
3. Aller sur `http://localhost:5000/surveillance`
4. Cliquer sur "Synchroniser"
5. Les contacts sont configurés avec des fréquences différentes

**Vérification** :
- Clients VIP : vérifiés toutes les 15min
- Prospects : vérifiés toutes les heures
- Network : vérifiés toutes les 4h
- Leads : vérifiés une fois par jour

### 5.2 Tester les Alertes

1. Interagir beaucoup avec un contact (10+ messages)
2. Attendre la prochaine vérification
3. Une alerte devrait apparaître dans `/surveillance`
4. L'alerte indique "Activité inhabituelle"

### 5.3 Tester le Mode Hors Ligne

1. Ouvrir les DevTools (F12)
2. Aller dans l'onglet "Network"
3. Cocher "Offline"
4. Envoyer un message sur Instagram
5. L'extension met l'action en queue
6. Décocher "Offline"
7. L'action est synchronisée automatiquement

### 5.4 Tester l'Encryption

1. Ouvrir les DevTools (F12)
2. Aller dans "Application" → "Local Storage"
3. Chercher les clés commençant par `dm_`
4. Les valeurs doivent être chiffrées (base64 illisible)

### 5.5 Tester le Consentement RGPD

1. Ouvrir Instagram pour la première fois
2. Un dialog de consentement apparaît
3. Lire les informations
4. Accepter ou refuser
5. Si refusé : aucune collecte
6. Si accepté : collecte activée

## 🐛 Débogage

### Voir les logs de l'extension

#### Console du Content Script

1. Sur Instagram, ouvrir DevTools (F12)
2. Onglet "Console"
3. Filtrer par "Waler" ou "DM"

**Logs attendus** :
```
🚀 Waler Extension initialized
📡 Starting DM interception...
✅ DM intercepted: @username
🔐 DM encrypted and stored
📤 Syncing 5 messages to backend...
✅ Sync completed
```

#### Console du Service Worker

1. Aller sur `chrome://extensions/`
2. Trouver "Waler Extension"
3. Cliquer sur "Service Worker"
4. Une console s'ouvre

**Logs attendus** :
```
⏰ Alarm triggered: sync
🔄 Starting sync...
📊 Synced 10 followers, 2 unfollowers
✅ Sync completed in 1.2s
```

#### Console du Popup

1. Ouvrir le popup
2. Clic droit → "Inspecter"
3. Une console s'ouvre

### Erreurs Courantes

#### ❌ "Failed to fetch"

**Cause** : Backend non lancé

**Solution** :
```bash
cd Waler
npm run dev
```

#### ❌ "Authentication failed"

**Cause** : Non connecté au backend

**Solution** :
1. Aller sur `http://localhost:5000`
2. Se connecter
3. Recharger l'extension

#### ❌ "Extension context invalidated"

**Cause** : Extension rechargée pendant l'utilisation

**Solution** :
1. Recharger la page Instagram (F5)
2. Recharger l'extension dans `chrome://extensions/`

#### ❌ Messages non interceptés

**Cause** : Instagram a changé son API

**Solution** :
1. Vérifier les logs console
2. Mettre à jour les sélecteurs DOM dans `dm-interceptor.ts`

## 📊 Vérification des Données

### Dans la Base de Données

```bash
# Ouvrir la BDD SQLite
sqlite3 server/waler.db

# Vérifier les DMs
SELECT COUNT(*) FROM dm_messages;

# Vérifier les conversations
SELECT * FROM dm_conversations LIMIT 5;

# Vérifier les scores
SELECT contact_username, total_score, current_category 
FROM contact_scores 
ORDER BY total_score DESC 
LIMIT 10;

# Vérifier la surveillance
SELECT contact_username, category, check_interval, next_check_at
FROM surveillance_config;
```

### Via l'API

```bash
# Tester l'API avec curl

# Get DM stats
curl http://localhost:5000/api/extension/dm-stats \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Get suggestions
curl http://localhost:5000/api/classification/suggestions \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Get surveillance config
curl http://localhost:5000/api/surveillance/config \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

## 🎯 Checklist de Test Complet

### Fonctionnalités de Base
- [ ] Extension se charge sans erreur
- [ ] Popup s'ouvre et affiche les stats
- [ ] Collecte des followers/following
- [ ] Collecte des DMs
- [ ] Synchronisation manuelle fonctionne
- [ ] Synchronisation auto (toutes les 5min)

### Sécurité & Privacy
- [ ] Dialog de consentement apparaît
- [ ] DMs sont chiffrés dans localStorage
- [ ] Paramètres de confidentialité fonctionnent
- [ ] Export des données fonctionne
- [ ] Suppression des données fonctionne

### Classification
- [ ] Scores calculés correctement
- [ ] Suggestions générées
- [ ] Validation des suggestions fonctionne
- [ ] Historique enregistré

### Surveillance
- [ ] Synchronisation avec classification
- [ ] Fréquences différenciées par catégorie
- [ ] Alertes générées automatiquement
- [ ] Dashboard de surveillance affiche les données

### Gestion d'Erreurs
- [ ] Mode hors ligne fonctionne
- [ ] Queue de synchronisation
- [ ] Retry automatique en cas d'erreur
- [ ] Toasts d'erreur affichés

## 🚀 Tests de Performance

### Charge de Données

```javascript
// Dans la console Instagram
// Simuler 100 DMs
for (let i = 0; i < 100; i++) {
  console.log(`Simulating DM ${i}`);
  // Envoyer des messages
}

// Vérifier que l'extension gère bien
```

### Mémoire

1. Ouvrir Chrome Task Manager (Shift+Esc)
2. Trouver "Waler Extension"
3. Vérifier l'utilisation mémoire (< 50 MB normal)

### Réseau

1. Ouvrir DevTools → Network
2. Filtrer par "localhost:5000"
3. Vérifier les requêtes de sync
4. Temps de réponse < 500ms

## 📝 Rapporter un Bug

Si vous trouvez un bug :

1. **Collecter les informations** :
   - Version de Chrome
   - Logs console (content script + service worker)
   - Étapes pour reproduire
   - Captures d'écran

2. **Vérifier** :
   - Backend lancé ?
   - Extension à jour ?
   - Base de données initialisée ?

3. **Créer un rapport** avec :
   ```
   **Bug** : Description courte
   
   **Étapes** :
   1. Faire X
   2. Faire Y
   3. Observer Z
   
   **Attendu** : Ce qui devrait se passer
   
   **Observé** : Ce qui se passe réellement
   
   **Logs** :
   ```
   [Coller les logs]
   ```
   ```

## 🎉 Félicitations !

Si tous les tests passent, l'extension est **100% fonctionnelle** ! 🚀

Vous pouvez maintenant :
- Collecter vos DMs Instagram automatiquement
- Classifier vos contacts intelligemment
- Surveiller vos VIP avec des fréquences adaptées
- Recevoir des alertes en temps réel
- Gérer vos données en toute sécurité

**Prochaines étapes** :
1. Utiliser l'extension au quotidien
2. Analyser les insights dans le dashboard
3. Optimiser vos catégories de contacts
4. Profiter de la surveillance automatique ! 🎯
