# Agent C - Guide de Configuration et Utilisation

## 📋 Description

**Agent C** est dédié exclusivement aux utilisateurs avec le plan **Pro**. Son rôle est de :

1. ✅ Vérifier le nombre de followers de tous les clients des coachs Pro
2. ✅ Mettre à jour les métriques (followers, following) dans la base de données
3. ✅ Créer automatiquement des milestones pour les paliers de followers (100, 500, 1K, 5K, 10K, etc.)
4. ✅ Tracker l'évolution des clients dans le temps

## 🔧 Configuration

### 1. Variables d'environnement

Ajoutez ces variables dans votre fichier `.env` :

```env
# Instagram Agent C - Pro Clients Follower Tracker
AGENT_C_INSTAGRAM_USER=votre_troisieme_compte_instagram
AGENT_C_INSTAGRAM_PASS=votre_mot_de_passe
AGENT_C_ID=agent_c_unique_id  # Optionnel
```

⚠️ **Important** : Utilisez un compte Instagram **différent** des Agents A et B pour éviter les limitations d'Instagram.

### 2. Base de données

Agent C utilise les tables suivantes (déjà créées dans `server/init_db.sql`) :

- **users** : Utilisateurs avec `subscription_tier = 'pro'`
- **clients** : Clients des coachs Pro
- **client_metrics** : Historique des métriques (followers, following)
- **milestones** : Paliers de followers atteints

## 🚀 Lancement

### Méthode 1 : Script automatique (Recommandé)

```bash
# Double-cliquez sur :
start-agent-c.bat
```

### Méthode 2 : Manuel

```bash
python agent_c.py
```

## ⏰ Planification

Agent C s'exécute automatiquement **4 fois par jour** :

- 🌙 **00h00** - Minuit
- 🌅 **06h00** - Matin
- ☀️ **12h00** - Midi
- 🌆 **18h00** - Soir

Timezone : **Europe/Paris**

## 🎯 Fonctionnalités

### 1. Vérification des followers

Pour chaque client d'un coach Pro :
- Récupère le nombre de followers
- Récupère le nombre de following
- Compare avec les anciennes métriques
- Log l'évolution (📈 +X, 📉 -X, ➡️ stable)

### 2. Création automatique de milestones

Paliers détectés automatiquement :
- 100 followers
- 500 followers
- 1,000 followers
- 5,000 followers
- 10,000 followers
- 50,000 followers
- 100,000 followers

### 3. Comportement humain

Agent C simule un comportement humain pour éviter la détection :
- ✅ Délais aléatoires entre les actions (3-8 secondes)
- ✅ Scroll aléatoire sur les pages
- ✅ Pauses naturelles tous les 3-5 clients (1-3 minutes)
- ✅ Session cookies sauvegardées pour éviter les reconnexions

## 📊 Exemple de logs

```
2026-04-13 12:00:00 [Agent C] INFO — === Début du check Agent C ===
2026-04-13 12:00:01 [Agent C] INFO — 3 utilisateur(s) Pro à traiter
2026-04-13 12:00:02 [Agent C] INFO — Coach Pro: @coach_marie (ID: 42)
2026-04-13 12:00:03 [Agent C] INFO — 5 client(s) à vérifier pour @coach_marie
2026-04-13 12:00:10 [Agent C] INFO — Client 1/5: @client_clara
2026-04-13 12:00:15 [Agent C] INFO — Followers: 1250
2026-04-13 12:00:15 [Agent C] INFO — Following: 450
2026-04-13 12:00:16 [Agent C] INFO — 📈 +25 followers pour @client_clara
2026-04-13 12:00:16 [Agent C] INFO — Milestone créé: 1000 followers pour client 123
2026-04-13 12:00:30 [Agent C] INFO — Total de 15 client(s) vérifiés
2026-04-13 12:00:31 [Agent C] INFO — === Fin du check Agent C ===
```

## 🔒 Sécurité

### Session cookies

Les cookies de session sont sauvegardés dans :
```
session-agent-c-{INSTAGRAM_USERNAME}.json
```

⚠️ **Ne partagez jamais ce fichier** - il contient vos identifiants de session Instagram.

### Limitations

- **Max 10 clients par session** pour éviter les limitations Instagram
- **Délais aléatoires** entre chaque vérification (8-20 secondes)
- **Pauses régulières** pour simuler un comportement humain

## 🐛 Dépannage

### Problème : "Aucun utilisateur Pro avec des clients à vérifier"

**Solution** : Vérifiez que :
1. Des utilisateurs ont `subscription_tier = 'pro'`
2. Ces utilisateurs ont des clients dans la table `clients`
3. Le statut de l'abonnement est `active`

### Problème : "Erreur lors de la récupération des stats"

**Solution** :
1. Vérifiez que le compte Instagram existe
2. Vérifiez que le profil n'est pas privé
3. Vérifiez votre connexion Internet

### Problème : Session expirée

**Solution** :
1. Supprimez le fichier `session-agent-c-*.json`
2. Relancez Agent C
3. Connectez-vous manuellement dans le navigateur qui s'ouvre

## 📈 Intégration avec le Dashboard

Les données collectées par Agent C sont automatiquement disponibles dans :

- **Dashboard Pro** : Vue d'ensemble de tous les clients
- **Page Client** : Graphiques d'évolution des followers
- **Milestones** : Liste des paliers atteints

## 🔄 Workflow complet

```
1. Agent C démarre (cron : 0h, 6h, 12h, 18h)
   ↓
2. Récupère tous les utilisateurs Pro actifs
   ↓
3. Pour chaque coach Pro :
   ↓
4. Récupère ses clients
   ↓
5. Pour chaque client :
   ↓
6. Visite le profil Instagram
   ↓
7. Récupère followers + following
   ↓
8. Sauvegarde dans client_metrics
   ↓
9. Vérifie et crée les milestones
   ↓
10. Log l'évolution
```

## 📞 Support

Pour toute question ou problème :
1. Vérifiez les logs de l'agent
2. Consultez ce guide
3. Vérifiez la configuration `.env`

---

**Agent C - Suivi automatique des clients Pro** 🚀
