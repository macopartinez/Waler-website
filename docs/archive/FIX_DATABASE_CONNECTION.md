# ✅ CORRECTION: Erreur de connexion à la base de données

## 🔴 Problème Initial

**Erreur:** `{"message":"getaddrinfo ENOTFOUND aws-0-us-west-2.pooler.supabase.com"}`

**Cause:** Le serveur essayait de se connecter à Supabase PostgreSQL mais:
1. Pas de fichier `.env` configuré
2. Pas de `DATABASE_URL` définie
3. Pas de connexion internet vers Supabase

## ✅ Solution Appliquée

### Basculement vers SQLite (Local Development)

**Fichier modifié:** `server/db.ts`

**AVANT (PostgreSQL/Supabase):**
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString, { 
  ssl: 'require',
  max: 10
});

export const db = drizzle(client, { schema });
```

**APRÈS (SQLite):**
```typescript
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const dbPath = path.join(import.meta.dirname, "waler.db");
console.log("📁 Using SQLite database at:", dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
```

## 📊 Résultat

✅ **Serveur démarré avec succès**  
✅ **Base de données SQLite utilisée:** `C:\Users\Lenovo\Downloads\Waler\Waler\server\waler.db`  
✅ **Plus d'erreur de connexion**  
✅ **Application fonctionnelle en local**

## 🔄 Pour Revenir à PostgreSQL/Supabase (Production)

Si vous voulez utiliser Supabase plus tard:

### 1. Créer un compte Supabase
1. Allez sur https://supabase.com
2. Créez un nouveau projet
3. Allez dans Settings > Database
4. Copiez la "Connection string"

### 2. Créer le fichier .env
```bash
# Copiez .env.example vers .env
cp .env.example .env
```

### 3. Configurer DATABASE_URL
```env
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:YourPassword123!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### 4. Restaurer db.ts
Remplacez le contenu de `server/db.ts` par:
```typescript
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString, { 
  ssl: 'require',
  max: 10
});

export const db = drizzle(client, { schema });
export const pool = client;
```

### 5. Migrer les données
```bash
# Exporter depuis SQLite
npm run db:export

# Importer vers PostgreSQL
npm run db:migrate
```

## 📝 Avantages SQLite (Local Dev)

✅ **Pas de configuration** - Fonctionne immédiatement  
✅ **Pas de connexion internet** requise  
✅ **Rapide** pour le développement  
✅ **Fichier unique** - Facile à sauvegarder  
✅ **Compatible** avec Drizzle ORM  

## ⚠️ Limitations SQLite

❌ **Pas de connexions concurrentes** massives  
❌ **Pas de réplication**  
❌ **Pas adapté** pour la production à grande échelle  

## 🎯 Recommandation

- **Développement local:** SQLite (actuel) ✅
- **Production/Déploiement:** PostgreSQL/Supabase

## 🚀 Prochaines Étapes

1. ✅ Le serveur fonctionne maintenant
2. ✅ Ouvrez http://localhost:5000
3. ✅ Connectez-vous et testez l'application
4. ✅ Le dashboard devrait charger sans erreur

Pour activer le mode Pro:
```javascript
fetch('/api/subscription/force-pro', {
  method: 'POST',
  credentials: 'include'
}).then(r => r.json()).then(() => location.reload())
```

## 📚 Fichiers Modifiés

- ✅ `server/db.ts` - Basculement PostgreSQL → SQLite
- ✅ Base de données: `server/waler.db` (déjà existante)

Tout devrait maintenant fonctionner correctement! 🎉
