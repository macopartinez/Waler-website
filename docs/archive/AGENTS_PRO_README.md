# 🤖 Système d'Agents Pro - Waler

## ✅ Système Complet Créé

Vous disposez maintenant d'un **système complet d'agents intelligents** pour le mode Pro avec surveillance avancée des clients et du cercle social.

---

## 📦 Fichiers Créés

### Agents Python
1. **`agent_c.py`** - Surveillance basique (followers/following)
2. **`agent_pro_clients.py`** - Métriques avancées des clients
3. **`agent_pro_circle.py`** - Surveillance du cercle/prospects

### Base de Données
4. **`migrations/add_pro_agent_tables.sql`** - Schéma des nouvelles tables
5. **`apply_pro_migrations.py`** - Script d'application des migrations

### Scripts de Lancement
6. **`start-agent-c.bat`** - Lance Agent C
7. **`start-all-pro-agents.bat`** - Lance tous les agents

### Documentation
8. **`AGENT_PRO_GUIDE.md`** - Guide complet (ce fichier)
9. **`AGENTS_PRO_README.md`** - Résumé rapide

---

## 🎯 Fonctionnalités Implémentées

### Pour les Clients (Growth Accounts)

#### ✅ Métriques de Base (Agent C)
- Nombre de followers
- Nombre de following
- Milestones automatiques

#### ✅ Métriques Avancées (Agent Pro Clients)
- **Posts** : Nombre total, par jour/semaine/mois
- **Vues** : Total, moyenne par post
- **Engagement** : Taux global, likes, commentaires
- **Milestones** : Auto-complétion basée sur les métriques
- **Tracking** : Chaque post avec URL, type, stats

### Pour le Cercle/Prospects (People)

#### ✅ Surveillance des Likes (Agent Pro Circle)
- Posts likés avec **lien direct**
- Fréquence des likes
- Streak de likes consécutifs
- Écart entre les posts likés
- Estimation du "strike" (jours depuis le premier like)

#### ✅ Statut de Connexion
- En ligne / Hors ligne
- Dernière connexion
- Durée de connexion estimée

#### ✅ Connexions Mutuelles
- Followers en commun (avec liste)
- Following en commun (avec liste)
- Type de connexion (mutual/follower_only/following_only)

#### ✅ Timeline Complète
Détection automatique de :
- **Follow** / **Unfollow**
- **Follow Back**
- **Unfollow → Refollow**
- **Like Post** / **Unlike Post**
- **Comment**
- **Story View**
- **DM** (sent/received)

#### ✅ Signaux Détectés
Le système détecte automatiquement :
- **High Engagement** (80-100) - Interactions fréquentes
- **Consistent Liker** (70-100) - Likes réguliers
- **Stalker** (60-100) - Streak de 3+ jours
- **Ghost** (0-20) - Suit mais n'interagit pas
- **Mutual Interest** (70-90) - Interactions bidirectionnelles
- **Potential Unfollow** (20-40) - Baisse d'engagement
- **Reconnection** (40-60) - Unfollow puis refollow

#### ✅ Score de Relation (0-100)
Calculé automatiquement selon :
- Likes donnés (max 30 pts)
- Likes reçus (max 20 pts)
- Streak consécutif (max 20 pts)
- Ancienneté (max 15 pts)
- Connexions mutuelles (max 15 pts)
- Bonus interactions variées (+10 pts)
- Pénalités (unfollow -20 pts)

---

## 🗄️ Structure de la Base de Données

### Tables Créées

#### Pour les Clients
```
✅ client_advanced_metrics - Métriques avancées
✅ client_posts - Posts individuels avec stats
```

#### Pour le Cercle/Prospects
```
✅ circle_members - Membres du cercle
✅ liked_posts - Posts likés (avec liens)
✅ timeline_events - Événements chronologiques
✅ detected_signals - Signaux détectés
✅ mutual_connections - Connexions mutuelles
```

---

## 🚀 Démarrage Rapide

### 1. Appliquer les migrations (✅ Déjà fait)
```bash
python apply_pro_migrations.py
```

### 2. Lancer tous les agents
```bash
start-all-pro-agents.bat
```

Ou individuellement :
```bash
python agent_c.py
python agent_pro_clients.py
python agent_pro_circle.py
```

---

## ⏰ Planification Automatique

| Agent | Fréquence | Horaires |
|-------|-----------|----------|
| **Agent C** | 4x/jour | 0h, 6h, 12h, 18h |
| **Agent Pro Clients** | 4x/jour | Toutes les 6h |
| **Agent Pro Circle** | 6x/jour | Toutes les 4h |

---

## 📊 Synchronisation Dashboard

### Données Automatiquement Disponibles

#### Vue Client (ClientDetailView.tsx)

**Onglet Métriques**
- Graphique followers/following (Agent C)
- Graphique posts jour/semaine/mois (Agent Pro Clients)
- Graphique vues (Agent Pro Clients)
- Taux d'engagement (Agent Pro Clients)

**Onglet Milestones**
- Auto-complétion basée sur les métriques
- Progression en temps réel

**Onglet Timeline**
- Événements chronologiques
- Signaux détectés

**Onglet Cercle**
- Liste des prospects avec scores
- Posts likés avec **liens directs**
- Connexions mutuelles
- Timeline individuelle

---

## 💡 Exemples d'Utilisation

### Exemple 1 : Client @clara_fitness

**Agent C** :
- 1,250 followers (+25)
- Milestone "1000 followers" ✅

**Agent Pro Clients** :
- 3 posts aujourd'hui
- 15 posts cette semaine
- Milestone "14 posts/semaine" ✅
- Engagement : 8.5%

**Dashboard** :
- Graphiques mis à jour
- 2 milestones complétés
- Tendance positive

### Exemple 2 : Prospect @sophie_yoga

**Agent Pro Circle** :
- 12 likes donnés
- Streak de 5 jours
- 3 connexions mutuelles
- Signal : "Consistent Liker" (85/100)

**Score** : 57/100

**Timeline** :
- J-7 : Follow
- J-6 à J-2 : Likes quotidiens
- J-1 : Comment
- Aujourd'hui : Story view

**Dashboard** :
- Prospect affiché avec score
- Badge "Consistent Liker"
- Timeline complète
- Liste des posts likés avec liens

---

## 🔧 Configuration

### Variables d'Environnement (`.env`)
```env
# Déjà configuré
AGENT_C_INSTAGRAM_USER=Nathan.return
AGENT_C_INSTAGRAM_PASS=Gottacheck2026
RUN_ON_START=true
```

### Session Cookies
Les agents sauvegardent automatiquement les sessions :
- `session-agent-pro-Nathan.return.json`
- `session-agent-circle-Nathan.return.json`

⚠️ **Ne partagez jamais ces fichiers**

---

## 📈 Métriques Collectées

### Client Metrics
```json
{
  "posts_count": 156,
  "posts_this_day": 3,
  "posts_this_week": 15,
  "posts_this_month": 42,
  "total_views": 125000,
  "average_views_per_post": 2500,
  "engagement_rate": 8.5,
  "last_post_date": "2026-05-03"
}
```

### Circle Member
```json
{
  "username": "sophie_yoga",
  "category": "prospect",
  "total_likes_given": 12,
  "consecutive_likes_streak": 5,
  "days_since_first_like": 7,
  "mutual_followers_count": 3,
  "relationship_score": 57,
  "detected_signals": [
    "consistent_liker",
    "high_engagement"
  ]
}
```

### Timeline Event
```json
{
  "event_type": "like_post",
  "event_data": {
    "post_id": "ABC123",
    "post_url": "https://instagram.com/p/ABC123/",
    "liked_at": "2026-05-03T16:30:00"
  }
}
```

---

## 🛠️ Maintenance

### Vérifier les Logs
```bash
# Les agents affichent des logs détaillés
[Agent Pro Clients] INFO — Client 1/5: @clara_fitness
[Agent Pro Clients] INFO — ✅ Milestone complété automatiquement
[Agent Pro Circle] INFO — Score de @sophie_yoga: 57/100
```

### Nettoyer les Données Anciennes
```sql
-- Archiver les événements de plus de 90 jours
DELETE FROM timeline_events
WHERE detected_at < datetime('now', '-90 days');
```

---

## 📚 Documentation Complète

Consultez **`AGENT_PRO_GUIDE.md`** pour :
- Détails techniques complets
- Algorithmes de calcul de score
- Schéma de base de données détaillé
- Exemples avancés
- Troubleshooting

---

## ✨ Prochaines Étapes

1. **Tester les agents** avec un utilisateur Pro
2. **Créer des clients** de test
3. **Vérifier les graphiques** dans le dashboard
4. **Ajuster les seuils** de détection de signaux si nécessaire

---

## 🎉 Résumé

Vous disposez maintenant d'un **système complet d'agents Pro** qui :

✅ Surveille automatiquement les clients (growth accounts)
✅ Track les posts, vues, engagement
✅ Complète automatiquement les milestones
✅ Surveille le cercle social et les prospects
✅ Détecte les likes avec liens directs
✅ Analyse les patterns de connexion
✅ Génère des scores de relation
✅ Détecte automatiquement les signaux
✅ Crée une timeline complète
✅ Synchronise toutes les données avec le dashboard

**Le système est prêt à être utilisé !** 🚀

---

**Waler - Agents Pro**
*Intelligence artificielle pour la gestion de comptes Instagram Pro*
