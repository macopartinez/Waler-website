# 🎯 Comment activer le plan Premium sur Waler

## ✅ C'est déjà fait !

Un utilisateur premium a été créé automatiquement pour vous :

### 🔑 Vos identifiants Premium
```
Email: premium@waler.com
Mot de passe: premium123
Plan: Premium (actif pour 1 an)
```

---

## 🚀 3 façons d'obtenir le Premium

### Option 1 : Utiliser le compte créé (RAPIDE) ✨
1. Connectez-vous avec les identifiants ci-dessus
2. C'est tout ! Vous avez déjà le Premium actif

### Option 2 : Mettre à niveau votre compte existant 📧
Si vous avez déjà créé un compte dans l'application :

**Windows :**
```bash
set_premium.bat
```
Puis choisissez l'option 3 "Upgrade my account by email"

**Ou directement :**
```bash
python set_my_premium.py
```
Entrez votre email et le script vous mettra en Premium !

### Option 3 : Créer un nouveau compte Premium personnalisé 🎨
```bash
python create_premium_user.py
```
Suivez les instructions pour créer un compte avec vos propres identifiants.

---

## 📊 Vérifier votre statut Premium

Pour voir tous les utilisateurs et leur plan :
```bash
python check_db.py
```

---

## 🎁 Avantages du plan Premium

- ✅ Suivi de 3 comptes Instagram
- ✅ Historique de 30 jours
- ✅ Alertes unfollowers en temps réel
- ✅ Statistiques de base
- ✅ Export CSV
- ✅ Support par email

---

## 🔧 Besoin d'aide ?

### Problème : "Je ne vois pas les fonctionnalités Premium"
- Déconnectez-vous et reconnectez-vous
- Vérifiez que vous utilisez le bon email
- Exécutez `python check_db.py` pour vérifier votre statut

### Problème : "Email déjà utilisé"
- Utilisez `python set_my_premium.py` pour mettre à niveau votre compte existant
- Ou créez un compte avec un email différent

### Problème : "Database not found"
- Assurez-vous d'être dans le dossier Waler
- Le fichier `server/waler.db` doit exister

---

## 💡 Conseil Pro

Pour passer au plan **PRO** (fonctionnalités avancées + CRM) :
```bash
python set_my_premium.py
```
Puis choisissez "pro" quand demandé !

---

Profitez bien de votre plan Premium ! 🚀✨
