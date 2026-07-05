# 🚀 Démarrage Rapide - Waler Premium

## ✅ Votre compte Premium est prêt !

### 🔑 Identifiants
```
Email: premium@waler.com
Mot de passe: premium123
Plan: Premium (actif pour 1 an)
```

---

## 🎯 Démarrer l'application

### Option 1 : Script automatique (RECOMMANDÉ)
Double-cliquez sur :
```
START_APP.bat
```

### Option 2 : Démarrage manuel

**Terminal 1 - Backend :**
```bash
cd server
python app.py
```

**Terminal 2 - Frontend :**
```bash
npm run dev
```

---

## 🌐 Accéder à l'application

1. Ouvrez votre navigateur
2. Allez sur **http://localhost:5173**
3. Connectez-vous avec les identifiants ci-dessus
4. **Votre badge Premium apparaîtra en haut à droite !** 🎉

---

## 🔍 Vérifier que tout fonctionne

### Le badge Premium ne s'affiche pas ?

**Vérifiez que les 2 serveurs sont démarrés :**

✅ Backend (Flask) : http://localhost:5001
✅ Frontend (Vite) : http://localhost:5173

**Test rapide de l'API :**
```bash
python test_subscription_api.py
```

Si tous les tests passent ✅, tout est OK !

---

## 🎁 Fonctionnalités Premium activées

- ✅ Suivi de 3 comptes Instagram
- ✅ Historique de 30 jours
- ✅ Alertes unfollowers en temps réel
- ✅ Statistiques de base
- ✅ Export CSV
- ✅ Support par email
- ✅ Badge Premium visible dans l'interface

---

## 🆘 Problèmes courants

### "Le serveur ne répond pas"
→ Assurez-vous que le backend est démarré sur le port 5001

### "Je ne vois pas mon plan"
→ Déconnectez-vous et reconnectez-vous
→ Vérifiez la console du navigateur (F12) pour les erreurs

### "Email ou mot de passe incorrect"
→ Vérifiez que l'utilisateur premium existe :
```bash
python check_db.py
```

---

## 💡 Mettre votre propre compte en Premium

Si vous avez déjà créé un compte dans l'app :
```bash
python set_my_premium.py
```

Entrez votre email et votre compte sera mis en Premium !

---

Profitez de Waler Premium ! 🎊✨
