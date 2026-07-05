# Agent Connections - Guide de Configuration et Utilisation

## 📋 Description

**Agent Connections** analyse la qualité de vos relations existantes pour vous apporter une **clarté relationnelle profonde**.

### Rôle
1. ✅ Analyser tous vos followers et following
2. ✅ Identifier les types de relations (mutuelles, unilatérales, ghost)
3. ✅ Calculer un score de qualité relationnelle (0-100)
4. ✅ Calculer un score d'engagement (0-100)
5. ✅ Générer un contexte relationnel avec suggestions d'actions
6. ✅ Détecter les relations à cultiver vs à reconsidérer

---

## 🎯 Valeur Relationnelle

### Pour l'utilisateur Premium

**Clarté sur vos relations** :
- Qui sont vos vraies connexions ?
- Quelles relations sont réciproques et actives ?
- Qui sont les "ghost followers" (te suivent mais n'interagissent jamais) ?
- Quelles relations unilatérales méritent d'être reconsidérées ?

### Types de relations détectés

#### 1. **Relations Mutuelles** 🤝
- Vous vous suivez mutuellement
- Sous-types :
  - **Ami actif** 💚 : Engagement élevé (>60/100)
  - **Ami occasionnel** 🤝 : Engagement moyen (30-60/100)
  - **Mutuel dormant** 💤 : Engagement faible (<30/100)

#### 2. **Followers Only** 👤
- Ils te suivent mais tu ne les suis pas
- Peut indiquer un intérêt unilatéral ou un fan

#### 3. **Following Only** 📱
- Tu les suis mais ils ne te suivent pas
- Relations à reconsidérer si engagement faible

#### 4. **Ghost Followers** 👻
- Te suivent mais aucune interaction détectée
- Score d'engagement très faible

---

## 📊 Scores Calculés

### Score de Qualité (0-100)

**Critères** :
- **Type de relation** : Mutuelle (+20), Follower only (+10), Following only (-10), Ghost (-20)
- **Amis en commun** : +20 max (2 points par ami commun)
- **Compte vérifié** : +5 points
- **Ratio followers/following** : +5 ou -5 points
- **Compte privé** : +5 points (plus personnel)

**Interprétation** :
- **80-100** : ⭐ Connexion de qualité exceptionnelle
- **60-79** : 💚 Bonne connexion à préserver
- **40-59** : 🤝 Connexion moyenne
- **20-39** : ⚠️ Connexion faible à reconsidérer
- **0-19** : 🔍 Connexion très faible

### Score d'Engagement (0-100)

**Critères** :
- **Nombre d'interactions** : +40 max (5 points par interaction)
- **Dernière interaction** : <7 jours (+30), <30 jours (+20), <90 jours (+10)
- **Type de relation** : Mutuelle (+20), Ghost (-30)
- **Posts actifs** : >100 posts (+10), <10 posts (-10)

**Interprétation** :
- **80-100** : 🔥 Très engagé
- **60-79** : 💪 Bien engagé
- **40-59** : 😊 Moyennement engagé
- **20-39** : 😴 Peu engagé
- **0-19** : 👻 Aucun engagement

---

## 🔧 Configuration

### 1. Variables d'environnement

L'agent utilise les mêmes credentials que l'Agent A :

```env
# Agent A credentials (réutilisés par Agent Connections)
AGENT_A_INSTAGRAM_USER=votre_compte_instagram
AGENT_A_INSTAGRAM_PASS=votre_mot_de_passe
```

### 2. Base de données

Deux nouvelles tables sont créées dans `server/init_db.sql` :

#### Table `connections`
Stocke toutes les connexions analysées :
- Informations de profil
- Type de relation (mutual, follower_only, following_only, ghost)
- Scores de qualité et d'engagement
- Contexte relationnel (JSON)

#### Table `connection_interactions`
Stocke les interactions futures avec les connexions :
- Likes, commentaires, vues de stories, DMs, mentions, tags
- Direction (reçu/envoyé)
- Permet d'affiner les scores au fil du temps

---

## 🚀 Lancement

### Méthode 1 : Script automatique (Recommandé)

```bash
# Double-cliquez sur :
start-agent-connections.bat
```

### Méthode 2 : Manuel

```bash
python agent_connections.py
```

---

## ⏰ Planification

Agent Connections s'exécute automatiquement **1 fois par jour** :

- 🌙 **03h00** - Nuit (pour ne pas perturber l'utilisateur)

Timezone : **Europe/Paris**

**Pourquoi 1 fois par jour ?**
- Analyse approfondie (50+ connexions par utilisateur)
- Évite les limitations Instagram
- Les relations évoluent lentement

---

## 🎯 Fonctionnalités

### 1. Récupération des connexions

Pour chaque utilisateur actif (Premium/Pro) :
- Récupère les followers (max 50)
- Récupère les following (max 50)
- Identifie les relations mutuelles, unilatérales

### 2. Analyse de profil

Pour chaque connexion :
- **Informations de base** : username, nom, bio
- **Statistiques** : followers, following, posts
- **Indicateurs** : vérifié, privé
- **Type de relation** : mutual, follower_only, following_only

### 3. Calcul des scores

- **Score de qualité** : Basé sur le type de relation et les caractéristiques du compte
- **Score d'engagement** : Basé sur les interactions (à enrichir avec le temps)

### 4. Contexte relationnel

Génération automatique de :
- **Type de relation** : active_friend, casual_friend, dormant_mutual, follower, one_sided, ghost
- **Force de la relation** : strong, medium, weak, none
- **Suggestions d'action** : Préserver, entretenir, reconsidérer, retirer

---

## 🔒 Sécurité & Comportement Humain

### Session cookies
Les cookies de session sont sauvegardés dans :
```
session-connections-{INSTAGRAM_USERNAME}.json
```

⚠️ **Ne partagez jamais ce fichier** - il contient vos identifiants de session Instagram.

### Limitations & Délais

- **Max 5 utilisateurs par session**
- **Max 50 connexions analysées par utilisateur** (20 mutuels + 15 followers + 15 following)
- **Délais aléatoires** entre chaque action (2-4 secondes)
- **Pause entre utilisateurs** : 30-60 secondes
- **Scroll progressif** : Pour charger les listes de manière naturelle

---

## 📊 Exemple de logs

```
2026-04-22 03:00:00 [Agent Connections] INFO — ============================================================
2026-04-22 03:00:00 [Agent Connections] INFO — 🚀 Démarrage de l'Agent Connections
2026-04-22 03:00:00 [Agent Connections] INFO — ============================================================
2026-04-22 03:00:01 [Agent Connections] INFO — 👥 2 utilisateur(s) à traiter
2026-04-22 03:00:05 [Agent Connections] INFO — 🍪 Cookies chargés
2026-04-22 03:00:08 [Agent Connections] INFO — ✅ Déjà connecté via cookies
2026-04-22 03:00:10 [Agent Connections] INFO — 🔍 Traitement de l'utilisateur marie_coach (ID: 42)
2026-04-22 03:00:12 [Agent Connections] INFO — 📥 Récupération des followers de @marie_coach...
2026-04-22 03:00:25 [Agent Connections] INFO — ✅ 45 followers récupérés
2026-04-22 03:00:27 [Agent Connections] INFO — 📤 Récupération des following de @marie_coach...
2026-04-22 03:00:40 [Agent Connections] INFO — ✅ 38 following récupérés
2026-04-22 03:00:41 [Agent Connections] INFO — 📊 45 followers, 38 following
2026-04-22 03:00:42 [Agent Connections] INFO — 🤝 32 mutuels, 👤 13 followers only, 📱 6 following only
2026-04-22 03:00:43 [Agent Connections] INFO — 📝 Analyse de 50 connexions...
2026-04-22 03:00:44 [Agent Connections] INFO — Analyse 1/50: @clara_dev
2026-04-22 03:00:48 [Agent Connections] INFO — ✅ Nouvelle connexion enregistrée : @clara_dev (qualité: 85/100)
2026-04-22 03:05:30 [Agent Connections] INFO — ✅ Traitement terminé pour @marie_coach
```

---

## 🐛 Dépannage

### Problème : "Aucun utilisateur actif à traiter"

**Solution** : Vérifiez que :
1. Des utilisateurs ont `subscription_status = 'active'`
2. Ces utilisateurs ont `subscription_tier` = 'premium' ou 'pro'

### Problème : "Aucune connexion récupérée"

**Solution** :
1. Vérifiez que le username Instagram de l'utilisateur est correct
2. Vérifiez que le compte n'est pas privé
3. Vérifiez votre connexion Internet

### Problème : Session expirée

**Solution** :
1. Supprimez le fichier `session-connections-*.json`
2. Relancez Agent Connections
3. Connectez-vous manuellement dans le navigateur qui s'ouvre

### Problème : Timeout lors du scraping

**Solution** :
- C'est normal si l'utilisateur a beaucoup de connexions
- L'agent limite à 50 connexions par utilisateur pour éviter ça
- Les connexions sont priorisées : mutuels > followers > following

---

## 📈 Intégration avec le Dashboard

Les données collectées par Agent Connections seront disponibles dans :

- **Dashboard Premium** : Section "Qualité de mes Relations"
- **Graphiques** : Distribution des types de relations
- **Listes filtrables** : Par score de qualité, engagement, type
- **Suggestions** : Relations à cultiver vs à reconsidérer

---

## 🎨 Exemples de Contexte Généré

### Exemple 1 : Ami Actif
```json
{
  "type": "active_friend",
  "strength": "strong",
  "suggestions": [
    "💚 Relation active et réciproque",
    "⭐ Connexion de qualité à préserver"
  ]
}
```

### Exemple 2 : Relation Unilatérale
```json
{
  "type": "one_sided",
  "strength": "weak",
  "suggestions": [
    "📱 Tu suis cette personne mais pas réciproquement",
    "⚠️ Relation unilatérale - Considérer de ne plus suivre"
  ]
}
```

### Exemple 3 : Ghost Follower
```json
{
  "type": "ghost",
  "strength": "none",
  "suggestions": [
    "👻 Ghost follower - Aucune interaction détectée",
    "💡 Considérer de retirer ce follower"
  ]
}
```

---

## 🔄 Workflow complet

```
1. Agent Connections démarre (cron : 3h00)
   ↓
2. Récupère tous les utilisateurs Premium/Pro actifs
   ↓
3. Pour chaque utilisateur :
   ↓
4. Récupère ses followers (max 50)
   ↓
5. Récupère ses following (max 50)
   ↓
6. Identifie les relations mutuelles, unilatérales
   ↓
7. Pour chaque connexion (max 50) :
   ↓
8. Visite le profil Instagram
   ↓
9. Récupère les infos (bio, stats, etc.)
   ↓
10. Détermine le type de relation
   ↓
11. Calcule les scores de qualité et d'engagement
   ↓
12. Génère le contexte relationnel
   ↓
13. Sauvegarde ou met à jour dans la table connections
   ↓
14. Log le résultat
```

---

## 🎯 Prochaines Améliorations

### Phase 1 (Actuel)
- ✅ Détection des types de relations
- ✅ Analyse de profil complète
- ✅ Scores de qualité et d'engagement
- ✅ Contexte relationnel avec suggestions

### Phase 2 (À venir)
- 🔜 Tracking des interactions réelles (likes, commentaires)
- 🔜 Amélioration du score d'engagement avec données réelles
- 🔜 Détection des changements de relation (mutual → following_only)
- 🔜 Notifications pour relations importantes

### Phase 3 (Future)
- 🔜 Machine Learning pour prédire la qualité relationnelle
- 🔜 Suggestions personnalisées basées sur l'historique
- 🔜 Intégration avec Agent Prospects
- 🔜 Rapport mensuel de qualité relationnelle

---

## 📞 Support

Pour toute question ou problème :
1. Vérifiez les logs de l'agent
2. Consultez ce guide
3. Vérifiez la configuration `.env`

---

**Agent Connections - Clarté sur la qualité de vos relations** 🤝
