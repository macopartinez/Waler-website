# 🎯 Waler - Configuration Premium

## ✅ Utilisateur Premium Créé

Un utilisateur premium a été créé avec succès dans la base de données !

### 🔑 Identifiants de connexion

- **Email:** `premium@waler.com`
- **Mot de passe:** `premium123`
- **Plan:** Premium (actif)
- **Période d'essai:** 30 jours
- **Abonnement valide jusqu'à:** 1 an

---

## 📝 Scripts disponibles

### 🚀 Méthode recommandée (Windows)
```bash
set_premium.bat
```
Lance un menu interactif avec toutes les options disponibles.

### 1. Créer rapidement un utilisateur premium
```bash
python quick_premium.py
```
Crée instantanément un utilisateur premium avec les identifiants par défaut.

### 2. Créer un utilisateur personnalisé
```bash
python create_premium_user.py
```
Permet de créer un utilisateur avec vos propres identifiants (interactif).

### 3. Mettre à niveau VOTRE compte
```bash
python set_my_premium.py
```
**Recommandé si vous avez déjà un compte !**
Met à niveau votre compte existant vers Premium/Pro en utilisant votre email.

### 4. Mettre à niveau par ID utilisateur
```bash
python upgrade_to_premium.py
```
Met à niveau un utilisateur existant vers Premium ou Pro en utilisant son ID.

---

## 🚀 Démarrer l'application

1. **Démarrer le serveur backend:**
   ```bash
   cd server
   python app.py
   ```

2. **Démarrer le client frontend:**
   ```bash
   cd client
   npm run dev
   ```

3. **Se connecter:**
   - Ouvrez votre navigateur à l'adresse affichée (généralement http://localhost:5173)
   - Utilisez les identifiants premium ci-dessus

---

## 📊 Vérifier les utilisateurs

Pour voir tous les utilisateurs dans la base de données:

```bash
python check_db.py
```

---

## 🔧 Modification manuelle

Si vous souhaitez modifier manuellement un utilisateur dans la base de données:

```python
import sqlite3
conn = sqlite3.connect('server/waler.db')
cursor = conn.cursor()

# Mettre à jour l'utilisateur ID 1 vers Premium
cursor.execute('''
    UPDATE users 
    SET subscription_tier = 'premium',
        subscription_status = 'active'
    WHERE id = 1
''')

conn.commit()
conn.close()
```

---

## 📋 Plans disponibles

- **Premium:** Fonctionnalités avancées pour utilisateurs individuels
- **Pro:** Toutes les fonctionnalités + gestion de clients (CRM)

---

## ⚠️ Notes importantes

- La base de données est située dans `server/waler.db`
- Les mots de passe sont hashés avec bcrypt
- Les dates d'expiration sont automatiquement calculées (30 jours d'essai + 1 an d'abonnement)
- Le statut `active` signifie que l'abonnement est actif

---

## 🆘 Dépannage

### Erreur "No users found"
- Exécutez `python quick_premium.py` pour créer un utilisateur

### Erreur "Database not found"
- Assurez-vous d'être dans le dossier `Waler`
- Vérifiez que `server/waler.db` existe

### Erreur "Email already exists"
- Utilisez `python upgrade_to_premium.py` pour mettre à niveau l'utilisateur existant
- Ou créez un utilisateur avec un email différent

---

Bon développement ! 🚀
