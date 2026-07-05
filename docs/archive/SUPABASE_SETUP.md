# 🗄️ Configuration Supabase PostgreSQL

## ✅ L'application utilise maintenant Supabase!

Le fichier `server/db.ts` a été configuré pour utiliser PostgreSQL via Supabase.

---

## 📋 Étapes de Configuration

### 1. Créer un Projet Supabase

1. Allez sur **https://supabase.com**
2. Créez un compte (gratuit)
3. Cliquez sur **"New Project"**
4. Remplissez:
   - **Name:** Waler (ou votre nom)
   - **Database Password:** Créez un mot de passe fort (NOTEZ-LE!)
   - **Region:** Choisissez la plus proche (ex: Europe West)
5. Cliquez sur **"Create new project"**
6. Attendez ~2 minutes que le projet soit créé

### 2. Récupérer la Connection String

1. Dans votre projet Supabase, allez dans **Settings** (⚙️)
2. Cliquez sur **Database** dans le menu de gauche
3. Scrollez jusqu'à **"Connection string"**
4. Sélectionnez l'onglet **"Transaction"** ou **"Session"**
5. Copiez l'URL qui ressemble à:
   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
6. **IMPORTANT:** Remplacez `[YOUR-PASSWORD]` par le mot de passe que vous avez créé à l'étape 1

### 3. Créer le Fichier .env

Dans le dossier `Waler`, créez un fichier nommé `.env` (sans extension):

**Windows (PowerShell):**
```powershell
cd c:\Users\Lenovo\Downloads\Waler\Waler
New-Item -Path .env -ItemType File
notepad .env
```

**Ou créez-le manuellement** avec l'explorateur de fichiers.

### 4. Configurer le .env

Copiez ce contenu dans votre fichier `.env` et **remplacez les valeurs**:

```env
# ==============================================
# DATABASE - SUPABASE POSTGRESQL
# ==============================================
# Remplacez par votre connection string Supabase
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:VotreMotDePasse123!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# ==============================================
# SERVER
# ==============================================
PORT=5000
SESSION_SECRET=change-this-to-a-random-secret-in-production

# ==============================================
# INSTAGRAM AGENTS (Optionnel pour l'instant)
# ==============================================
AGENT_A_INSTAGRAM_USER=your_instagram_username
AGENT_A_INSTAGRAM_PASS=your_instagram_password
VITE_AGENT_A_INSTAGRAM_USER=your_instagram_username

AGENT_B_INSTAGRAM_USER=your_second_instagram_username
AGENT_B_INSTAGRAM_PASS=your_second_instagram_password
VITE_AGENT_B_INSTAGRAM_USER=your_second_instagram_username

# ==============================================
# STRIPE (Optionnel - pour les paiements)
# ==============================================
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

STRIPE_PRICE_BASE_MONTHLY=price_xxx_base_monthly
STRIPE_PRICE_BASE_YEARLY=price_xxx_base_yearly
STRIPE_PRICE_PRO_MONTHLY=price_xxx_pro_monthly
STRIPE_PRICE_PRO_YEARLY=price_xxx_pro_yearly
```

**⚠️ IMPORTANT:** Remplacez au minimum `DATABASE_URL` avec votre vraie connection string!

### 5. Créer les Tables dans Supabase

1. Dans Supabase, allez dans **SQL Editor** (icône </> dans le menu)
2. Cliquez sur **"New query"**
3. Exécutez ce script pour créer les tables:

```sql
-- Créer les tables nécessaires
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  instagram_username VARCHAR(255),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'inactive',
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

CREATE TABLE IF NOT EXISTS unfollowers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

CREATE TABLE IF NOT EXISTS ghost_followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

CREATE TABLE IF NOT EXISTS pro_clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Créer des index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_followers_user_id ON followers(user_id);
CREATE INDEX IF NOT EXISTS idx_unfollowers_user_id ON unfollowers(user_id);
CREATE INDEX IF NOT EXISTS idx_ghost_followers_user_id ON ghost_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_clients_user_id ON pro_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_users_instagram ON users(instagram_username);
```

4. Cliquez sur **"Run"** (ou F5)
5. Vérifiez qu'il n'y a pas d'erreurs

### 6. Démarrer le Serveur

```bash
cd c:\Users\Lenovo\Downloads\Waler\Waler
npm run dev
```

Vous devriez voir:
```
🗄️  Connecting to PostgreSQL (Supabase)...
10:25:18 AM [express] serving on port 5000
```

---

## ✅ Vérification

### Test de Connexion

Ouvrez votre navigateur et allez sur:
```
http://localhost:5000/api/health
```

Si tout fonctionne, vous devriez voir un message de succès.

### Vérifier les Tables

Dans Supabase:
1. Allez dans **Table Editor**
2. Vous devriez voir toutes vos tables: `users`, `followers`, `unfollowers`, etc.

---

## 🔄 Migration depuis SQLite (Optionnel)

Si vous aviez des données dans SQLite (`server/waler.db`), vous pouvez les migrer:

### 1. Exporter depuis SQLite

```bash
# Installer sqlite3
npm install -g sqlite3

# Exporter les données
sqlite3 server/waler.db .dump > backup.sql
```

### 2. Adapter le SQL pour PostgreSQL

Le fichier `backup.sql` devra être adapté car SQLite et PostgreSQL ont des syntaxes différentes.

### 3. Importer dans Supabase

1. Ouvrez `backup.sql`
2. Copiez les `INSERT` statements
3. Collez-les dans le SQL Editor de Supabase
4. Exécutez

---

## 🎯 Avantages de Supabase

✅ **Scalable** - Supporte des milliers d'utilisateurs  
✅ **Backups automatiques** - Vos données sont sauvegardées  
✅ **Dashboard** - Interface graphique pour gérer les données  
✅ **API REST automatique** - Bonus si vous en avez besoin  
✅ **Authentification** - Système d'auth intégré (optionnel)  
✅ **Gratuit** - 500 MB de stockage, 2 GB de transfert/mois  

---

## 🆘 Dépannage

### Erreur: "DATABASE_URL is not set"
→ Vérifiez que le fichier `.env` existe et contient `DATABASE_URL`

### Erreur: "getaddrinfo ENOTFOUND"
→ Vérifiez votre connexion internet  
→ Vérifiez que l'URL Supabase est correcte

### Erreur: "password authentication failed"
→ Vérifiez que vous avez remplacé `[YOUR-PASSWORD]` par votre vrai mot de passe

### Erreur: "relation does not exist"
→ Vous n'avez pas créé les tables, exécutez le script SQL de l'étape 5

---

## 📚 Ressources

- **Documentation Supabase:** https://supabase.com/docs
- **Dashboard Supabase:** https://supabase.com/dashboard
- **Support Supabase:** https://supabase.com/support

---

## 🎉 C'est Tout!

Votre application Waler utilise maintenant Supabase PostgreSQL!

**Prochaines étapes:**
1. ✅ Créez votre projet Supabase
2. ✅ Configurez le `.env`
3. ✅ Créez les tables
4. ✅ Démarrez le serveur
5. ✅ Profitez de l'application!

**Bon développement!** 🚀
