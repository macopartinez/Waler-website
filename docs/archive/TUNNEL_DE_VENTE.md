# 🎯 Tunnel de Vente Waler

## Parcours Utilisateur Complet

### 1️⃣ **Dashboard Flouté** (Non-abonné)
- L'utilisateur voit le dashboard avec les stats floutées
- Un bouton central "Voir le résumé" apparaît
- **Action** : Clic sur "Voir le résumé"

### 2️⃣ **Questionnaire Psychologique** (RevealGate)
- 5 questions introspectives sur les relations
- Questions sur les émotions, tensions, instincts
- **Objectif** : Créer un moment de réflexion avant la révélation
- **Action** : Compléter le questionnaire → Bouton "Voir les plans"

### 3️⃣ **Page des Plans** (Pricing)
- Affichage des plans Base et Pro
- Plans filtrés selon le type d'usage (à venir)
- **2 options** :
  - **Bouton principal** : "Choisir ce plan" → Redirige vers onboarding
  - **Bouton test** : "Simuler (Test)" → Active les agents directement (sans paiement)

### 4️⃣ **Onboarding / Questionnaire** (À compléter)
Quand l'utilisateur clique sur "Choisir ce plan" :

1. **Question 1 : Type d'usage**
   - Personnel (influenceur, créateur)
   - Professionnel (entreprise, marque)
   - Les deux

3. **Question 3 : Objectifs**
   - Comprendre mes relations
   - Analyser mon audience
   - Optimiser ma stratégie

4. **Question 4 : Fréquence**
   - Quotidienne
   - Hebdomadaire
   - Mensuelle

### 5️⃣ **Paiement Stripe** (À intégrer)
- Checkout Stripe avec le plan sélectionné
- Période de facturation (mensuelle/annuelle)
- **Webhook** : Activation automatique après paiement

### 6️⃣ **Activation des Agents**
Après paiement réussi :
- Les agents A et B sont déclenchés automatiquement
- Ils suivent le compte Instagram de l'utilisateur
- L'utilisateur doit accepter les demandes de follow (si compte privé)

### 7️⃣ **Dashboard Débloqué**
- Accès complet aux stats
- Visualisation des unfollowers, followers, ghosts
- Mode Pro disponible (si plan Pro)

---

## 🔧 Implémentation Actuelle

### ✅ Fait
- Dashboard avec stats floutées
- Questionnaire psychologique (RevealGate)
- Page des plans avec bouton simulation
- Redirection vers onboarding après sélection de plan
- Système d'agents avec Playwright
- API pour déclencher le follow manuellement

### 🚧 À faire
1. **Compléter l'onboarding** avec les questions :
   - Plateforme
   - Type d'usage
   - Objectifs
   - Fréquence

2. **Filtrer les plans** selon le type d'usage :
   - Personnel → Plan Base recommandé
   - Professionnel → Plan Pro recommandé

3. **Intégrer Stripe** :
   - Checkout après onboarding
   - Webhook pour activation automatique

4. **Améliorer les agents** :
   - Corriger les sélecteurs Instagram
   - Gérer les checkpoints
   - Détecter automatiquement les unfollowers

---

## 📝 LocalStorage

### Données sauvegardées
```javascript
// Réponses du questionnaire psychologique
localStorage.setItem('revealGateAnswers', JSON.stringify(answers));

// Plan sélectionné
localStorage.setItem('selectedPlan', JSON.stringify({
  planName: 'pro',
  priceId: 'price_xxx',
  billingPeriod: 'monthly'
}));

// Réponses de l'onboarding (à ajouter)
localStorage.setItem('onboardingAnswers', JSON.stringify({
  usageType: 'personal',
  goals: ['understand_relationships'],
  frequency: 'daily'
}));
```

---

## 🎨 Expérience Utilisateur

### Émotions ciblées
1. **Curiosité** : Dashboard flouté → "Que cache-t-il ?"
2. **Introspection** : Questionnaire psychologique → Réflexion personnelle
3. **Décision** : Plans clairs et différenciés
4. **Engagement** : Onboarding personnalisé
5. **Satisfaction** : Dashboard débloqué avec insights

### Taux de conversion attendu
- Dashboard → Questionnaire : **80%**
- Questionnaire → Plans : **70%**
- Plans → Onboarding : **60%**
- Onboarding → Paiement : **50%**
- **Conversion globale** : ~17%

---

## 🚀 Prochaines Étapes

1. **Créer le questionnaire d'onboarding complet**
2. **Intégrer Stripe pour le paiement**
3. **Améliorer les agents Playwright**
4. **Ajouter des analytics pour suivre le tunnel**
5. **Optimiser les taux de conversion**
