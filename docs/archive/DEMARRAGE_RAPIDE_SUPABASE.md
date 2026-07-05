# 🚀 Démarrage Rapide avec Supabase

## ⚡ Configuration en 5 Minutes

### Étape 1: Créer le Projet Supabase (2 min)

1. Allez sur **https://supabase.com** → Sign up (gratuit)
2. Cliquez sur **"New Project"**
3. Remplissez:
   - **Name:** `Waler`
   - **Database Password:** Créez un mot de passe fort ⚠️ **NOTEZ-LE!**
   - **Region:** Choisissez la plus proche
4. **"Create new project"** → Attendez ~2 min

### Étape 2: Récupérer la Connection String (1 min)

1. Dans Supabase: **Settings** ⚙️ → **Database**
2. Section **"Connection string"** → Onglet **"Transaction"**
3. Copiez l'URL (ressemble à):
   ```
   postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
4. ⚠️ Remplacez `[YOUR-PASSWORD]` par votre mot de passe

### Étape 3: Configurer .env (1 min)

**Option A - Script automatique (Windows):**
```bash
# Double-cliquez sur:
setup-env.bat
```

**Option B - Manuel:**
```bash
# Copiez le template
copy .env.template .env

# Ouvrez avec notepad
notepad .env
```

**Dans .env, remplacez:**
```env
DATABASE_URL=postgresql://postgres.xxx:VotreMotDePasse@aws-0-region.pooler.supabase.com:6543/postgres
SESSION_SECRET=votre_secret_genere
```

**Générer SESSION_SECRET:**
```bash
node generate-secret.js
```

### Étape 4: Créer les Tables (1 min)

1. Dans Supabase: **SQL Editor** (icône </>) → **"New query"**
2. Copiez-collez ce SQL:

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  instagram_username VARCHAR(255),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'inactive',
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Followers
CREATE TABLE followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

-- Unfollowers
CREATE TABLE unfollowers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

-- Ghost Followers (Blockers)
CREATE TABLE ghost_followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  detected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, instagram_username)
);

-- Pro Clients
CREATE TABLE pro_clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX idx_followers_user_id ON followers(user_id);
CREATE INDEX idx_unfollowers_user_id ON unfollowers(user_id);
CREATE INDEX idx_ghost_followers_user_id ON ghost_followers(user_id);
CREATE INDEX idx_pro_clients_user_id ON pro_clients(user_id);
```

3. Cliquez **"Run"** (F5)
4. Vérifiez: **Table Editor** → Vous devez voir 5 tables

### Étape 5: Démarrer l'Application (30 sec)

```bash
npm run dev
```

**Vous devriez voir:**
```
🗄️  Connecting to PostgreSQL (Supabase)...
[express] serving on port 5000
```

**Ouvrez:** http://localhost:5000

---

## ✅ Checklist de Vérification

- [ ] Projet Supabase créé
- [ ] Connection string copiée
- [ ] Fichier `.env` créé avec DATABASE_URL
- [ ] SESSION_SECRET généré et ajouté
- [ ] Tables créées dans Supabase
- [ ] Serveur démarré sans erreur
- [ ] Application accessible sur http://localhost:5000

---

## 🆘 Problèmes Courants

### ❌ "DATABASE_URL is not set"
→ Le fichier `.env` n'existe pas ou DATABASE_URL est vide  
→ Exécutez `setup-env.bat` ou créez `.env` manuellement

### ❌ "getaddrinfo ENOTFOUND"
→ Vérifiez votre connexion internet  
→ Vérifiez que l'URL Supabase est correcte dans `.env`

### ❌ "password authentication failed"
→ Le mot de passe dans DATABASE_URL est incorrect  
→ Vérifiez que vous avez remplacé `[YOUR-PASSWORD]`

### ❌ "relation 'users' does not exist"
→ Vous n'avez pas créé les tables  
→ Exécutez le script SQL de l'Étape 4

---

## 📚 Documentation Complète

Pour plus de détails, consultez:
- **SUPABASE_SETUP.md** - Guide complet
- **.env.template** - Template de configuration
- **RESUME_CORRECTIONS_COMPLET.md** - Historique des corrections

---

## 🎉 C'est Tout!

Votre application Waler est maintenant connectée à Supabase!

**Profitez de l'application!** 🚀

---

## 📊 Avantages Supabase

✅ **Gratuit** - 500 MB, 2 GB transfert/mois  
✅ **Scalable** - Supporte des milliers d'utilisateurs  
✅ **Backups** - Sauvegardes automatiques  
✅ **Dashboard** - Interface graphique  
✅ **Monitoring** - Statistiques en temps réel  

**Dashboard Supabase:** https://supabase.com/dashboard
