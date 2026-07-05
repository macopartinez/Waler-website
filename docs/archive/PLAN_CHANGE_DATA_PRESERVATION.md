# 🔒 Préservation des Données lors du Changement de Plan

## ✅ Garantie de Préservation

**IMPORTANT:** Dans Waler, **AUCUNE DONNÉE N'EST JAMAIS SUPPRIMÉE** lors d'un changement de plan, qu'il s'agisse d'un upgrade, downgrade ou annulation.

---

## 🎯 Principe Fondamental

### Toutes les données sont préservées

Lors d'un changement de plan (Premium → Pro, Pro → Premium, ou annulation), **100% des données** sont conservées :

- ✅ **Unfollowers** - Historique complet
- ✅ **Followers** - Historique complet
- ✅ **Blockers** - Historique complet
- ✅ **Clients** (mode Pro) - Tous les clients et leurs données
- ✅ **Prospects** - Toutes les analyses
- ✅ **Connections** - Toutes les relations analysées
- ✅ **Statistiques** - Tout l'historique
- ✅ **Paramètres** - Toutes les configurations

---

## 🔄 Scénarios de Changement de Plan

### 1. Upgrade (Premium → Pro)

```typescript
// L'utilisateur passe de Premium à Pro
const result = await upgradePlan(userId, proPlanId, stripeData);

// Résultat:
// ✅ Accès à toutes les fonctionnalités Pro
// ✅ Toutes les données Premium conservées
// ✅ Nouvelles fonctionnalités disponibles immédiatement
```

**Ce qui se passe:**
- Le tier est mis à jour vers `pro`
- Toutes les données existantes restent intactes
- Nouvelles fonctionnalités activées (mode professionnel, clients illimités, etc.)
- Historique complet préservé

### 2. Downgrade (Pro → Premium)

```typescript
// L'utilisateur passe de Pro à Premium
const result = await downgradePlan(userId, premiumPlanId);

// Résultat:
// ✅ Toutes les données Pro conservées
// ⚠️ Accès limité aux fonctionnalités Pro
// ✅ Peut consulter l'historique
// ✅ Peut réactiver Pro à tout moment
```

**Ce qui se passe:**
- Le tier est mis à jour vers `premium`
- **TOUTES les données restent dans la base de données**
- Les clients Pro restent accessibles en lecture seule
- L'utilisateur peut réactiver Pro pour retrouver l'accès complet
- Warnings affichés si limites dépassées

**Exemple de warning:**
```
"Le nouveau plan limite à 3 comptes. Vos données existantes sont 
préservées mais vous ne pourrez pas ajouter de nouveaux comptes."
```

### 3. Annulation

```typescript
// L'utilisateur annule son abonnement
const result = await cancelPlan(userId);

// Résultat:
// ✅ Plan actif jusqu'à la fin de la période payée
// ✅ Toutes les données conservées
// ✅ Peut réactiver à tout moment
// ⚠️ Passage au plan gratuit à la fin de la période
```

**Ce qui se passe:**
- `cancelAtPeriodEnd` est mis à `true`
- Le plan reste actif jusqu'à la fin de la période de facturation
- **Aucune donnée n'est supprimée**
- L'utilisateur peut réactiver avant la fin de la période

---

## 📊 Architecture Technique

### Service de Migration (`plan-migration.ts`)

Le service de migration garantit la préservation des données :

```typescript
export async function changePlan(
  userId: number,
  newPlanId: number,
  options: {...}
): Promise<PlanChangeResult> {
  // 1. Récupérer le plan actuel
  // 2. Récupérer le nouveau plan
  // 3. Vérifier les limites (warnings seulement)
  // 4. Mettre à jour la subscription (SANS supprimer de données)
  // 5. Mettre à jour le tier
  // 6. Enregistrer dans l'historique
  // 7. Retourner le résultat avec dataPreserved: true
}
```

### Table d'Historique

Chaque changement de plan est enregistré dans `plan_change_history` :

```sql
CREATE TABLE plan_change_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  previous_plan_id INTEGER,
  new_plan_id INTEGER NOT NULL,
  change_type TEXT NOT NULL, -- 'upgrade', 'downgrade', 'cancel', 'reactivate'
  reason TEXT, -- 'webhook', 'manual', etc.
  data_preserved BOOLEAN NOT NULL DEFAULT true, -- Toujours true!
  warnings JSON, -- Array de warnings
  metadata JSON, -- Données supplémentaires
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Webhooks Stripe

Les webhooks Stripe utilisent automatiquement le service de migration :

```typescript
case "customer.subscription.updated": {
  // Détection du changement de plan
  if (newPlanId && newPlanId !== currentPlanId) {
    const result = await changePlan(userId, newPlanId, {...});
    // Données automatiquement préservées
  }
}

case "customer.subscription.deleted": {
  const result = await cancelPlan(userId);
  // Données préservées, plan annulé proprement
}
```

---

## 🧪 Tests de Préservation

### Exécuter les tests

```bash
npx tsx test-plan-change.ts
```

Le script de test vérifie :

1. ✅ Compte des données AVANT le changement
2. ✅ Exécution du changement de plan
3. ✅ Compte des données APRÈS le changement
4. ✅ Vérification que les comptes sont identiques
5. ✅ Vérification de l'historique

### Exemple de sortie

```
🧪 Test de préservation des données lors du changement de plan

👤 Utilisateur de test: pako_mrtz (demo@example.com)
   Plan actuel: premium

📊 Données AVANT le changement de plan:
   Unfollowers: 150
   Followers: 500
   Blockers: 25

🔄 Changement de plan: premium → pro

✅ Résultat du changement:
   Success: true
   Previous plan: premium
   New plan: pro
   Data preserved: true

📊 Données APRÈS le changement de plan:
   Unfollowers: 150  ✅
   Followers: 500    ✅
   Blockers: 25      ✅

✅ SUCCÈS: Toutes les données ont été préservées!
```

---

## 🔐 Garanties de Sécurité

### 1. Aucune Suppression Automatique

```typescript
// ❌ JAMAIS FAIT
await db.delete(unfollowers).where(eq(unfollowers.userId, userId));

// ✅ TOUJOURS FAIT
// Les données restent intactes, seul le tier change
await db.update(users).set({ subscriptionTier: newTier });
```

### 2. Warnings au lieu de Blocages

```typescript
// Au lieu de bloquer ou supprimer:
if (newPlan.maxAccounts < currentAccountsCount) {
  warnings.push(
    "Vos données existantes sont préservées mais vous ne " +
    "pourrez pas ajouter de nouveaux comptes."
  );
}
```

### 3. Historique Complet

Chaque changement est tracé avec :
- Plan précédent et nouveau plan
- Type de changement (upgrade/downgrade/cancel)
- Raison du changement
- **Confirmation que les données sont préservées**
- Warnings éventuels
- Métadonnées Stripe

---

## 💡 Cas d'Usage

### Scénario 1: Client teste Pro puis revient à Premium

```
1. Utilisateur sur Premium avec 100 unfollowers
2. Upgrade vers Pro → Toutes les données conservées ✅
3. Teste le mode professionnel, ajoute 5 clients
4. Downgrade vers Premium → Toutes les données conservées ✅
   - Les 100 unfollowers sont toujours là
   - Les 5 clients sont toujours là (lecture seule)
5. Re-upgrade vers Pro → Accès complet retrouvé ✅
```

### Scénario 2: Problème de paiement

```
1. Utilisateur sur Pro avec beaucoup de données
2. Paiement échoue → Status: 'past_due'
   - Données préservées ✅
   - Accès temporairement limité
3. Paiement réussi → Status: 'active'
   - Toutes les données toujours là ✅
   - Accès complet restauré
```

### Scénario 3: Annulation puis réactivation

```
1. Utilisateur annule son abonnement
2. Plan reste actif jusqu'à la fin de la période
3. Données conservées pendant toute la période
4. Réactivation avant la fin → Aucune perte ✅
5. Ou passage au plan gratuit → Données toujours là ✅
```

---

## 📝 Checklist pour les Développeurs

Lors de l'ajout de nouvelles fonctionnalités :

- [ ] Utiliser `changePlan()` pour tout changement de plan
- [ ] Ne JAMAIS supprimer de données lors d'un downgrade
- [ ] Ajouter des warnings si nécessaire
- [ ] Tester avec `test-plan-change.ts`
- [ ] Vérifier l'historique dans `plan_change_history`
- [ ] Documenter les nouvelles limites de plan

---

## 🆘 Support

Si un utilisateur signale une perte de données :

1. Vérifier `plan_change_history` pour l'utilisateur
2. Vérifier que `dataPreserved` est `true` (toujours le cas)
3. Vérifier les tables de données (unfollowers, followers, etc.)
4. Les données sont forcément là - vérifier les filtres d'affichage

**Rappel:** Le système est conçu pour qu'il soit **impossible** de perdre des données lors d'un changement de plan.

---

## 🎉 Conclusion

Waler garantit la **préservation totale des données** lors de tout changement de plan. Cette garantie est :

- ✅ **Technique** - Architecture qui empêche la suppression
- ✅ **Testée** - Scripts de test automatisés
- ✅ **Tracée** - Historique complet de tous les changements
- ✅ **Transparente** - Warnings clairs pour l'utilisateur

**Votre historique est sacré. Nous ne le supprimons jamais.**
