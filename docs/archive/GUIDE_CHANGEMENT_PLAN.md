# 📖 Guide d'Utilisation - Changement de Plan

## 🎯 Pour les Utilisateurs

### Changer de Plan

Vous pouvez changer de plan à tout moment **sans risque de perdre vos données**.

#### Via l'Interface

1. Allez dans **Paramètres** → **Abonnement**
2. Cliquez sur **Changer de plan**
3. Sélectionnez votre nouveau plan (Premium ou Pro)
4. Confirmez le paiement via Stripe

**Résultat:** Votre plan est changé instantanément et **toutes vos données sont préservées**.

#### Via le Portail Client Stripe

1. Allez dans **Paramètres** → **Gérer mon abonnement**
2. Vous serez redirigé vers le portail Stripe
3. Changez votre plan ou annulez votre abonnement
4. Les webhooks Stripe mettront à jour votre compte automatiquement

**Résultat:** Le changement est synchronisé et **toutes vos données sont préservées**.

---

## 🛠️ Pour les Développeurs

### Utiliser le Service de Migration

#### Import

```typescript
import { changePlan, upgradePlan, downgradePlan, cancelPlan } from "./server/plan-migration";
```

#### Changement de Plan Générique

```typescript
const result = await changePlan(userId, newPlanId, {
  stripeCustomerId: 'cus_xxx',
  stripeSubscriptionId: 'sub_xxx',
  billingPeriod: 'monthly',
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
});

console.log(result);
// {
//   success: true,
//   previousPlan: 'premium',
//   newPlan: 'pro',
//   dataPreserved: true,
//   message: 'Plan changé avec succès...',
//   warnings: [] // optionnel
// }
```

#### Upgrade Spécifique

```typescript
const result = await upgradePlan(userId, proPlanId, {
  customerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  billingPeriod: 'yearly',
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
});
```

#### Downgrade Spécifique

```typescript
const result = await downgradePlan(userId, premiumPlanId);

// Peut retourner des warnings:
// {
//   success: true,
//   previousPlan: 'pro',
//   newPlan: 'premium',
//   dataPreserved: true,
//   message: '...',
//   warnings: [
//     'Le nouveau plan limite à 3 comptes. Vos données existantes sont préservées...'
//   ]
// }
```

#### Annulation

```typescript
const result = await cancelPlan(userId);

// {
//   success: true,
//   previousPlan: 'pro',
//   newPlan: 'base',
//   dataPreserved: true,
//   message: 'Votre abonnement sera annulé à la fin de la période...',
//   warnings: [
//     'Votre plan actuel restera actif jusqu\'à la fin de la période payée',
//     'Aucune donnée ne sera supprimée'
//   ]
// }
```

---

## 🔌 Webhooks Stripe

Les webhooks sont déjà configurés pour utiliser le service de migration.

### Events Gérés

#### 1. `customer.subscription.updated`

Déclenché quand un utilisateur change de plan via Stripe.

```typescript
case "customer.subscription.updated": {
  // Le système détecte automatiquement le changement
  // et utilise changePlan() pour préserver les données
  const result = await changePlan(userId, newPlanId, {...});
  console.log(`✅ Plan changed via webhook:`, result);
}
```

#### 2. `customer.subscription.deleted`

Déclenché quand un abonnement est annulé.

```typescript
case "customer.subscription.deleted": {
  // Le système utilise cancelPlan() pour préserver les données
  const result = await cancelPlan(userId);
  console.log(`✅ Plan cancelled via webhook:`, result);
}
```

#### 3. `invoice.payment_failed`

Déclenché quand un paiement échoue.

```typescript
case "invoice.payment_failed": {
  // Le statut est mis à 'past_due'
  // MAIS les données sont préservées
  await db.update(subscriptions).set({ status: 'past_due' });
  console.log(`⚠️ Payment failed - data preserved`);
}
```

---

## 📊 Vérifier l'Historique

### Via la Base de Données

```sql
-- Voir tous les changements de plan d'un utilisateur
SELECT 
  pch.*,
  p1.display_name as previous_plan_name,
  p2.display_name as new_plan_name
FROM plan_change_history pch
LEFT JOIN plans p1 ON p1.id = pch.previous_plan_id
JOIN plans p2 ON p2.id = pch.new_plan_id
WHERE pch.user_id = ?
ORDER BY pch.created_at DESC;
```

### Via l'API

```typescript
import { db } from "./server/db";
import { planChangeHistory } from "@shared/schema";
import { eq } from "drizzle-orm";

const history = await db
  .select()
  .from(planChangeHistory)
  .where(eq(planChangeHistory.userId, userId))
  .orderBy(planChangeHistory.createdAt);

console.log(history);
// [
//   {
//     id: 1,
//     userId: 15,
//     previousPlanId: null,
//     newPlanId: 1,
//     changeType: 'initial',
//     reason: 'registration',
//     dataPreserved: true,
//     warnings: null,
//     metadata: {...},
//     createdAt: '2026-04-01T10:00:00Z'
//   },
//   {
//     id: 2,
//     userId: 15,
//     previousPlanId: 1,
//     newPlanId: 2,
//     changeType: 'upgrade',
//     reason: 'webhook',
//     dataPreserved: true,
//     warnings: null,
//     metadata: {...},
//     createdAt: '2026-04-15T14:30:00Z'
//   }
// ]
```

---

## 🧪 Tester

### Test Automatique

```bash
npx tsx test-plan-change.ts
```

### Test Manuel

```typescript
// 1. Créer un utilisateur de test
const testUser = await createUser({
  username: 'test_user',
  email: 'test@example.com',
  password: 'password123'
});

// 2. Ajouter des données
await db.insert(unfollowers).values({
  userId: testUser.id,
  username: 'unfollower1',
  detectedAt: new Date()
});

// 3. Compter les données AVANT
const countBefore = await db
  .select({ count: db.$count() })
  .from(unfollowers)
  .where(eq(unfollowers.userId, testUser.id));

console.log('Unfollowers AVANT:', countBefore);

// 4. Changer de plan
const result = await changePlan(testUser.id, proPlanId);

// 5. Compter les données APRÈS
const countAfter = await db
  .select({ count: db.$count() })
  .from(unfollowers)
  .where(eq(unfollowers.userId, testUser.id));

console.log('Unfollowers APRÈS:', countAfter);

// 6. Vérifier
if (countBefore === countAfter) {
  console.log('✅ Données préservées!');
} else {
  console.log('❌ Données perdues!');
}
```

---

## 🔍 Debugging

### Problème: L'utilisateur dit avoir perdu des données

**Étape 1:** Vérifier l'historique

```sql
SELECT * FROM plan_change_history WHERE user_id = ?;
```

Vérifier que `data_preserved` est `true` (toujours le cas).

**Étape 2:** Compter les données

```sql
SELECT 
  (SELECT COUNT(*) FROM unfollowers WHERE user_id = ?) as unfollowers,
  (SELECT COUNT(*) FROM followers WHERE user_id = ?) as followers,
  (SELECT COUNT(*) FROM blockers WHERE user_id = ?) as blockers;
```

**Étape 3:** Vérifier les filtres UI

Les données sont là, mais peut-être cachées par un filtre dans l'interface.

**Étape 4:** Vérifier les permissions

Si l'utilisateur est en downgrade, il peut avoir un accès limité mais les données sont toujours là.

---

## ⚠️ Warnings Possibles

### Downgrade avec Limites Dépassées

```typescript
warnings: [
  "Le nouveau plan limite à 3 comptes. Vos données existantes sont " +
  "préservées mais vous ne pourrez pas ajouter de nouveaux comptes."
]
```

**Action:** Afficher le warning à l'utilisateur mais ne PAS bloquer le downgrade.

### Annulation avec Période Active

```typescript
warnings: [
  "Votre plan actuel restera actif jusqu'à la fin de la période payée",
  "Aucune donnée ne sera supprimée"
]
```

**Action:** Rassurer l'utilisateur que ses données sont en sécurité.

---

## 📝 Checklist de Développement

Avant de déployer un changement lié aux plans :

- [ ] Utilise `changePlan()` ou ses variantes
- [ ] Ne supprime JAMAIS de données
- [ ] Teste avec `test-plan-change.ts`
- [ ] Vérifie l'historique dans `plan_change_history`
- [ ] Ajoute des warnings si nécessaire
- [ ] Documente les nouvelles limites
- [ ] Teste les webhooks Stripe en dev

---

## 🎓 Exemples Complets

### Exemple 1: Endpoint API pour Changer de Plan

```typescript
app.post("/api/subscription/change-plan", requireAuth, async (req, res) => {
  try {
    const userId = getCurrentUser(req);
    const { planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    const result = await changePlan(userId, planId);

    res.json({
      success: result.success,
      message: result.message,
      warnings: result.warnings,
      dataPreserved: result.dataPreserved
    });
  } catch (error) {
    console.error("Change plan error:", error);
    res.status(500).json({ message: "Failed to change plan" });
  }
});
```

### Exemple 2: Afficher l'Historique dans l'UI

```typescript
// API endpoint
app.get("/api/subscription/history", requireAuth, async (req, res) => {
  const userId = getCurrentUser(req);
  
  const history = await db
    .select()
    .from(planChangeHistory)
    .where(eq(planChangeHistory.userId, userId))
    .orderBy(planChangeHistory.createdAt);

  res.json(history);
});

// Frontend
const history = await fetch('/api/subscription/history');
const changes = await history.json();

// Afficher dans l'UI
changes.forEach(change => {
  console.log(`${change.changeType}: ${change.previousPlanId} → ${change.newPlanId}`);
  console.log(`Data preserved: ${change.dataPreserved}`);
});
```

---

## 🚀 Conclusion

Le système de changement de plan est maintenant **100% sécurisé** :

- ✅ Aucune donnée n'est jamais supprimée
- ✅ Tous les changements sont tracés
- ✅ Les webhooks Stripe sont gérés automatiquement
- ✅ Les tests garantissent la préservation
- ✅ La documentation est complète

**Utilisez-le en toute confiance !**
