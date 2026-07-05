# 🎯 Nouveau Flux d'Onboarding - Waler

## 📊 Flux Optimisé pour la Conversion

### Ancien flux (problématique)
```
1. Questionnaire (12 étapes)
2. Plateforme
3. Username
4. Email
5. Password
6. → Paywall après inscription ❌
```

**Problème** : L'utilisateur donne email/password AVANT de voir le prix = abandon élevé

---

### ✅ Nouveau flux (optimisé)

```
1. Questionnaire psychologique (11 étapes)
   ├─ Consentement
   ├─ Type d'usage (Personal/Pro)
   ├─ Démographie (âge, genre)
   ├─ Questions relationnelles (Q1-Q10)
   └─ Résumé AI

2. Username Instagram (étape 11)
   └─ "What's your Instagram username?"

3. 💰 PAYWALL (étape 12)
   └─ "Unlock your personalized insights"
   └─ Modal avec plans Base/Pro
   └─ Bouton "Simuler" pour test

4. Email (étape 13)
   └─ "What's your email?"

5. Password (étape 14)
   └─ "Create a secure password"
   └─ → Création compte + Activation agents
```

---

## 🎯 Avantages du nouveau flux

### 1. **Maximiser les données AVANT le paywall**
- ✅ 11 questions psychologiques
- ✅ Username Instagram
- ✅ Type d'usage (Personal/Pro)
- ✅ Profil complet de l'utilisateur

**Résultat** : On peut personnaliser l'offre et le pricing

### 2. **Paywall au moment optimal**
- ✅ L'utilisateur a investi du temps (sunk cost)
- ✅ Il a vu son résumé AI personnalisé
- ✅ Il veut débloquer ses insights
- ✅ Il n'a PAS encore donné son email (pas de friction)

**Résultat** : +30-40% de conversion attendue

### 3. **Email/Password APRÈS le paywall**
- ✅ L'utilisateur a déjà payé → engagement fort
- ✅ Moins d'abandon à cette étape
- ✅ Création de compte = finalisation naturelle

**Résultat** : Taux de complétion proche de 100%

---

## 📝 Structure technique

### Constants
```typescript
const TOTAL_STEPS = 15;
const QUESTIONNAIRE_END = 10; // Summary
const USERNAME_STEP = 11;
const PAYWALL_STEP = 12;
const EMAIL_STEP = 13;
const PASSWORD_STEP = 14;
```

### Fonctions clés
```typescript
getStepTitle() {
  if (step === USERNAME_STEP) return "What's your Instagram username?";
  if (step === PAYWALL_STEP) return "Unlock your personalized insights";
  if (step === EMAIL_STEP) return "What's your email?";
  if (step === PASSWORD_STEP) return "Create a secure password";
}

getStepPhase() {
  if (step === USERNAME_STEP) return 'Account Setup 1/3';
  if (step === PAYWALL_STEP) return 'Choose Your Plan';
  if (step === EMAIL_STEP) return 'Account Setup 2/3';
  if (step === PASSWORD_STEP) return 'Account Setup 3/3';
}
```

### Validation
```typescript
canProceed() {
  if (step === USERNAME_STEP) return username.trim().length > 0;
  if (step === PAYWALL_STEP) return true; // Toujours possible
  if (step === EMAIL_STEP) return email.includes("@");
  if (step === PASSWORD_STEP) return password.length >= 6;
}
```

---

## 🎨 Expérience utilisateur

### Étape 11 : Username
```
┌─────────────────────────────────────┐
│  Account Setup 1/3          11 / 15 │
├─────────────────────────────────────┤
│                                     │
│  What's your Instagram username?    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ @ your_username             │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Back]              [Continue →]  │
└─────────────────────────────────────┘
```

### Étape 12 : PAYWALL
```
┌─────────────────────────────────────┐
│  Choose Your Plan           12 / 15 │
├─────────────────────────────────────┤
│                                     │
│  Unlock your personalized insights  │
│                                     │
│  🎯 AI Summary                      │
│  Based on your answers...           │
│                                     │
│  [Unlock Now] ← Ouvre modal pricing │
│                                     │
│  [Back]              [Continue →]  │
└─────────────────────────────────────┘
```

### Étape 13 : Email
```
┌─────────────────────────────────────┐
│  Account Setup 2/3          13 / 15 │
├─────────────────────────────────────┤
│                                     │
│  What's your email?                 │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ✉ email@example.com         │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Back]              [Continue →]  │
└─────────────────────────────────────┘
```

### Étape 14 : Password
```
┌─────────────────────────────────────┐
│  Account Setup 3/3          14 / 15 │
├─────────────────────────────────────┤
│                                     │
│  Create a secure password           │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔒 ••••••••                 │   │
│  └─────────────────────────────┘   │
│  Minimum 6 characters               │
│                                     │
│  [Back]          [Create Account]  │
└─────────────────────────────────────┘
```

---

## 💰 Modal Pricing (Étape 12)

Quand l'utilisateur clique sur "Unlock Now" :

```
┌─────────────────────────────────────────────┐
│  Choose Your Plan                           │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐    ┌──────────────┐     │
│  │  BASE        │    │  PRO ⭐      │     │
│  │  9.99€/mois  │    │  19.99€/mois │     │
│  │              │    │              │     │
│  │  ✓ Feature 1 │    │  ✓ All Base  │     │
│  │  ✓ Feature 2 │    │  ✓ Feature + │     │
│  │              │    │  ✓ Priority  │     │
│  │ [Choisir]    │    │ [Choisir]    │     │
│  │ [Simuler]    │    │ [Simuler]    │     │
│  └──────────────┘    └──────────────┘     │
│                                             │
└─────────────────────────────────────────────┘
```

**Actions possibles** :
1. **Choisir** → Sauvegarde plan → Continue vers Email (étape 13)
2. **Simuler** → Active agents directement (pour test)

---

## 📈 Métriques de conversion attendues

### Ancien flux
```
100 visiteurs
├─ 70 complètent questionnaire (70%)
├─ 60 donnent email (60%)
├─ 50 créent password (50%)
└─ 15 payent (15%) ← CONVERSION FINALE
```

### Nouveau flux
```
100 visiteurs
├─ 70 complètent questionnaire (70%)
├─ 65 donnent username (65%)
├─ 40 payent au paywall (40%) ← +166% 🚀
├─ 39 donnent email (98%)
└─ 38 créent password (95%) ← CONVERSION FINALE
```

**Amélioration** : +153% de conversion globale (15% → 38%)

---

## 🔄 Flux complet avec Stripe

### Après paiement Stripe
```
1. Webhook Stripe → Création subscription
2. Redirection vers étape 13 (Email)
3. Utilisateur complète Email + Password
4. Création compte avec subscription active
5. Agents A & B déclenchés automatiquement
6. Redirection vers Dashboard débloqué
```

### LocalStorage
```javascript
// Sauvegardé à l'étape 12 (paywall)
localStorage.setItem('selectedPlan', JSON.stringify({
  planName: 'pro',
  priceId: 'price_xxx',
  billingPeriod: 'monthly'
}));

// Sauvegardé à l'étape 11 (username)
localStorage.setItem('pendingUsername', 'pako_mrtz');

// Récupéré à l'étape 14 (création compte)
const plan = JSON.parse(localStorage.getItem('selectedPlan'));
const username = localStorage.getItem('pendingUsername');
```

---

## ✅ Checklist d'implémentation

- [x] Réorganiser les constantes (TOTAL_STEPS, USERNAME_STEP, etc.)
- [x] Créer getStepTitle() et getStepPhase()
- [x] Mettre à jour canProceed()
- [x] Réorganiser le rendu des étapes
- [x] Username à l'étape 11
- [x] Paywall à l'étape 12
- [x] Email à l'étape 13
- [x] Password à l'étape 14
- [ ] Intégrer Stripe au paywall
- [ ] Sauvegarder plan sélectionné dans localStorage
- [ ] Créer compte avec subscription après password
- [ ] Déclencher agents après création compte

---

## 🚀 Résumé

**Le nouveau flux maximise la conversion en :**
1. Collectant un maximum de données AVANT le paywall
2. Plaçant le paywall au moment optimal (après investissement temps)
3. Demandant email/password APRÈS le paiement (engagement fort)

**Résultat attendu** : +150% de conversion 🎯
