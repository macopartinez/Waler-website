# ⚡ Waler - Démarrage Rapide

## 🎯 En 4 Étapes

### 1️⃣ Installer les Dépendances

```bash
# Node.js
npm install

# Python
pip install -r requirements.txt
playwright install chromium
```

### 2️⃣ Configurer Supabase (Base de Données)

1. Créer un compte sur [supabase.com](https://supabase.com)
2. Créer un nouveau projet
3. Aller dans **SQL Editor** et exécuter le SQL suivant :

```sql
-- Tables déjà définies dans shared/schema.ts
-- Utilisez: npm run db:push
-- Ou créez manuellement les tables users, unfollowers, followers, blockers
```

4. Copier l'URL de connexion (Settings > Database)

### 3️⃣ Configurer le Fichier `.env`

```bash
copy .env.example .env
```

Puis éditer `.env` avec :
- Votre URL Supabase
- Vos identifiants Instagram (2 comptes différents pour Agent A et B)

### 4️⃣ Démarrer l'Application

**Option 1 - Tout démarrer** :
```bash
start-all.bat
```

**Option 2 - Démarrage manuel** :
```bash
# Terminal 1 - Serveur Web
npm run dev

# Terminal 2 - Agent A
python agent_a.py

# Terminal 3 - Agent B
python agent_b.py
```

## ✅ Accès

Ouvrez votre navigateur : **http://localhost:5000**

## 📋 Checklist

- [ ] Node.js 18+ installé
- [ ] Python 3.10+ installé
- [ ] Compte Supabase créé
- [ ] Tables créées dans Supabase
- [ ] Fichier `.env` configuré
- [ ] 2 comptes Instagram (pour Agent A et B)

## 🤖 Fonctionnement des Agents

- **Agent A** : Détecte les unfollows automatiquement (4h, 10h, 16h, 22h)
- **Agent B** : Vérifie si les comptes sont bloqués ou supprimés

## 📚 Documentation

- `replit.md` - Architecture complète du projet
- `.env.example` - Configuration détaillée

---

**Besoin d'aide ?** Consultez la documentation Supabase ou les fichiers de configuration.
