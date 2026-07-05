# Guide des Agents Pro - Waler

## 📋 Vue d'ensemble

Le système d'agents Pro est composé de **3 agents spécialisés** qui travaillent ensemble pour surveiller et analyser les comptes Instagram des utilisateurs Pro.

### 🤖 Les 3 Agents

1. **Agent C** - Surveillance basique des clients
2. **Agent Pro Clients** - Métriques avancées des clients
3. **Agent Pro Circle** - Surveillance du cercle/prospects

---

## 🎯 Agent C - Surveillance Basique

### Rôle
Surveille les métriques de base des clients (followers, following)

### Fonctionnalités
- ✅ Nombre de followers
- ✅ Nombre de following
- ✅ Milestones automatiques (100, 500, 1K, 5K, 10K, etc.)
- ✅ Évolution dans le temps

### Planification
- **Fréquence** : 4 fois par jour (0h, 6h, 12h, 18h)
- **Fichier** : `agent_c.py`

---

## 📊 Agent Pro Clients - Métriques Avancées

### Rôle
Surveille les métriques avancées des clients (posts, vues, engagement)

### Fonctionnalités

#### 1. Métriques de Posts
- ✅ Nombre total de posts
- ✅ Posts publiés aujourd'hui
- ✅ Posts publiés cette semaine
- ✅ Posts publiés ce mois
- ✅ Date du dernier post

#### 2. Métriques de Vues
- ✅ Total de vues (vidéos/reels)
- ✅ Moyenne de vues par post
- ✅ Tracking par post individuel

#### 3. Engagement
- ✅ Taux d'engagement global
- ✅ Likes par post
- ✅ Commentaires par post
- ✅ Ratio engagement/followers

#### 4. Milestones Automatiques
Détecte et complète automatiquement les milestones basés sur :
- **Followers** : 100, 500, 1K, 5K, 10K, 50K, 100K
- **Posts quotidiens** : "3 posts par jour", "5 posts par jour"
- **Posts hebdomadaires** : "7 posts par semaine", "14 posts par semaine"
- **Posts mensuels** : "30 posts par mois"
- **Vues** : "1K vues", "10K vues", "100K vues"
- **Engagement** : "5% d'engagement", "10% d'engagement"

### Planification
- **Fréquence** : Toutes les 6 heures
- **Fichier** : `agent_pro_clients.py`

### Données Collectées

#### Table `client_advanced_metrics`
```sql
- posts_count
- total_views
- average_views_per_post
- engagement_rate
- last_post_date
- posts_this_day
- posts_this_week
- posts_this_month
```

#### Table `client_posts`
```sql
- post_id
- post_url
- post_type (photo/video/carousel/reel)
- caption
- likes_count
- comments_count
- views_count
- posted_at
```

---

## 👥 Agent Pro Circle - Cercle/Prospects

### Rôle
Surveille le cercle social et les prospects avec analyse comportementale avancée

### Fonctionnalités

#### 1. Surveillance des Likes
- ✅ Posts likés avec lien vers le post
- ✅ Fréquence des likes
- ✅ Streak de likes consécutifs
- ✅ Écart entre les likes
- ✅ Estimation du "strike" (jours depuis le premier like)

#### 2. Statut de Connexion
- ✅ Statut en ligne/hors ligne
- ✅ Dernière connexion
- ✅ Durée de connexion estimée
- ✅ Patterns de connexion

#### 3. Connexions Mutuelles
- ✅ Followers en commun
- ✅ Following en commun
- ✅ Liste des comptes mutuels
- ✅ Type de connexion (mutual/follower_only/following_only)

#### 4. Timeline & Événements
Détecte et enregistre :
- **Follow** : Nouveau follower
- **Unfollow** : A arrêté de suivre
- **Follow Back** : A suivi en retour
- **Unfollow → Refollow** : A unfollow puis refollow
- **Like Post** : A liké un post
- **Unlike Post** : A unliké un post
- **Comment** : A commenté
- **Story View** : A vu une story
- **DM** : Message direct

#### 5. Signaux Détectés
Le système détecte automatiquement :

**High Engagement** 🔥
- Likes fréquents
- Interactions régulières
- Score : 80-100

**Consistent Liker** ❤️
- Likes tous les posts
- Moins de 24h entre les likes
- Score : 70-100

**Stalker** 👀
- Streak de 3+ jours consécutifs
- Likes immédiats
- Score : 60-100

**Ghost** 👻
- Suit mais n'interagit jamais
- Aucun like/commentaire
- Score : 0-20

**Mutual Interest** 🤝
- Interactions bidirectionnelles
- Connexions mutuelles
- Score : 70-90

**Potential Unfollow** ⚠️
- Baisse d'engagement
- Pas d'interaction récente
- Score : 20-40

**Reconnection** 🔄
- Unfollow puis refollow
- Reprise d'interactions
- Score : 40-60

#### 6. Score de Relation (0-100)

Le score est calculé selon :

**Likes donnés** (max 30 points)
- +2 points par like

**Likes reçus** (max 20 points)
- +2 points par like reçu

**Streak consécutif** (max 20 points)
- +4 points par jour de streak

**Ancienneté** (max 15 points)
- +1 point par semaine de relation

**Connexions mutuelles** (max 15 points)
- +1 point par connexion mutuelle

**Bonus interactions variées** (+10 points)
- Si plus de 3 types d'interactions

**Pénalités**
- -20 points pour unfollow
- +10 points pour follow_back

### Planification
- **Fréquence** : Toutes les 4 heures
- **Fichier** : `agent_pro_circle.py`

### Données Collectées

#### Table `circle_members`
```sql
- member_username
- category (cercle/prospect)
- is_online
- last_seen_at
- connection_duration_minutes
- total_likes_given
- total_likes_received
- consecutive_likes_streak
- days_since_first_like
- mutual_followers_count
- relationship_score
- detected_signals (JSON)
- timeline_events (JSON)
```

#### Table `liked_posts`
```sql
- post_id
- post_url (lien vers le post)
- post_owner_username
- liked_at
```

#### Table `timeline_events`
```sql
- event_type
- event_data (JSON)
- detected_at
```

#### Table `detected_signals`
```sql
- signal_type
- signal_strength (0-100)
- signal_data (JSON)
- detected_at
```

#### Table `mutual_connections`
```sql
- mutual_username
- connection_type (follower/following/both)
- detected_at
```

---

## 🚀 Installation et Configuration

### 1. Appliquer les migrations

```bash
# Créer les nouvelles tables
sqlite3 server/waler.db < migrations/add_pro_agent_tables.sql
```

### 2. Variables d'environnement

Déjà configuré dans `.env` :
```env
AGENT_C_INSTAGRAM_USER=Nathan.return
AGENT_C_INSTAGRAM_PASS=Gottacheck2026
RUN_ON_START=true
```

### 3. Lancer les agents

**Agent C (basique)**
```bash
python agent_c.py
```

**Agent Pro Clients (métriques avancées)**
```bash
python agent_pro_clients.py
```

**Agent Pro Circle (cercle/prospects)**
```bash
python agent_pro_circle.py
```

**Tous les agents en parallèle**
```bash
start start-all-pro-agents.bat
```

---

## 📈 Synchronisation des Données

### Mise à jour automatique des graphiques

Les agents mettent à jour automatiquement :

1. **Graphiques de followers/following** (Agent C)
   - Courbes d'évolution
   - Tendances

2. **Graphiques de posts** (Agent Pro Clients)
   - Posts par jour/semaine/mois
   - Vues par post
   - Engagement rate

3. **Timeline visuelle** (Agent Pro Circle)
   - Événements chronologiques
   - Signaux détectés
   - Score d'évolution

### Fréquence de synchronisation

- **Agent C** : 4x par jour → Données de base
- **Agent Pro Clients** : 4x par jour → Métriques avancées
- **Agent Pro Circle** : 6x par jour → Interactions sociales

---

## 🎨 Intégration Dashboard

### Vue Client (ClientDetailView.tsx)

Les données sont automatiquement disponibles dans :

#### 1. Onglet "Métriques"
- Graphique followers/following
- Graphique posts (jour/semaine/mois)
- Graphique vues
- Taux d'engagement

#### 2. Onglet "Milestones"
- Milestones auto-complétés
- Progression en temps réel
- Historique des achievements

#### 3. Onglet "Timeline"
- Événements chronologiques
- Signaux détectés
- Score de relation

#### 4. Onglet "Cercle"
- Liste des prospects
- Scores individuels
- Connexions mutuelles
- Posts likés avec liens

---

## 🔍 Exemples d'Utilisation

### Exemple 1 : Suivi d'un client

**Client** : @clara_fitness

**Agent C détecte** :
- 1,250 followers (+25 depuis hier)
- Milestone "1000 followers" ✅

**Agent Pro Clients détecte** :
- 3 posts aujourd'hui
- 15 posts cette semaine
- Milestone "14 posts par semaine" ✅
- Taux d'engagement : 8.5%
- Dernier post : Il y a 2h

**Résultat Dashboard** :
- Graphiques mis à jour
- 2 milestones complétés
- Tendance positive affichée

### Exemple 2 : Analyse d'un prospect

**Prospect** : @sophie_yoga

**Agent Pro Circle détecte** :
- 12 likes donnés sur vos posts
- Streak de 5 jours consécutifs
- 3 connexions mutuelles
- Signal : "Consistent Liker" (85/100)
- Signal : "High Engagement" (80/100)

**Score calculé** :
- Likes donnés : 24 points
- Streak : 20 points
- Connexions mutuelles : 3 points
- Bonus interactions : 10 points
- **Total : 57/100**

**Timeline** :
- J-7 : Follow
- J-6 : Like post #1
- J-5 : Like post #2
- J-4 : Like post #3
- J-3 : Like post #4
- J-2 : Like post #5
- J-1 : Comment
- Aujourd'hui : Story view

**Résultat Dashboard** :
- Prospect affiché avec score 57/100
- Badge "Consistent Liker"
- Timeline complète visible
- Liste des posts likés avec liens

---

## 🛠️ Maintenance

### Logs

Chaque agent génère des logs détaillés :

```
2026-05-03 16:51:00 [Agent Pro Clients] INFO — Client 1/5: @clara_fitness
2026-05-03 16:51:05 [Agent Pro Clients] INFO — Stats complètes: 156 posts, 15 cette semaine
2026-05-03 16:51:05 [Agent Pro Clients] INFO — ✅ Milestone complété automatiquement
```

### Nettoyage

Les données anciennes peuvent être archivées :

```sql
-- Archiver les événements de plus de 90 jours
DELETE FROM timeline_events
WHERE detected_at < datetime('now', '-90 days');

-- Archiver les signaux anciens
DELETE FROM detected_signals
WHERE detected_at < datetime('now', '-30 days');
```

---

## 📞 Support

Pour toute question :
1. Vérifier les logs des agents
2. Consulter ce guide
3. Vérifier la base de données

---

**Système d'Agents Pro - Waler** 🚀
*Surveillance intelligente et automatisée pour les comptes Pro*
