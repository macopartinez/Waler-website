# 🚀 Guide de Démarrage Rapide - Système de Classification

Ce guide vous permet de lancer le système de classification intelligente en **5 minutes** !

## ✅ Prérequis

- Node.js 18+ installé
- SQLite installé
- Chrome/Brave/Edge (navigateur Chromium)
- Compte Instagram actif

## 📦 Installation

### 1. Initialiser la Base de Données

```bash
# Depuis la racine du projet
cd scripts
npm run init-classification-db
```

Vous devriez voir :
```
🔧 Initialisation du système de classification...
📊 Création des tables de classification...
✅ Tables de classification créées
💬 Création des tables DMs...
✅ Tables DMs créées
✨ Initialisation terminée avec succès!
```

### 2. Installer les Dépendances

```bash
# Extension
cd waler-extension
npm install

# Client (si pas déjà fait)
cd ../client
npm install recharts
```

### 3. Build l'Extension

```bash
cd waler-extension
npm run build
```

### 4. Charger l'Extension dans Chrome

1. Ouvrir Chrome et aller à `chrome://extensions/`
2. Activer le **Mode développeur** (toggle en haut à droite)
3. Cliquer sur **Charger l'extension non empaquetée**
4. Sélectionner le dossier `waler-extension/dist/`
5. L'extension Waler devrait apparaître dans la liste

### 5. Lancer le Serveur

```bash
# Terminal 1 : Backend
cd server
npm run dev

# Terminal 2 : Frontend
cd client
npm run dev
```

## 🎯 Utilisation

### Étape 1 : Se Connecter

1. Ouvrir Waler dans le navigateur
2. Se connecter avec votre compte
3. Aller sur Instagram (dans le même navigateur)
4. L'extension détecte automatiquement votre session

### Étape 2 : Activer la Collecte

1. Cliquer sur l'icône de l'extension Waler
2. Cliquer sur "Activer la collecte"
3. L'extension commence à tracker vos interactions

### Étape 3 : Consulter le Dashboard

1. Dans Waler, naviguer vers `/classification`
2. Vous verrez le dashboard avec 4 onglets :
   - **Suggestions** : Validez les classifications proposées
   - **Conversations** : Consultez vos DMs Instagram
   - **Scores** : Analysez les scores de vos contacts
   - **Statistiques** : Visualisez les graphiques

### Étape 4 : Valider les Suggestions

1. Aller dans l'onglet "Suggestions"
2. Pour chaque suggestion :
   - Lire la raison et les preuves
   - Cliquer "Accepter" ou "Rejeter"
3. Les contacts sont automatiquement classifiés

## 🔍 Vérification

### Vérifier que tout fonctionne

**1. Extension active**
```
- Icône Waler visible dans la barre d'outils
- Badge avec nombre de suggestions (si > 0)
- Popup affiche les stats
```

**2. Collecte DMs**
```
- Ouvrir Instagram
- Aller dans les DMs
- Console extension : "💬 DM interceptor started"
- Console extension : "💬 New DM from @username"
```

**3. Backend**
```
- Console serveur : "✅ DMs synced: X messages"
- Console serveur : "📊 Contact score updated"
- Console serveur : "💡 Suggestion created"
```

**4. Dashboard**
```
- Stats affichées (suggestions, contacts, etc.)
- Onglets fonctionnels
- Graphiques visibles
```

## 🐛 Dépannage

### L'extension ne se charge pas

**Problème** : Erreur lors du chargement
**Solution** :
```bash
cd waler-extension
rm -rf dist node_modules
npm install
npm run build
```

### Pas de suggestions

**Problème** : Aucune suggestion n'apparaît
**Causes possibles** :
1. Pas assez de DMs collectés (attendez quelques minutes)
2. Scores trop bas (< 40/100)
3. Extension pas connectée au backend

**Solution** :
- Vérifier les logs de la console extension
- Vérifier que l'API token est présent dans le storage
- Envoyer/recevoir quelques DMs sur Instagram

### Erreur "Cannot find module"

**Problème** : Module manquant
**Solution** :
```bash
# Extension
cd waler-extension
npm install webextension-polyfill

# Client
cd client
npm install recharts
```

### Tables BDD manquantes

**Problème** : Erreur SQL "no such table"
**Solution** :
```bash
cd scripts
npm run init-classification-db
```

## 📊 Données de Test

Pour tester rapidement, vous pouvez insérer des données de test :

```sql
-- Ouvrir waler.db
sqlite3 server/waler.db

-- Insérer un contact de test
INSERT INTO contact_scores (
  user_id, contact_username, dm_score, engagement_score,
  activity_score, seniority_score, reciprocity_score, total_score,
  current_category
) VALUES (
  1, 'test_user', 20, 15, 10, 5, 8, 58, 'lead'
);

-- Insérer une suggestion de test
INSERT INTO classification_suggestions (
  user_id, contact_username, from_category, to_category,
  score, confidence, reason, evidence, status
) VALUES (
  1, 'test_user', 'lead', 'prospect',
  58, 0.85, 'Intention commerciale détectée',
  '["Mots-clés: intéressé, prix"]', 'pending'
);
```

## 🎓 Tutoriel Vidéo

*(À créer)*

1. Installation de l'extension
2. Configuration initiale
3. Utilisation du dashboard
4. Validation des suggestions

## 📚 Documentation Complète

Pour plus de détails, consultez :
- `CLASSIFICATION_SYSTEM_READY.md` - Architecture du système
- `DM_COLLECTION_READY.md` - Collecte des DMs
- `SERVICE_WORKER_COMPLETE.md` - Service worker
- `DASHBOARD_COMPLETE.md` - Dashboard

## ✨ Prochaines Étapes

Une fois le système fonctionnel :

1. **Personnaliser les mots-clés** dans `dm-analyzer.ts`
2. **Ajuster les seuils de scoring** dans `scoring-engine.ts`
3. **Configurer les notifications** dans `classification-manager.ts`
4. **Ajouter des règles personnalisées** selon vos besoins

## 🆘 Support

En cas de problème :
1. Vérifier les logs (console extension + serveur)
2. Consulter la section Dépannage ci-dessus
3. Vérifier que toutes les dépendances sont installées
4. Relancer l'extension et le serveur

## 🎉 Félicitations !

Votre système de classification intelligente est maintenant opérationnel ! 🚀

Les contacts seront automatiquement analysés et classifiés en fonction de leurs interactions avec vous.
