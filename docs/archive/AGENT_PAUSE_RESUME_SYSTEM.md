# 🤖 Système de Pause/Reprise des Agents

## 🎯 Objectif

Lors d'un changement de plan (Pro ↔ Premium), les agents spécifiques au plan Pro sont automatiquement **mis en pause** ou **réactivés** pour éviter une utilisation non autorisée tout en préservant leur configuration.

---

## 📊 Agents par Plan

### Agents Disponibles pour Tous les Plans

- ✅ **Agent Follow** - Détection des unfollowers/followers

### Agents Réservés au Plan Pro

- 🔒 **Agent Prospects** - Analyse des nouveaux followers
- 🔒 **Agent Connections** - Analyse de la qualité des relations
- 🔒 **Agent Clients** - Gestion des clients (CRM)

---

## 🔄 Comportement lors des Changements de Plan

### 1. Downgrade Pro → Premium

```
Plan Pro actif
   ↓
Agents Pro actifs: [prospects, connections, clients]
   ↓
Downgrade vers Premium
   ↓
⏸️ PAUSE automatique des agents Pro
   ↓
Agents Pro en pause: [prospects, connections, clients]
   ↓
✅ Configuration et données préservées
```

**Ce qui se passe:**
- Les agents Pro sont mis en pause avec le statut `paused`
- La raison est enregistrée: `plan_downgrade`
- La configuration de chaque agent est préservée
- Les données collectées restent accessibles
- L'utilisateur est informé par un warning

**Message affiché:**
```
"3 agents Pro mis en pause. Ils reprendront automatiquement 
lors du retour au plan Pro."
```

### 2. Upgrade Premium → Pro

```
Plan Premium actif
   ↓
Agents Pro en pause: [prospects, connections, clients]
   ↓
Upgrade vers Pro
   ↓
▶️ REPRISE automatique des agents Pro
   ↓
Agents Pro actifs: [prospects, connections, clients]
   ↓
✅ Les agents reprennent leur travail
```

**Ce qui se passe:**
- Les agents Pro en pause sont réactivés
- Le statut passe de `paused` à `active`
- Les agents reprennent là où ils s'étaient arrêtés
- La configuration est restaurée
- L'utilisateur est informé

**Message affiché:**
```
"3 agents Pro réactivés. Ils vont reprendre leur travail."
```

### 3. Annulation d'Abonnement

```
Plan actif (Premium ou Pro)
   ↓
Annulation
   ↓
⏹️ ARRÊT de tous les agents
   ↓
Agents arrêtés: [follow, prospects, connections, clients]
   ↓
✅ Données préservées, agents arrêtés
```

**Ce qui se passe:**
- TOUS les agents sont arrêtés (statut `stopped`)
- Les données restent accessibles
- Réactivation possible en renouvelant l'abonnement

---

## 🗄️ Architecture Technique

### Table `agent_states`

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

### Service `agent-manager.ts`

Fonctions principales:

```typescript
// Mettre en pause les agents Pro
pauseProAgents(userId, reason) 
  → { paused: ['prospects', 'connections', 'clients'], message: '...' }

// Réactiver les agents Pro
resumeProAgents(userId)
  → { resumed: ['prospects', 'connections', 'clients'], message: '...' }

// Arrêter tous les agents
stopAllAgents(userId, reason)
  → { stopped: ['follow', 'prospects', 'connections', 'clients'], message: '...' }

// Vérifier si un agent peut s'exécuter
canAgentRun(userId, agentType)
  → { allowed: true/false, reason?: '...' }
```

---

## 💻 Utilisation dans le Code

### Wrapper Automatique pour les Agents

```typescript
import { withAgentCheck } from './agent-wrapper';

// Agent Prospects (Pro only)
export async function runProspectsAgent(userId: number) {
  return withAgentCheck(userId, 'prospects', async () => {
    // Logique de l'agent
    const prospects = await analyzeNewFollowers(userId);
    return prospects;
  });
}
```

Le wrapper vérifie automatiquement:
1. ✅ Le plan de l'utilisateur permet cet agent
2. ✅ L'agent n'est pas en pause
3. ✅ L'agent n'est pas arrêté
4. ✅ Met à jour `last_run_at` après l'exécution

### Vérification Manuelle

```typescript
import { canAgentRun } from './agent-manager';

const check = await canAgentRun(userId, 'prospects');

if (!check.allowed) {
  console.log(`Agent bloqué: ${check.reason}`);
  // Afficher un message à l'utilisateur
  return;
}

// Exécuter l'agent
await runProspectsLogic();
```

---

## 🔄 Intégration avec le Changement de Plan

Le service de migration (`plan-migration.ts`) gère automatiquement les agents:

```typescript
// Dans changePlan()

// Downgrade Pro → Premium
if (previousPlan === 'pro' && newPlan === 'premium') {
  const result = await pauseProAgents(userId, 'plan_downgrade');
  warnings.push(result.message);
  agentsAffected.paused = result.paused;
}

// Upgrade Premium → Pro
if (previousPlan === 'premium' && newPlan === 'pro') {
  const result = await resumeProAgents(userId);
  warnings.push(result.message);
  agentsAffected.resumed = result.resumed;
}
```

---

## 📝 Logs et Traçabilité

### Logs Console

```
⏸️ Paused Pro agents for user 15: ['prospects', 'connections', 'clients']
▶️ Resumed Pro agents for user 15: ['prospects', 'connections', 'clients']
⏹️ Stopped all agents for user 15: ['follow', 'prospects', 'connections', 'clients']
```

### Métadonnées Enregistrées

```json
{
  "pausedByPlanChange": true,
  "previousStatus": "active",
  "pausedAt": "2026-04-28T10:30:00Z",
  "resumedAt": "2026-05-15T14:20:00Z"
}
```

---

## 🧪 Tests

### Test de Downgrade

```typescript
// 1. Utilisateur sur Pro avec agents actifs
const user = await getUserById(userId);
assert(user.subscriptionTier === 'pro');

const agentsBefore = await getAllAgentStates(userId);
assert(agentsBefore.every(a => a.status === 'active'));

// 2. Downgrade vers Premium
await changePlan(userId, premiumPlanId);

// 3. Vérifier que les agents Pro sont en pause
const agentsAfter = await getAllAgentStates(userId);
const proAgents = agentsAfter.filter(a => 
  ['prospects', 'connections', 'clients'].includes(a.agentType)
);
assert(proAgents.every(a => a.status === 'paused'));
assert(proAgents.every(a => a.pauseReason === 'plan_downgrade'));
```

### Test de Upgrade

```typescript
// 1. Utilisateur sur Premium avec agents Pro en pause
const agentsBefore = await getAllAgentStates(userId);
const proAgentsBefore = agentsBefore.filter(a => 
  ['prospects', 'connections', 'clients'].includes(a.agentType)
);
assert(proAgentsBefore.every(a => a.status === 'paused'));

// 2. Upgrade vers Pro
await changePlan(userId, proPlanId);

// 3. Vérifier que les agents Pro sont réactivés
const agentsAfter = await getAllAgentStates(userId);
const proAgentsAfter = agentsAfter.filter(a => 
  ['prospects', 'connections', 'clients'].includes(a.agentType)
);
assert(proAgentsAfter.every(a => a.status === 'active'));
```

---

## 🎨 Interface Utilisateur

### Afficher le Statut des Agents

```typescript
// API endpoint
app.get("/api/agents/status", requireAuth, async (req, res) => {
  const userId = getCurrentUser(req);
  const agents = await getAllAgentStates(userId);
  
  res.json({
    agents: agents.map(a => ({
      type: a.agentType,
      status: a.status,
      lastRun: a.lastRunAt,
      pauseReason: a.pauseReason,
    }))
  });
});

// Frontend
const { agents } = await fetch('/api/agents/status').then(r => r.json());

agents.forEach(agent => {
  if (agent.status === 'paused') {
    showWarning(`Agent ${agent.type} en pause: ${agent.pauseReason}`);
  }
});
```

### Badge de Statut

```tsx
function AgentStatusBadge({ agent }) {
  if (agent.status === 'active') {
    return <Badge variant="success">Actif</Badge>;
  }
  
  if (agent.status === 'paused') {
    return (
      <Badge variant="warning">
        En pause
        <Tooltip>
          {agent.pauseReason === 'plan_downgrade' 
            ? 'Réactivez le plan Pro pour relancer cet agent'
            : agent.pauseReason}
        </Tooltip>
      </Badge>
    );
  }
  
  if (agent.status === 'stopped') {
    return <Badge variant="error">Arrêté</Badge>;
  }
}
```

---

## ⚠️ Cas Particuliers

### Agent en Pause Manuelle

Si un utilisateur a mis un agent en pause manuellement:

```typescript
// L'agent ne sera PAS réactivé automatiquement lors d'un upgrade
if (state.metadata?.pausedByPlanChange === true) {
  // Réactiver automatiquement
  await upsertAgentState(userId, agentType, 'active');
} else {
  // Ne pas réactiver (pause manuelle)
  console.log('Agent paused manually, not resuming');
}
```

### Agent avec Erreur

Si un agent a été arrêté suite à une erreur:

```typescript
await upsertAgentState(userId, agentType, 'stopped', {
  pauseReason: 'error',
  metadata: {
    error: 'Instagram API rate limit exceeded',
    timestamp: new Date().toISOString()
  }
});
```

---

## 🔐 Sécurité

### Vérification Avant Exécution

Chaque agent DOIT vérifier son autorisation:

```typescript
// ❌ MAUVAIS - Pas de vérification
export async function runProspectsAgent(userId: number) {
  return analyzeNewFollowers(userId);
}

// ✅ BON - Avec vérification
export async function runProspectsAgent(userId: number) {
  return withAgentCheck(userId, 'prospects', async () => {
    return analyzeNewFollowers(userId);
  });
}
```

### Logs d'Audit

Tous les changements d'état sont loggés:

```
2026-04-28 10:30:00 - User 15 - Agent prospects: active → paused (plan_downgrade)
2026-05-15 14:20:00 - User 15 - Agent prospects: paused → active (plan_upgrade)
```

---

## 📊 Résumé

| Scénario | Agents Affectés | Action | Données |
|----------|----------------|--------|---------|
| Pro → Premium | Prospects, Connections, Clients | ⏸️ Pause | ✅ Préservées |
| Premium → Pro | Prospects, Connections, Clients | ▶️ Reprise | ✅ Préservées |
| Annulation | Tous | ⏹️ Arrêt | ✅ Préservées |
| Réactivation | Selon le plan | 🔄 Réactivation | ✅ Préservées |

---

## 🎉 Avantages

1. **Sécurité** - Les agents Pro ne peuvent pas s'exécuter sans le bon plan
2. **Préservation** - La configuration et les données sont toujours préservées
3. **Automatique** - Pause/reprise automatique lors des changements de plan
4. **Traçabilité** - Tous les changements sont loggés
5. **Flexibilité** - Support de la pause manuelle et des erreurs
6. **UX** - Messages clairs pour l'utilisateur

**Les agents s'adaptent automatiquement au plan de l'utilisateur !** 🚀
