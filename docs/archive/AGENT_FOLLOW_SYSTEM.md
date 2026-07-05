# 🤖 Système de Follow Automatique des Agents

## Vue d'ensemble

Après qu'un client paie son abonnement Waler, le système déclenche automatiquement le follow de son compte Instagram par nos 2 agents de détection. Ce document explique le processus complet.

---

## 📋 Processus Complet

### 1. Paiement Stripe ✅

**Déclencheur** : Webhook `checkout.session.completed`

```typescript
// server/routes.ts
case "checkout.session.completed": {
  const session = event.data.object;
  const userId = parseInt(session.metadata?.userId || "0");
  
  // 1. Créer la subscription
  await upsertSubscription({ userId, planId, ... });
  
  // 2. Déclencher le follow automatique
  const { followNewClient } = await import("./instagram-follow");
  const result = await followNewClient(userId);
}
```

### 2. Follow Automatique 🤖

**Fichier** : `server/instagram-follow.ts`

**Fonction** : `followNewClient(userId)`

**Actions** :
1. Récupère le username Instagram de l'utilisateur depuis la DB
2. Agent A se connecte et follow l'utilisateur
3. Agent B se connecte et follow l'utilisateur
4. Détecte si le compte est privé
5. Retourne le résultat

```typescript
{
  agentA: { success: true, isPrivate: true, needsApproval: true },
  agentB: { success: true, isPrivate: true, needsApproval: true },
  needsManualApproval: true
}
```

### 3. Gestion Compte Privé 🔒

**Si le compte est PUBLIC** :
- ✅ Les agents suivent automatiquement
- ✅ `isConnected = true` immédiatement
- ✅ L'utilisateur peut utiliser Waler tout de suite

**Si le compte est PRIVÉ** :
- ⏳ Les agents envoient une demande de follow
- ⏳ `isConnected = false` (en attente)
- 📱 L'utilisateur doit accepter manuellement

### 4. Onboarding Tutorial 📚

**Composant** : `client/src/components/Onboarding.tsx`

**Affiché** : Après le premier login post-paiement

**Étapes** :

#### Étape 1 : Bienvenue
- Explication du concept Waler
- Clarté relationnelle vs surveillance

#### Étape 2 : Comment ça fonctionne
- Présentation des 2 agents
- Rôle de chaque agent

#### Étape 3 : Compte Privé (si applicable)
- ⚠️ **CRITIQUE** : Instructions détaillées
- Liste des agents à accepter :
  - `@{AGENT_A_INSTAGRAM_USER}`
  - `@{AGENT_B_INSTAGRAM_USER}`
- Bouton "Vérifier" pour check l'approval

#### Étape 4 : Dashboard
- Présentation des sections
- Unfollowers, Followers, Ghosts

### 5. Vérification Approval ✔️

**Endpoint** : `POST /api/check-agent-approval`

**Fonction** : `checkAgentApproval(userId)`

**Process** :
1. Login Agent A
2. Récupère le friendship status avec l'utilisateur
3. Vérifie si `friendship.following === true`
4. Répète pour Agent B
5. Si tous approuvés : `isConnected = true`

```typescript
{
  agentAApproved: true,
  agentBApproved: true,
  allApproved: true
}
```

---

## 🔧 Configuration Technique

### Variables d'environnement

```env
# Agent A - Unfollow Detector
AGENT_A_INSTAGRAM_USER=clara_argentinabuen
AGENT_A_INSTAGRAM_PASS=Instagrame20220

# Agent B - Account Verification
AGENT_B_INSTAGRAM_USER=nathan_winters8th
AGENT_B_INSTAGRAM_PASS=Neverlesssayless2026
```

### Endpoints API

```
POST /api/agents/follow
- Déclenche manuellement le follow
- Requiert authentification
- Retourne le statut du follow

POST /api/check-agent-approval
- Vérifie si les agents ont été acceptés
- Requiert authentification
- Retourne le statut d'approval
```

### Base de données

**Champ `isConnected`** dans la table `app_users` :
- `true` : Les agents suivent l'utilisateur (compte public ou privé approuvé)
- `false` : En attente d'approval (compte privé)

---

## 📱 Instructions Utilisateur (Compte Privé)

### Ce que voit l'utilisateur

1. **Notification de paiement réussi**
2. **Redirection vers le dashboard**
3. **Modal d'onboarding s'affiche**
4. **Étape 3 : Instructions compte privé**

### Instructions affichées

```
📝 Étapes à suivre :

1. Ouvrez Instagram sur votre téléphone
2. Allez dans vos demandes de follow (notifications)
3. Acceptez les 2 comptes Waler :
   ✓ @clara_argentinabuen
   ✓ @nathan_winters8th
4. Revenez ici et cliquez sur "Vérifier"
```

### Bouton "Vérifier"

- Appelle `POST /api/check-agent-approval`
- Affiche un loader pendant la vérification
- Si approuvé : Passe à l'étape suivante
- Si non approuvé : Affiche un message d'erreur

---

## 🎯 Cas d'Usage

### Cas 1 : Compte Public

```
Paiement → Follow Auto → isConnected=true → Dashboard accessible
```

**Durée** : ~30 secondes

### Cas 2 : Compte Privé (Utilisateur Réactif)

```
Paiement → Follow Auto → Onboarding → Accepte sur Instagram → Vérifie → isConnected=true → Dashboard
```

**Durée** : ~2-5 minutes

### Cas 3 : Compte Privé (Utilisateur Oublie)

```
Paiement → Follow Auto → Onboarding → Skip → Dashboard limité
```

**Solution** :
- Afficher un banner persistant : "⚠️ Acceptez les agents pour activer Waler"
- Bouton "Voir les instructions" → Réouvre l'onboarding

---

## 🚨 Gestion d'Erreurs

### Erreur de connexion Agent

```typescript
{
  success: false,
  isPrivate: false,
  needsApproval: false,
  error: "Challenge required" // ou autre erreur Instagram
}
```

**Action** :
- Logger l'erreur
- Ne pas bloquer le webhook Stripe
- Envoyer un email à l'admin
- Afficher un message à l'utilisateur : "Erreur temporaire, réessayez dans 1h"

### Username Instagram invalide

```typescript
{
  success: false,
  error: "User not found"
}
```

**Action** :
- Vérifier que l'utilisateur a bien entré son username
- Proposer de modifier le username dans les settings

### Rate Limit Instagram

**Action** :
- Retry avec exponential backoff
- Utiliser un système de queue (Redis/Bull)
- Espacer les follows de 5-10 secondes

---

## 📊 Monitoring

### Métriques à suivre

- **Follow Success Rate** : % de follows réussis
- **Private Account Rate** : % de comptes privés
- **Approval Time** : Temps moyen pour accepter les agents
- **Approval Rate** : % d'utilisateurs qui acceptent les agents

### Logs importants

```
✅ Agent A followed @username (public)
⏳ Agent A sent follow request to @username (private)
❌ Agent A failed to follow @username: Challenge required
🔍 Checking approval for user 123
✅ User 123 approved all agents
```

---

## 🔐 Sécurité

### Bonnes pratiques

1. **Rotation des agents** : Changer les comptes agents tous les 3 mois
2. **Rate limiting** : Max 100 follows/jour par agent
3. **Proxy rotation** : Utiliser des proxies résidentiels
4. **User-Agent rotation** : Varier les user-agents
5. **Timing humain** : Espacer les actions de manière aléatoire

### Protection des credentials

- Stockés dans `.env` (jamais commité)
- Chiffrés en production (AWS Secrets Manager / Supabase Vault)
- Accès restreint aux admins uniquement

---

## 🎨 UX/UI

### Onboarding Modal

- **Design** : Modal fullscreen avec gradient
- **Animation** : Framer Motion (slide transitions)
- **Progress bar** : Indicateur visuel des étapes
- **Skip button** : Toujours visible (top-right)
- **CTA** : Boutons clairs "Suivant" / "Vérifier" / "Commencer"

### Banner Persistant (si non approuvé)

```tsx
<div className="bg-orange-100 border-l-4 border-orange-500 p-4">
  <div className="flex items-center gap-3">
    <AlertCircle className="text-orange-600" />
    <div>
      <p className="font-semibold text-orange-900">
        Action requise : Acceptez les agents Waler
      </p>
      <p className="text-sm text-orange-800">
        Votre compte est privé. Acceptez les 2 demandes de follow pour activer Waler.
      </p>
    </div>
    <button className="ml-auto btn-primary">
      Voir les instructions
    </button>
  </div>
</div>
```

---

## 📝 Checklist de Déploiement

- [ ] Créer 2 comptes Instagram agents (A et B)
- [ ] Configurer les variables d'environnement
- [ ] Tester le follow sur compte public
- [ ] Tester le follow sur compte privé
- [ ] Tester la vérification d'approval
- [ ] Configurer le webhook Stripe
- [ ] Tester le flow complet end-to-end
- [ ] Ajouter monitoring et alertes
- [ ] Documenter les procédures d'urgence
- [ ] Former l'équipe support

---

## 🆘 Support Utilisateur

### FAQ

**Q : Pourquoi dois-je accepter 2 comptes ?**
R : Nous utilisons 2 agents pour détecter différents types de changements (unfollows et blocages).

**Q : Les agents vont-ils liker mes photos ?**
R : Non, les agents n'interagissent jamais avec votre contenu. Ils observent uniquement.

**Q : Puis-je retirer les agents après ?**
R : Oui, mais Waler ne fonctionnera plus. Vous pouvez réactiver en les acceptant à nouveau.

**Q : Combien de temps pour que ça fonctionne ?**
R : Compte public : immédiat. Compte privé : dès que vous acceptez les demandes.

---

**Dernière mise à jour** : 14 avril 2026
