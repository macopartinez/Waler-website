# Agent Prospects - Guide de Configuration et Utilisation

## 📋 Description

**Agent Prospects** détecte et analyse les nouveaux followers de vos utilisateurs pour leur apporter une **clarté relationnelle**.

### Rôle
1. ✅ Détecter les nouveaux followers
2. ✅ Analyser leur profil (bio, stats, connexions mutuelles)
3. ✅ Calculer un score de pertinence relationnelle (0-100)
4. ✅ Générer un contexte relationnel (qui est cette personne pour moi ?)
5. ✅ Suggérer des actions (suivre en retour, ignorer, etc.)

---

## 🎯 Valeur Relationnelle

### Pour l'utilisateur Premium
- **Conscience** : Qui entre dans mon cercle ?
- **Contexte** : Pourquoi cette personne me suit-elle ?
- **Opportunités** : Quelles relations méritent d'être cultivées ?
- **Clarté** : Éviter de manquer des connexions importantes

### Exemples de contexte généré

```
🌱 Nouveau Prospect : @marie_coach
Score de pertinence : 85/100

📊 Profil
- 1,234 followers | 456 following
- Bio : "Coach en développement personnel 🌟"
- 5 amis en commun

💡 Contexte Relationnel
Type : Cercle proche
Raison : Vous avez 5 amis en commun
Suggestion : Cette personne fait partie de votre cercle proche
Action : 💡 Considérer de suivre en retour
```

---

## 🔧 Configuration

### 1. Variables d'environnement

L'agent utilise les mêmes credentials que l'Agent A :

```env
# Agent A credentials (réutilisés par Agent Prospects)
AGENT_A_INSTAGRAM_USER=votre_compte_instagram
AGENT_A_INSTAGRAM_PASS=votre_mot_de_passe
```

### 2. Base de données

Deux nouvelles tables sont créées dans `server/init_db.sql` :

#### Table `prospects`
Stocke les nouveaux followers détectés avec leur analyse :
- Informations de profil (username, bio, stats)
- Score de pertinence (0-100)
- Contexte relationnel (JSON)
- État (vu/non vu, archivé)

#### Table `prospect_interactions`
Stocke les interactions futures avec les prospects :
- Likes, commentaires, vues de stories, DMs
- Permet d'affiner le score de qualité relationnelle

---

## 🚀 Lancement

### Méthode 1 : Script automatique (Recommandé)

```bash
# Double-cliquez sur :
start-agent-prospects.bat
```

### Méthode 2 : Manuel

```bash
python agent_prospects.py
```

---

## ⏰ Planification

Agent Prospects s'exécute automatiquement **4 fois par jour** :

- 🌅 **06h00** - Matin
- ☀️ **12h00** - Midi
- 🌆 **18h00** - Soir
- 🌙 **00h00** - Minuit

Timezone : **Europe/Paris**

---

## 🎯 Fonctionnalités

### 1. Détection des nouveaux followers

Pour chaque utilisateur actif (Premium/Pro) :
- Récupère les 20 premiers followers actuels
- Compare avec les followers connus (base de données)
- Identifie les nouveaux

### 2. Analyse de profil

Pour chaque nouveau follower :
- **Informations de base** : username, nom complet, bio
- **Statistiques** : followers, following, posts
- **Indicateurs** : compte vérifié, privé
- **Connexions mutuelles** : amis en commun (à implémenter)

### 3. Score de pertinence (0-100)

Algorithme de calcul :
- **Base** : 50 points
- **Amis en commun** : +30 points max (3 points par ami commun)
- **Compte vérifié** : +10 points
- **Ratio followers/following** : +10 ou -10 points
- **Bio remplie** : +5 points
- **Compte privé** : -5 points

### 4. Contexte relationnel

Types de relations détectés :
- **Cercle proche** : 5+ amis en commun
- **Réseau étendu** : 1-4 amis en commun
- **Influenceur** : Compte vérifié + 10K+ followers
- **Utilisateur actif** : 1K+ followers
- **Nouveau utilisateur** : Petit compte ou nouveau

### 5. Suggestions d'action

Basées sur le contexte :
- "💡 Considérer de suivre en retour" (cercle proche/étendu)
- "Personnalité publique ou influenceur"
- "Peut-être une vraie connexion personnelle"

---

## 🔒 Sécurité & Comportement Humain

### Session cookies
Les cookies de session sont sauvegardés dans :
```
session-prospects-{INSTAGRAM_USERNAME}.json
```

⚠️ **Ne partagez jamais ce fichier** - il contient vos identifiants de session Instagram.

### Limitations & Délais

- **Max 10 utilisateurs par session** pour éviter les limitations Instagram
- **Max 5 nouveaux prospects analysés par utilisateur** par session
- **Délais aléatoires** entre chaque action (3-6 secondes)
- **Pause entre utilisateurs** : 10-20 secondes
- **Comportement humain** : Scroll, pauses naturelles

---

## 📊 Exemple de logs

```
2026-04-22 06:00:00 [Agent Prospects] INFO — ============================================================
2026-04-22 06:00:00 [Agent Prospects] INFO — 🚀 Démarrage de l'Agent Prospects
2026-04-22 06:00:00 [Agent Prospects] INFO — ============================================================
2026-04-22 06:00:01 [Agent Prospects] INFO — 👥 3 utilisateur(s) à traiter
2026-04-22 06:00:05 [Agent Prospects] INFO — 🍪 Cookies chargés
2026-04-22 06:00:08 [Agent Prospects] INFO — ✅ Déjà connecté via cookies
2026-04-22 06:00:10 [Agent Prospects] INFO — 🔍 Traitement de l'utilisateur marie_coach (ID: 42)
2026-04-22 06:00:11 [Agent Prospects] INFO — 📊 15 followers déjà connus
2026-04-22 06:00:15 [Agent Prospects] INFO — ✅ 20 followers récupérés pour @marie_coach
2026-04-22 06:00:16 [Agent Prospects] INFO — 🌱 3 nouveau(x) follower(s) détecté(s) : @clara_dev, @nathan_coach, @sophie_yoga
2026-04-22 06:00:17 [Agent Prospects] INFO — 📝 Analyse du prospect 1/3: @clara_dev
2026-04-22 06:00:20 [Agent Prospects] INFO — ✅ Profil analysé : @clara_dev
2026-04-22 06:00:21 [Agent Prospects] INFO — ✅ Nouveau prospect enregistré : @clara_dev (score: 75/100)
2026-04-22 06:00:30 [Agent Prospects] INFO — ✅ Traitement terminé pour @marie_coach
```

---

## 🐛 Dépannage

### Problème : "Aucun utilisateur actif à traiter"

**Solution** : Vérifiez que :
1. Des utilisateurs ont `subscription_status = 'active'`
2. Ces utilisateurs ont `subscription_tier` = 'premium' ou 'pro'

### Problème : "Aucun follower récupéré"

**Solution** :
1. Vérifiez que le username Instagram de l'utilisateur est correct
2. Vérifiez que le compte n'est pas privé
3. Vérifiez votre connexion Internet

### Problème : Session expirée

**Solution** :
1. Supprimez le fichier `session-prospects-*.json`
2. Relancez Agent Prospects
3. Connectez-vous manuellement dans le navigateur qui s'ouvre

---

## 📈 Intégration avec le Dashboard

Les données collectées par Agent Prospects seront disponibles dans :

- **Dashboard Premium** : Section "Nouveaux Prospects"
- **Notifications** : Alertes pour les prospects à fort score
- **Page Prospect** : Détails du profil et suggestions d'action

---

## 🔄 Workflow complet

```
1. Agent Prospects démarre (cron : 6h, 12h, 18h, 00h)
   ↓
2. Récupère tous les utilisateurs Premium/Pro actifs
   ↓
3. Pour chaque utilisateur :
   ↓
4. Récupère ses followers actuels (20 premiers)
   ↓
5. Compare avec les followers connus
   ↓
6. Identifie les nouveaux followers
   ↓
7. Pour chaque nouveau follower (max 5) :
   ↓
8. Visite le profil Instagram
   ↓
9. Récupère les infos (bio, stats, etc.)
   ↓
10. Calcule le score de pertinence
   ↓
11. Génère le contexte relationnel
   ↓
12. Sauvegarde dans la table prospects
   ↓
13. Log le résultat
```

---

## 🎨 Prochaines Améliorations

### Phase 1 (Actuel)
- ✅ Détection des nouveaux followers
- ✅ Analyse de profil basique
- ✅ Score de pertinence
- ✅ Contexte relationnel

### Phase 2 (À venir)
- 🔜 Détection des amis en commun (API Instagram)
- 🔜 Analyse des interactions (likes, commentaires)
- 🔜 Notifications push pour prospects importants
- 🔜 Dashboard dédié aux prospects

### Phase 3 (Future)
- 🔜 Machine Learning pour améliorer le score
- 🔜 Suggestions personnalisées basées sur l'historique
- 🔜 Intégration avec Agent Connections

---

## 📞 Support

Pour toute question ou problème :
1. Vérifiez les logs de l'agent
2. Consultez ce guide
3. Vérifiez la configuration `.env`

---

**Agent Prospects - Clarté sur vos nouvelles connexions** 🌱
