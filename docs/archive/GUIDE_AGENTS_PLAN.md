# 🚀 Guide Rapide - Agents et Changements de Plan

## ✅ Ce qui a été implémenté

Quand un client passe de **Pro à Premium**, les agents Pro sont **automatiquement mis en pause** et reprennent **automatiquement** quand il revient à Pro.

---

## 🎯 Comportement Automatique

### Downgrade Pro → Premium

```
Utilisateur sur Pro
   ↓
Agents actifs: [follow, prospects, connections, clients]
   ↓
Downgrade vers Premium
   ↓
⏸️ PAUSE automatique: [prospects, connections, clients]
✅ RESTE actif: [follow]
   ↓
Message: "3 agents Pro mis en pause. Ils reprendront 
         automatiquement lors du retour au plan Pro."
```

### Upgrade Premium → Pro

```
Utilisateur sur Premium
   ↓
Agents en pause: [prospects, connections, clients]
   ↓
Upgrade vers Pro
   ↓
▶️ REPRISE automatique: [prospects, connections, clients]
   ↓
Message: "3 agents Pro réactivés. Ils vont reprendre leur travail."
```

---

## 📁 Fichiers Créés

| Fichier | Description |
|---------|-------------|
| `shared/schema.ts` | Table `agent_states` ajoutée |
| `server/agent-manager.ts` | Service de gestion des agents |
| `server/agent-wrapper.ts` | Wrapper pour vérifier les permissions |
| `server/plan-migration.ts` | Mis à jour avec gestion des agents |
| `AGENT_PAUSE_RESUME_SYSTEM.md` | Documentation complète |

---

## 🔧 Utilisation dans le Code

### Wrapper Automatique (Recommandé)

```typescript
import { withAgentCheck } from './server/agent-wrapper';

// Avant (sans vérification)
export async function runProspectsAgent(userId: number) {
  return analyzeNewFollowers(userId);
}

// Après (avec vérification automatique)
export async function runProspectsAgent(userId: number) {
  return withAgentCheck(userId, 'prospects', async () => {
    return analyzeNewFollowers(userId);
  });
}
```

Le wrapper vérifie automatiquement:
- ✅ Le plan permet cet agent
- ✅ L'agent n'est pas en pause
- ✅ L'agent n'est pas arrêté
- ✅ Met à jour `last_run_at`

### Vérification Manuelle

```typescript
import { canAgentRun } from './server/agent-manager';

const check = await canAgentRun(userId, 'prospects');

if (!check.allowed) {
  return { error: check.reason };
}

// Exécuter l'agent
await runProspectsLogic();
```

---

## 📊 Agents par Plan

### Plan Premium
- ✅ Agent Follow (unfollowers/followers)

### Plan Pro (Premium +)
- ✅ Agent Follow
- ✅ Agent Prospects (nouveaux followers)
- ✅ Agent Connections (qualité relations)
- ✅ Agent Clients (CRM)

---

## 🗄️ Base de Données

### Nouvelle Table: `agent_states`

```sql
CREATE TABLE agent_states (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  agent_type TEXT NOT NULL, -- 'follow', 'prospects', 'connections', 'clients'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'stopped'
  paused_at TIMESTAMP,
  pause_reason TEXT, -- 'plan_downgrade', 'manual', 'error'
  last_run_at TIMESTAMP,
  metadata JSON,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Requêtes Utiles

```sql
-- Voir l'état des agents d'un utilisateur
SELECT * FROM agent_states WHERE user_id = 15;

-- Voir les agents en pause
SELECT * FROM agent_states WHERE status = 'paused';

-- Voir les agents Pro
SELECT * FROM agent_states 
WHERE agent_type IN ('prospects', 'connections', 'clients');
```

---

## 🔄 Flux Complet

### Scénario: Client teste Pro puis revient à Premium

```
Jour 1: Client sur Premium
  → Agent Follow actif

Jour 2: Upgrade vers Pro
  → Agent Follow actif
  → Agents Prospects, Connections, Clients ACTIVÉS

Jour 3: Client utilise les agents Pro
  → Tous les agents collectent des données

Jour 4: Downgrade vers Premium
  → Agent Follow actif
  → Agents Prospects, Connections, Clients MIS EN PAUSE
  → ✅ Toutes les données collectées sont préservées

Jour 5: Client se rend compte qu'il a besoin de Pro
  → Upgrade vers Pro
  → Agent Follow actif
  → Agents Prospects, Connections, Clients RÉACTIVÉS
  → ✅ Les agents reprennent là où ils s'étaient arrêtés
```

---

## 🎨 Interface Utilisateur

### Afficher le Statut des Agents

```typescript
// API endpoint
app.get("/api/agents/status", requireAuth, async (req, res) => {
  const userId = getCurrentUser(req);
  const agents = await getAllAgentStates(userId);
  
  res.json({ agents });
});

// Frontend
const { agents } = await fetch('/api/agents/status').then(r => r.json());

// Afficher
agents.forEach(agent => {
  console.log(`${agent.agentType}: ${agent.status}`);
  if (agent.status === 'paused') {
    console.log(`  Raison: ${agent.pauseReason}`);
  }
});
```

### Badge de Statut

```tsx
{agent.status === 'paused' && (
  <Badge variant="warning">
    En pause - Passez au plan Pro pour réactiver
  </Badge>
)}
```

---

## 🧪 Tester

### Test Manuel

```bash
# 1. Créer un utilisateur Pro
npx tsx set_premium_postgres.ts

# 2. Vérifier les agents (tous actifs)
SELECT * FROM agent_states WHERE user_id = 15;

# 3. Downgrade vers Premium
# Les agents Pro passent en pause

# 4. Upgrade vers Pro
# Les agents Pro redeviennent actifs
```

---

## ⚠️ Points Importants

### 1. Données Toujours Préservées

```
Downgrade Pro → Premium
  ↓
Agents Pro en pause
  ↓
✅ Données collectées PRÉSERVÉES
✅ Configuration PRÉSERVÉE
✅ Historique PRÉSERVÉ
```

### 2. Reprise Automatique

```
Upgrade Premium → Pro
  ↓
Agents Pro réactivés
  ↓
✅ Reprennent automatiquement
✅ Configuration restaurée
✅ Pas besoin de reconfigurer
```

### 3. Pause vs Arrêt

| Statut | Quand | Réactivation |
|--------|-------|--------------|
| `paused` | Downgrade plan | Automatique lors upgrade |
| `stopped` | Annulation | Manuelle lors réactivation |

---

## 📞 Messages Utilisateur

### Downgrade Pro → Premium

```
✅ Plan changé avec succès de pro vers premium.
   Toutes vos données ont été préservées.

⚠️ 3 agents Pro mis en pause. Ils reprendront 
   automatiquement lors du retour au plan Pro.

Agents affectés:
  - Agent Prospects
  - Agent Connections  
  - Agent Clients
```

### Upgrade Premium → Pro

```
✅ Plan changé avec succès de premium vers pro.
   Toutes vos données ont été préservées.

✅ 3 agents Pro réactivés. Ils vont reprendre leur travail.

Agents réactivés:
  - Agent Prospects
  - Agent Connections
  - Agent Clients
```

---

## 🔐 Sécurité

### Vérification Obligatoire

Chaque agent Pro DOIT utiliser le wrapper:

```typescript
// ❌ DANGEREUX - Pas de vérification
export async function runProspectsAgent(userId: number) {
  return analyzeNewFollowers(userId);
}

// ✅ SÉCURISÉ - Avec vérification
export async function runProspectsAgent(userId: number) {
  return withAgentCheck(userId, 'prospects', async () => {
    return analyzeNewFollowers(userId);
  });
}
```

Si un utilisateur Premium essaie d'exécuter un agent Pro:

```
Error: Agent prospects is not available: 
L'agent prospects nécessite le plan Pro
```

---

## 📊 Résumé

| Changement de Plan | Agents Affectés | Action | Données |
|-------------------|----------------|--------|---------|
| Pro → Premium | Prospects, Connections, Clients | ⏸️ Pause | ✅ Préservées |
| Premium → Pro | Prospects, Connections, Clients | ▶️ Reprise | ✅ Préservées |
| Annulation | Tous | ⏹️ Arrêt | ✅ Préservées |

---

## 🎉 Avantages

1. **Automatique** - Pas d'intervention manuelle
2. **Sécurisé** - Impossible d'exécuter un agent sans le bon plan
3. **Préservation** - Toutes les données et configurations préservées
4. **Transparent** - Messages clairs pour l'utilisateur
5. **Réversible** - Retour à Pro = agents réactivés automatiquement

**Les agents s'adaptent automatiquement au plan du client !** 🚀
