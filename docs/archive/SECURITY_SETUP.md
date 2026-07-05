# 🔐 Guide de Configuration Sécurité

Ce guide vous aide à démarrer avec le nouveau système d'authentification.

---

## 📋 Prérequis

1. Base de données PostgreSQL (Supabase recommandé)
2. Node.js 18+ installé
3. Fichier `.env` configuré

---

## 🚀 Démarrage Rapide

### 1. Configuration Environnement

Copiez `.env.example` vers `.env`:

```bash
cp .env.example .env
```

Éditez `.env` et configurez:

```env
# Base de données
DATABASE_URL=postgresql://postgres.xxx:password@xxx.supabase.com:6543/postgres

# Secret de session (IMPORTANT!)
SESSION_SECRET=générez-un-secret-aléatoire-ici

# Port serveur
PORT=5000
```

**Générer un SESSION_SECRET sécurisé:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Migration Base de Données

Appliquez le nouveau schéma avec `password_hash`:

```bash
npm run db:push
```

### 3. Démarrer le Serveur

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:5000`

---

## 🧪 Tester l'Authentification

### Via l'Interface Web

1. Ouvrez `http://localhost:5000`
2. Cliquez sur "Start Tracking Free" ou allez sur `/onboard`
3. Complétez le questionnaire (7 étapes)
4. Remplissez les informations d'inscription:
   - Platform: Instagram ou Facebook
   - Username: votre nom d'utilisateur
   - Email: votre email
   - Password: minimum 6 caractères
5. Vous serez automatiquement connecté et redirigé vers `/dashboard/:userId`

### Via API (cURL/Postman)

**Inscription:**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "platform": "instagram"
  }' \
  -c cookies.txt
```

**Connexion:**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' \
  -c cookies.txt
```

**Vérifier session:**

```bash
curl http://localhost:5000/api/auth/me \
  -b cookies.txt
```

**Déconnexion:**

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -b cookies.txt
```

---

## 🔒 Fonctionnalités de Sécurité

### ✅ Implémenté

- **Hashage bcrypt** - Mots de passe hashés avec 12 rounds
- **Sessions sécurisées** - Cookies HttpOnly + Secure en production
- **Rate limiting** - 5 tentatives/minute sur routes auth
- **Protection CSRF** - Cookies SameSite=lax
- **Validation inputs** - Zod schemas côté client et serveur
- **Ownership checks** - Users ne peuvent accéder qu'à leurs données
- **Session regeneration** - Protection contre session fixation
- **Auto-logout** - Sessions expirent après 7 jours

### ⚠️ À Configurer en Production

- **HTTPS** - Forcer HTTPS (cookies Secure activés)
- **CORS** - Configurer domaines autorisés
- **Helmet.js** - Headers de sécurité HTTP
- **Logs** - Monitoring des tentatives de connexion
- **Backups DB** - Sauvegardes régulières

---

## 🐛 Dépannage

### Erreur: "Non authentifié"

- Vérifiez que les cookies sont activés
- Vérifiez que `SESSION_SECRET` est défini dans `.env`
- Vérifiez que le serveur est démarré

### Erreur: "Cet email est déjà utilisé"

- L'email existe déjà en base
- Utilisez `/api/auth/login` au lieu de `/api/auth/register`

### Erreur: "Email ou mot de passe incorrect"

- Vérifiez l'email et le mot de passe
- Le mot de passe doit faire minimum 6 caractères

### Erreur: "Trop de tentatives"

- Rate limiting activé (5 tentatives/minute)
- Attendez 1 minute avant de réessayer

### Erreur DB: "column password_hash does not exist"

- Exécutez `npm run db:push` pour migrer le schéma
- Vérifiez que `DATABASE_URL` est correct

---

## 📊 Structure des Données

### Table `users`

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  avatar_url TEXT,
  is_connected BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions (MemoryStore)

Les sessions sont stockées en mémoire (MemoryStore). En production, utilisez:
- Redis (recommandé)
- PostgreSQL (connect-pg-simple)
- MongoDB (connect-mongo)

---

## 🔄 Migration depuis l'Ancien Système

Si vous avez des utilisateurs existants **sans** `password_hash`:

1. **Option 1: Reset complet**
   ```sql
   TRUNCATE users, unfollowers, followers, blockers CASCADE;
   ```

2. **Option 2: Migration manuelle**
   - Demandez aux users de se réinscrire
   - Ou créez un script de migration avec hash par défaut

---

## 📝 Routes API Disponibles

### Authentification

| Route | Méthode | Body | Description |
|-------|---------|------|-------------|
| `/api/auth/register` | POST | `{username, email, password, platform}` | Inscription |
| `/api/auth/login` | POST | `{email, password}` | Connexion |
| `/api/auth/logout` | POST | - | Déconnexion |
| `/api/auth/me` | GET | - | User courant |

### Données (protégées)

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/users/:id` | GET | ✅ | Infos user (ownership requis) |
| `/api/stats/:userId` | GET | ✅ | Stats user (ownership requis) |

---

## 🎯 Prochaines Étapes

1. ✅ **Authentification** - Terminé
2. ⏳ **Email vérification** - À implémenter
3. ⏳ **Mot de passe oublié** - À implémenter
4. ⏳ **Page Settings** - À implémenter
5. ⏳ **Monétisation (Stripe)** - À implémenter

---

## 💡 Conseils de Sécurité

### En Développement
- Utilisez `SESSION_SECRET` simple mais unique
- Les cookies Secure sont désactivés (HTTP OK)
- MemoryStore suffit

### En Production
- **OBLIGATOIRE**: `SESSION_SECRET` aléatoire de 32+ caractères
- **OBLIGATOIRE**: HTTPS activé (cookies Secure)
- **RECOMMANDÉ**: Redis pour sessions
- **RECOMMANDÉ**: Rate limiting plus strict
- **RECOMMANDÉ**: Logs d'audit
- **RECOMMANDÉ**: Monitoring (Sentry)

---

## 📞 Support

En cas de problème:
1. Vérifiez les logs serveur
2. Vérifiez la console navigateur
3. Vérifiez que la DB est accessible
4. Consultez `SECURITY_SETUP.md` (ce fichier)

---

**Dernière mise à jour**: Implémentation sécurité Phase 1
**Version**: 1.0.0
