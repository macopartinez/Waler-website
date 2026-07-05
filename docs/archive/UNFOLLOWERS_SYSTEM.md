# 🎯 Système de Détection des Unfollowers

## 📊 Vue d'ensemble

Le système détecte et classifie automatiquement les unfollowers Instagram en 3 catégories :
- **Unfollowed** (👋) : Simple unfollow, profil toujours accessible
- **Blocked** (🚫) : L'utilisateur vous a bloqué
- **Deleted** (❌) : Le compte a été supprimé

## 🔄 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTENSION CHROME                         │
│  (Navigateur de l'utilisateur principal)                   │
│                                                             │
│  1. Détecte les unfollowers manquants                      │
│  2. Navigue vers chaque profil                             │
│  3. Classifie :                                            │
│     - Unfollowed (profil accessible)                       │
│     - Blocked (message "Vous ne pouvez pas accéder")       │
│     - Not Found (page introuvable) → Déclenche Agent B     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND NODE.JS                          │
│                                                             │
│  1. Reçoit les "Not Found" de l'extension                  │
│  2. Crée un fichier JSON de queue                          │
│  3. Lance Agent B (Python + Playwright)                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AGENT B (PYTHON)                         │
│  (Navigateur du compte Instagram secondaire)               │
│                                                             │
│  1. Charge les cookies Instagram du compte secondaire      │
│  2. Navigue vers chaque profil "Not Found"                 │
│  3. Classifie :                                            │
│     - Blocked (profil existe pour Agent B mais pas user)   │
│     - Deleted (page introuvable même pour Agent B)         │
│  4. Sauvegarde dans PostgreSQL                             │
│  5. Supprime la queue                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  BASE DE DONNÉES                            │
│                                                             │
│  Table: unfollowers                                         │
│  - id, user_id, username, avatar_url                       │
│  - status: 'unfollowed' | 'blocked' | 'deleted'            │
│  - detected_at, verified_at                                │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Classification Logique

### Extension (Navigateur Principal)
| Ce que voit l'extension | Classification | Action |
|------------------------|----------------|--------|
| Profil accessible | **Unfollowed** | Sauvegarde directement |
| "Vous ne pouvez pas accéder" | **Blocked** | Sauvegarde directement |
| "Page introuvable" | **Not Found** | → Déclenche Agent B |

### Agent B (Navigateur Secondaire)
| Ce que voit Agent B | Classification Finale | Raison |
|--------------------|----------------------|--------|
| "Page introuvable" | **Deleted** | Compte supprimé |
| "Vous ne pouvez pas accéder" | **Blocked** | Bloqué explicitement |
| Profil accessible | **BLOCKED** | User ne voit pas mais Agent B oui = Bloqué |

## 📡 Routes API

### 1. GET `/api/unfollowers`
Récupère les unfollowers simples (status = 'unfollowed')

**Response:**
```json
{
  "unfollowers": [
    {
      "id": 9,
      "username": "lone.filmofficiel",
      "avatar_url": null,
      "status": "unfollowed",
      "detected_at": "2026-05-31T06:17:13.000Z",
      "verified_at": null
    }
  ]
}
```

### 2. GET `/api/ghost-followers`
Récupère les ghost followers (status = 'blocked' OU 'deleted')

**Response:**
```json
{
  "ghostFollowers": [
    {
      "id": 8,
      "username": "josh.whistle.meme",
      "avatar_url": null,
      "status": "blocked",
      "detected_at": "2026-05-31T06:16:56.000Z",
      "verified_at": "2026-05-31T13:55:44.000Z"
    }
  ]
}
```

### 3. GET `/api/unfollowers/stats`
Récupère les statistiques globales

**Response:**
```json
{
  "unfollowed": 1,
  "blocked": 1,
  "deleted": 0,
  "ghost": 1,
  "total": 2
}
```

## 🎨 Affichage Dashboard

### Section "Unfollowers" (👋)
- Affiche uniquement `status = 'unfollowed'`
- Simple unfollow, pas de comportement suspect

### Section "Ghost Followers" (👻)
- Affiche `status = 'blocked'` ET `status = 'deleted'`
- Chaque compte affiche son type :
  - 🚫 **Blocked** : "Vous a bloqué"
  - ❌ **Deleted** : "Compte supprimé"

## 🚀 Utilisation

### 1. Lancer le serveur
```bash
npm run dev
```

### 2. Script de détection (Console Instagram)
```javascript
// Sur votre profil Instagram
(async function() {
  const missingFollowers = ['username1', 'username2'];
  const myUsername = window.location.href.match(/instagram\.com\/([^\/]+)/)[1];
  
  localStorage.setItem('unfollowerCheckState', JSON.stringify({
    currentIndex: 0,
    myUsername,
    missingFollowers,
    results: { unfollowed: [], blocked: [], notFoundOnInstagram: [] }
  }));
  
  window.location.href = `https://www.instagram.com/${missingFollowers[0]}/`;
})();
```

### 3. Déclencher Agent B manuellement
```javascript
window.postMessage({
  type: 'TRIGGER_AGENT_B_FROM_PAGE',
  data: { missingUsernames: ['username1'] }
}, '*');
```

### 4. Vérifier les données
```bash
node check-unfollowers.cjs
```

## 📦 Fichiers Importants

- `waler-extension/src/content/unfollower-detector.ts` - Extension Chrome
- `waler-extension/src/content/instagram-tracker.ts` - Listener postMessage
- `server/routes.ts` - Routes API (lignes 3181-3259)
- `agent_b.py` - Agent de vérification Python
- `shared/schema.ts` - Schéma de la table unfollowers

## 🔧 Configuration

### Variables d'environnement (.env)
```
AGENT_B_INSTAGRAM_USER=votre_compte_secondaire
AGENT_B_INSTAGRAM_PASS=votre_mot_de_passe
DATABASE_URL=postgresql://...
```

### Cookies Agent B
Fichier: `session-agent-b-{username}.json`
- Généré automatiquement après la première connexion
- Permet d'éviter de se reconnecter à chaque fois

## ✅ Tests

### Test des routes API
```bash
node test-unfollowers-api.cjs
```

### Test Agent B
```bash
# Créer un fichier de queue
echo '{"userId":21,"missingUsernames":["username"],"timestamp":"2026-05-31T20:00:00.000Z"}' > agent-b-queue-test.json

# Lancer Agent B
python agent_b.py
```

### Vérifier la base de données
```bash
node check-unfollowers.cjs
```

## 📊 Exemple de Résultats

```
═══════════════════════════════════════════════════════════════
📊 UNFOLLOWERS DANS LA BASE DE DONNÉES
═══════════════════════════════════════════════════════════════

Total: 2 unfollower(s)

1. 👋 @lone.filmofficiel
   ID: 9
   User ID: 21
   Status: unfollowed
   Détecté le: Sun May 31 2026 13:17:13 GMT+0700
   Vérifié le: N/A

2. 🚫 @josh.whistle.meme
   ID: 8
   User ID: 21
   Status: blocked
   Détecté le: Sun May 31 2026 13:16:56 GMT+0700
   Vérifié le: Sun May 31 2026 13:55:44 GMT+0700

═══════════════════════════════════════════════════════════════
```

## 🎯 Prochaines Étapes

1. ✅ Système de détection complet
2. ✅ Classification précise (unfollowed/blocked/deleted)
3. ✅ Routes API pour le dashboard
4. ⏳ Intégration frontend pour afficher les données
5. ⏳ Notifications en temps réel
6. ⏳ Export des données (CSV, JSON)
