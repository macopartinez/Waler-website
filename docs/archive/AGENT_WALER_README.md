# Agent Waler - Documentation

## 📋 Vue d'ensemble

L'**Agent Waler** est l'agrégateur et synchroniseur principal du système Waler. Il collecte les données de tous les agents (A, B, C...) et les consolide dans la base de données finale.

## 🎯 Rôle

- **Collecte** les données brutes des agents A, B, C
- **Valide** et croise les informations
- **Met à jour** les statistiques des clients
- **Nettoie** les anciennes données
- **Analyse** les patterns pour suggérer des actions

## 🏗️ Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Agent A    │  │  Agent B    │  │  Agent C    │
│ (Détection) │  │(Vérification)│  │  (Tracking) │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │ Écrit          │ Écrit          │ Écrit
       ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│         PostgreSQL (Tables temporaires)         │
│  - FollowerSnapshot (processedByWaler=false)   │
│  - UnfollowList (processedByWaler=false)       │
│  - Event (processedByWaler=false)              │
└─────────────────────────────────────────────────┘
                       ▲
                       │ Lit et agrège
                       │
              ┌────────┴────────┐
              │  Agent Waler    │
              │  (Agrégateur)   │
              └────────┬────────┘
                       │
                       │ Update final
                       ▼
┌─────────────────────────────────────────────────┐
│        PostgreSQL (Tables finales)              │
│  - Client (statistiques mises à jour)          │
│  - Données marquées processedByWaler=true      │
└─────────────────────────────────────────────────┘
```

## 🚀 Installation

### 1. Appliquer la migration SQL

Connectez-vous à votre base PostgreSQL et exécutez :

```bash
psql $DATABASE_URL -f migrations/add_waler_processing_flags.sql
```

Ou via Supabase SQL Editor :
1. Allez sur https://supabase.com/dashboard
2. Ouvrez SQL Editor
3. Copiez le contenu de `migrations/add_waler_processing_flags.sql`
4. Exécutez

### 2. Configurer les variables d'environnement

Dans votre fichier `.env`, ajoutez :

```env
AGENT_WALER_ID=agent-waler
```

### 3. Installer les dépendances (si nécessaire)

```bash
pip install psycopg2-binary apscheduler python-dotenv
```

## 🎮 Utilisation

### Lancement manuel

```bash
python agent_waler.py
```

### Lancement avec le script Windows

```bash
start_agent_waler.bat
```

### Lancement en arrière-plan (Linux/Mac)

```bash
nohup python agent_waler.py > agent_waler.log 2>&1 &
```

## ⏰ Planification

L'Agent Waler s'exécute automatiquement **toutes les 15 minutes** une fois lancé.

Pour modifier la fréquence, éditez `agent_waler.py` :

```python
# Ligne ~360
scheduler.add_job(
    run_aggregation_cycle,
    'interval',
    minutes=15,  # Modifier ici (ex: 30 pour 30 minutes)
    id='waler_aggregation',
    next_run_time=datetime.now()
)
```

## 📊 Cycle de traitement

Chaque cycle effectue les opérations suivantes :

1. **Collecte** : Récupère les données non traitées des agents
2. **Validation** : Croise et valide les informations
3. **Mise à jour** : Met à jour les statistiques des clients
4. **Marquage** : Marque les données comme traitées
5. **Analyse** : Détecte les patterns (ex: users avec beaucoup de clients)
6. **Nettoyage** : Supprime les données de plus de 30 jours

## 🔍 Monitoring

### Logs

Les logs sont affichés dans la console avec le format :

```
2026-04-13 12:38:00 [Agent Waler] INFO — === Début cycle Agent Waler ===
2026-04-13 12:38:01 [Agent Waler] INFO — Collecte des données des agents...
2026-04-13 12:38:01 [Agent Waler] INFO — Agent A: 42 snapshots non traités
2026-04-13 12:38:01 [Agent Waler] INFO — Agent B: 15 unfollows non traités
...
```

### Vérifier le heartbeat

Pour vérifier que l'agent tourne correctement :

```sql
SELECT id, name, "lastCheckAt" 
FROM "Agent" 
WHERE id = 'agent-waler';
```

Le champ `lastCheckAt` doit être récent (< 15 minutes).

## 🛠️ Maintenance

### Nettoyer manuellement les anciennes données

```sql
-- Supprimer les snapshots traités de plus de 30 jours
DELETE FROM "FollowerSnapshot"
WHERE "processedByWaler" = true
  AND "detectedAt" < NOW() - INTERVAL '30 days';

-- Supprimer les unfollows traités de plus de 30 jours
DELETE FROM "UnfollowList"
WHERE "processedByWaler" = true
  AND "detectedAt" < NOW() - INTERVAL '30 days';
```

### Réinitialiser le traitement

Si vous voulez retraiter des données :

```sql
-- Marquer toutes les données comme non traitées
UPDATE "FollowerSnapshot" SET "processedByWaler" = false;
UPDATE "UnfollowList" SET "processedByWaler" = false;
```

## ⚠️ Dépannage

### L'agent ne démarre pas

1. Vérifiez que `DATABASE_URL` est correctement configuré dans `.env`
2. Vérifiez que la migration SQL a été appliquée
3. Vérifiez que les dépendances sont installées

### Aucune donnée traitée

1. Vérifiez que les agents A et B tournent et écrivent des données
2. Vérifiez les logs pour voir les erreurs
3. Vérifiez que les données ont `processedByWaler = false`

### Performances lentes

1. Vérifiez que les index ont été créés (voir migration SQL)
2. Réduisez la limite de traitement dans le code (actuellement 1000)
3. Augmentez l'intervalle entre les cycles (ex: 30 minutes au lieu de 15)

## 🔐 Sécurité

- L'Agent Waler **lit** les données des agents
- Il **met à jour** uniquement les statistiques et les flags de traitement
- Il **ne modifie jamais** les données utilisateur sensibles (passwords, emails, etc.)
- Il **ne change pas** le `usage_mode` automatiquement (seulement des suggestions dans les logs)

## 📈 Évolution future

Fonctionnalités prévues :

- [ ] Dashboard de monitoring en temps réel
- [ ] Alertes par email en cas d'erreur
- [ ] Statistiques agrégées par période
- [ ] Export des rapports
- [ ] API REST pour interroger les données

## 📞 Support

Pour toute question ou problème, consultez :
- Les logs de l'agent
- La documentation principale du projet
- Les issues GitHub

---

**Version** : 1.0.0  
**Date** : 2026-04-13  
**Auteur** : Waler Team
