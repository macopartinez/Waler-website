# 🔐 Authentification 2FA - Guide Complet

Ce guide explique comment fonctionne l'authentification à double facteur (2FA) via Instagram/Facebook dans Waler.

---

## 📋 Vue d'ensemble

Waler utilise une authentification 2FA obligatoire où l'utilisateur doit:
1. S'inscrire avec email + mot de passe + @username Instagram/Facebook
2. Envoyer un code de vérification à @waler_official
3. Entrer le code reçu en réponse dans l'application

### Sécurité
- ✅ Le code inclut le @username de l'utilisateur
- ✅ L'agent vérifie que l'expéditeur correspond au @username
- ✅ Protection contre l'usurpation d'identité
- ✅ Codes expirent après 15 minutes
- ✅ Maximum 5 tentatives de vérification

---

## 🚀 Configuration

### 1. Variables d'environnement

Ajoutez dans votre `.env`:

```env
# Compte Instagram/Facebook officiel pour la vérification
WALER_OFFICIAL_USER=waler_official
WALER_OFFICIAL_PASS=votre_mot_de_passe_instagram

# Chemin de la base de données (optionnel)
DB_PATH=waler.db
```

### 2. Installer les dépendances Python

```bash
pip install instagrapi python-dotenv
```

### 3. Migrer la base de données

```bash
npm run db:push
```

Cela ajoutera les colonnes nécessaires:
- `is_verified` - Compte vérifié ou non
- `verification_code` - Code à envoyer (ex: VERIFY-ABC123-@username)
- `verification_token` - Code à 6 chiffres attendu
- `verification_token_expiry` - Date d'expiration
- `verification_attempts` - Nombre de tentatives

---

## 🤖 Démarrer l'agent de vérification

L'agent Python écoute les messages sur @waler_official et répond automatiquement.

```bash
python agent_verification.py
```

**Sortie attendue:**
```
🚀 Démarrage de l'agent de vérification Waler...
🔐 Connexion à Instagram en tant que @waler_official...
✅ Connecté avec succès!
💾 Connexion à la base de données waler.db...
✅ Base de données connectée!
✅ Agent démarré! Vérification toutes les 10s
📱 En attente de messages de vérification...
==================================================
```

### Logs de l'agent

Quand un message est reçu:
```
📨 Code reçu: VERIFY-ABC123-@john_doe
👤 Expéditeur: @john_doe
🎯 Attendu: @john_doe
✅ Token trouvé: 847291
```

En cas d'erreur de sécurité:
```
📨 Code reçu: VERIFY-ABC123-@john_doe
👤 Expéditeur: @fake_account
🎯 Attendu: @john_doe
⚠️  Erreur de sécurité détectée!
```

---

## 🔄 Flux utilisateur complet

### 1. Inscription

```
User → Formulaire d'inscription
├─ Username: john_doe
├─ Email: john@example.com
├─ Password: ******
└─ Platform: Instagram

Backend → Crée le compte (non vérifié)
Backend → Génère code: VERIFY-ABC123-@john_doe
Backend → Retourne { user, verificationCode, verificationRequired: true }

Frontend → Redirige vers /verification
```

### 2. Page de vérification - Étape 1

```
┌─────────────────────────────────────┐
│  🔐 Vérifiez votre compte           │
│                                     │
│  Envoyez ce code à @waler_official  │
│  depuis votre compte @john_doe:     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  VERIFY-ABC123-@john_doe    │   │
│  │                       [📋]  │   │
│  └─────────────────────────────┘   │
│                                     │
│  ⚠️ Vous devez envoyer depuis       │
│  @john_doe, sinon ça échouera       │
│                                     │
│  [Ouvrir Instagram]                 │
│  [J'ai envoyé le message]           │
│                                     │
│  Code expire dans: 14:32            │
└─────────────────────────────────────┘
```

### 3. Agent Python traite le message

```python
# User envoie: "VERIFY-ABC123-@john_doe"

Agent:
1. Détecte le format VERIFY-XXXXXX-@username
2. Extrait: code_id="ABC123", expected_username="john_doe"
3. Récupère sender_username = "john_doe" (via Instagram API)
4. Vérifie: sender_username == expected_username ✅
5. Cherche dans DB: SELECT verification_token WHERE verification_code = "VERIFY-ABC123-@john_doe"
6. Trouve: token = "847291"
7. Répond: "✅ Code vérifié! Votre code: 847291"
```

### 4. Page de vérification - Étape 2

```
┌─────────────────────────────────────┐
│  ✅ Entrez le code reçu             │
│                                     │
│  Waler vous a répondu avec un code  │
│  à 6 chiffres                       │
│                                     │
│  ┌─┬─┬─┬─┬─┬─┐                      │
│  │8│4│7│2│9│1│                      │
│  └─┴─┴─┴─┴─┴─┘                      │
│                                     │
│  [Vérifier]                         │
│  [Renvoyer un nouveau code]         │
└─────────────────────────────────────┘
```

### 5. Vérification finale

```
Frontend → POST /api/auth/verification/verify
           { userId: 1, code: "847291" }

Backend:
1. Vérifie que code == user.verification_token
2. Vérifie expiration (< 15 min)
3. Vérifie tentatives (< 5)
4. Si OK: Met à jour user.is_verified = true
5. Retourne: { success: true }

Frontend → Redirige vers /dashboard/1
```

---

## 🛡️ Sécurité

### Protection contre l'usurpation

**Scénario d'attaque:**
```
Attaquant (@fake_account) essaie d'utiliser le code de @john_doe
```

**Réponse de l'agent:**
```
❌ Erreur de sécurité

Ce code appartient à @john_doe, pas à @fake_account.

Si c'est votre compte, vérifiez que vous avez copié le bon code.
```

### Expiration

- Code valide pendant **15 minutes**
- Après expiration: "Code expiré. Demandez un nouveau code."
- L'utilisateur peut cliquer sur "Renvoyer un nouveau code"

### Limite de tentatives

- Maximum **5 tentatives** de vérification
- Après 5 échecs: "Trop de tentatives. Demandez un nouveau code."
- Compteur reset quand nouveau code généré

---

## 🧪 Tests

### Test 1: Inscription et vérification réussie

```bash
# 1. S'inscrire
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "email": "test@example.com",
    "password": "password123",
    "platform": "instagram"
  }' \
  -c cookies.txt

# Réponse attendue:
{
  "user": { "id": 1, "username": "test_user", "isVerified": false, ... },
  "verificationCode": "VERIFY-ABC123-@test_user",
  "verificationRequired": true
}

# 2. Envoyer message Instagram
# Manuellement: Envoyer "VERIFY-ABC123-@test_user" à @waler_official

# 3. Agent répond avec code (ex: "847291")

# 4. Vérifier le code
curl -X POST http://localhost:5000/api/auth/verification/verify \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": 1,
    "code": "847291"
  }'

# Réponse attendue:
{ "success": true, "message": "Compte vérifié avec succès !" }
```

### Test 2: Erreur de sécurité

```bash
# User A s'inscrit avec @user_a
# User B essaie d'utiliser le code de User A

# Agent détecte:
sender_username = "user_b"
expected_username = "user_a"

# Répond:
"❌ Ce code appartient à @user_a, pas à @user_b"
```

### Test 3: Code expiré

```bash
# Attendre 15 minutes après génération du code

curl -X POST http://localhost:5000/api/auth/verification/verify \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{ "userId": 1, "code": "847291" }'

# Réponse:
{ "success": false, "message": "Code expiré. Demandez un nouveau code." }
```

---

## 🔧 Dépannage

### Problème: Agent ne démarre pas

**Erreur:** `Login required`

**Solution:**
1. Vérifiez `WALER_OFFICIAL_USER` et `WALER_OFFICIAL_PASS` dans `.env`
2. Essayez de vous connecter manuellement sur Instagram
3. Vérifiez que le compte n'est pas bloqué

### Problème: Messages non détectés

**Cause possible:** L'agent vérifie toutes les 10 secondes

**Solution:** Attendez jusqu'à 10 secondes après l'envoi du message

### Problème: "Code invalide ou expiré"

**Causes possibles:**
1. Code mal copié (vérifiez les espaces)
2. Code expiré (> 15 min)
3. Code déjà utilisé
4. Mauvais format (doit être VERIFY-XXXXXX-@username)

**Solution:** Cliquez sur "Renvoyer un nouveau code"

### Problème: "Trop de tentatives"

**Cause:** 5 mauvais codes entrés

**Solution:** Cliquez sur "Renvoyer un nouveau code" (reset le compteur)

---

## 📊 API Routes

### POST /api/auth/verification/generate

Génère un nouveau code de vérification.

**Headers:** Cookie avec session

**Response:**
```json
{
  "verificationCode": "VERIFY-ABC123-@username",
  "username": "username",
  "expiresAt": "2024-01-15T10:30:00.000Z"
}
```

### POST /api/auth/verification/verify

Vérifie le code entré par l'utilisateur.

**Body:**
```json
{
  "userId": 1,
  "code": "847291"
}
```

**Response (succès):**
```json
{
  "success": true,
  "message": "Compte vérifié avec succès !"
}
```

**Response (échec):**
```json
{
  "success": false,
  "message": "Code incorrect. 3 tentatives restantes."
}
```

### POST /api/auth/verification/resend

Régénère un nouveau code (si expiré ou tentatives épuisées).

**Headers:** Cookie avec session

**Response:** Identique à `/generate`

---

## 🚨 Limitations et Considérations

### Instagram API

- **Risque de ban:** Instagram peut bloquer le compte @waler_official si trop de messages
- **Solution:** Utiliser un compte dédié, ne pas abuser
- **Alternative:** Passer à l'API officielle Instagram Business (nécessite validation Meta)

### Scalabilité

- **Agent unique:** Un seul agent peut gérer ~100 vérifications/heure
- **Solution scale:** Utiliser plusieurs comptes @waler_official_1, @waler_official_2, etc.

### Disponibilité

- **Agent 24/7:** L'agent doit tourner en permanence
- **Solution:** Déployer sur un serveur (Heroku, AWS, etc.)
- **Fallback:** Ajouter vérification manuelle admin si agent down

---

## 🎯 Prochaines Améliorations

- [ ] Support Facebook Messenger (en plus d'Instagram)
- [ ] Interface admin pour validation manuelle
- [ ] Webhooks Instagram Business API
- [ ] Multi-agents pour scalabilité
- [ ] Monitoring et alertes (Sentry)
- [ ] Logs d'audit des vérifications

---

**Dernière mise à jour:** Implémentation 2FA Phase 1
**Version:** 1.0.0
