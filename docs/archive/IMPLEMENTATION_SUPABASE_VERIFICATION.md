# 🗄️ Implémentation Supabase pour Codes de Vérification

## ✅ Changements implémentés

### 1. **Base de données Supabase**

**Table `verification_codes` créée** :
- `id` : Identifiant unique
- `code` : Code à 6 chiffres (unique)
- `instagram_username` : Username Instagram de l'utilisateur
- `user_id` : Référence à l'utilisateur (optionnel)
- `expires_at` : Date d'expiration (15 minutes)
- `used` : Booléen si le code a été utilisé
- `created_at` : Date de création
- `used_at` : Date d'utilisation

**Fichiers** :
- `db/migrations/add_verification_codes_table.sql` - Migration SQL
- `shared/schema.ts` - Schéma Drizzle ORM

---

### 2. **Fonctions de gestion des codes**

**Fichier** : `server/verification-codes.ts`

**Fonctions** :
- `createVerificationCode(instagramUsername, userId?)` - Crée un code unique dans Supabase
- `verifyCode(code)` - Vérifie et consomme un code
- `getLatestCodeForUser(instagramUsername)` - Récupère le dernier code non utilisé
- `cleanupExpiredCodes()` - Nettoie les codes expirés

---

### 3. **Bot Waler optimisé**

**Fichier** : `server/waler-bot-playwright.ts`

**Améliorations** :
- ✅ **Vérification de l'utilisateur** : Le bot vérifie que l'utilisateur existe dans la DB avant d'envoyer un code
- ✅ **Stockage Supabase** : Les codes sont stockés dans Supabase au lieu de la mémoire
- ✅ **Extraction du username** : Nouvelle méthode `extractInstagramUsername()` pour identifier l'utilisateur
- ✅ **Ciblé et propre** : Le bot ne spam plus, il va directement dans `/direct/inbox/` et `/direct/requests/`
- ✅ **Message d'erreur** : Si l'utilisateur n'existe pas, le bot envoie un message explicatif

**Flux du bot** :
1. Va sur `/direct/requests/` et `/direct/inbox/`
2. Détecte les nouveaux messages
3. Extrait le username Instagram de l'expéditeur
4. Vérifie si cet utilisateur existe dans la DB
5. Si oui → Génère un code dans Supabase et l'envoie
6. Si non → Envoie un message d'erreur

---

### 4. **API mise à jour**

**Route** : `POST /api/verification/verify-code`

**Changements** :
- Utilise Supabase au lieu de la mémoire du bot
- Ne nécessite plus le `username`, juste le `code`
- Retourne `{ valid, instagramUsername, message }`

---

### 5. **Configuration**

**Fichier** : `.env`

**Variables** :
```env
AGENT_WALER_INSTAGRAM_USER=waler.web
AGENT_WALER_INSTAGRAM_PASS=Instawebsite1er2026
VITE_WALER_INSTAGRAM_USER=waler.web
```

---

## 🎯 Flux complet

### **Côté utilisateur** :

1. **Onboarding** : L'utilisateur entre son username Instagram
2. **Vérification compte** : L'API vérifie que le compte existe
3. **Follow @waler** : L'utilisateur suit @waler.web
4. **Envoi message** : L'utilisateur envoie un message à @waler.web sur Instagram
5. **Réception code** : Le bot détecte le message, vérifie que l'utilisateur existe dans la DB, génère un code dans Supabase et l'envoie
6. **Vérification** : L'utilisateur entre le code sur le site
7. **Validation** : L'API vérifie le code dans Supabase et le marque comme utilisé

### **Côté bot** :

1. **Écoute** : Vérifie les messages toutes les 30 secondes
2. **Détection** : Trouve un nouveau message
3. **Extraction** : Extrait le username Instagram de l'expéditeur
4. **Vérification DB** : Vérifie si l'utilisateur existe dans `users` table
5. **Génération** : Crée un code unique dans Supabase
6. **Envoi** : Envoie le code via DM Instagram
7. **Logging** : Log toutes les actions pour debug

---

## 🔧 Prochaines étapes

### **1. Exécuter la migration**

```bash
npm run db:push
```

Ou manuellement dans Supabase SQL Editor :
```sql
-- Copier le contenu de db/migrations/add_verification_codes_table.sql
```

### **2. Redémarrer le serveur**

```bash
npm run dev
```

### **3. Démarrer le bot Waler**

```powershell
Invoke-WebRequest -Uri http://localhost:5000/api/admin/waler-bot/start -Method POST -UseBasicParsing
```

### **4. Tester le flux**

1. Aller sur l'onboarding
2. Entrer un username Instagram
3. Suivre @waler.web
4. Envoyer un message à @waler.web
5. Récupérer le code
6. Entrer le code sur le site

---

## 📊 Avantages

✅ **Persistance** : Les codes survivent aux redémarrages du bot  
✅ **Sécurité** : Vérification que l'utilisateur existe avant d'envoyer  
✅ **Traçabilité** : Tous les codes sont loggés dans Supabase  
✅ **Scalabilité** : Peut gérer plusieurs instances du bot  
✅ **Fiabilité** : Pas de perte de codes en mémoire  
✅ **Ciblé** : Le bot ne spam plus, il est intelligent  

---

## 🐛 Debug

**Voir les logs du bot** :
- `🔍 Found X thread(s) in requests`
- `👤 Instagram username: @username`
- `✅ User @username found in database`
- `🎲 Generated code: 123456 for @username`
- `✅ Sent verification code to @username: 123456`

**Voir les logs de vérification** :
- `✅ Code 123456 verified for @username`
- `❌ Code 123456 not found, already used, or expired`

---

## ⚠️ Important

- Le compte `waler.web` doit être connecté manuellement dans Chrome
- Le bot doit rester actif (ne pas fermer Chrome)
- Les codes expirent après 15 minutes
- Chaque code ne peut être utilisé qu'une seule fois
