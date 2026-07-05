# 🧪 Guide de test - Détection automatique des followers

## ✅ Correction appliquée

L'interception API démarre maintenant **automatiquement** au chargement de la page Instagram et détecte les changements de followers en temps réel.

---

## 🔧 Modifications apportées

### **1. instagram-api-interceptor.ts**
- Ajout d'un callback `onUserInfo` pour traiter les données du profil
- Détection automatique des réponses contenant `data.user`

### **2. instagram-tracker.ts**
- Démarrage automatique de l'interception API dans `init()`
- Passage du callback `processUserInfo` du `data-collector`

### **3. data-collector.ts**
- Fonction `checkFollowerCountChange()` pour comparer l'ancien et le nouveau nombre
- Envoi du message `FOLLOWER_COUNT_CHANGED` au service worker

### **4. service-worker.ts**
- Handler `FOLLOWER_COUNT_CHANGED` pour créer une notification
- Mise à jour du badge de l'extension

---

## 🚀 Comment tester

### **Étape 1 : Recharger l'extension**
```
1. Ouvrez chrome://extensions/
2. Trouvez "Waler"
3. Cliquez sur le bouton "Recharger" (⟳)
```

### **Étape 2 : Ouvrir Instagram**
```
1. Allez sur https://www.instagram.com/
2. Connectez-vous si nécessaire
3. Allez sur votre profil
```

### **Étape 3 : Ouvrir la console**
```
1. Appuyez sur F12
2. Allez dans l'onglet "Console"
3. Rechargez la page (F5)
```

### **Étape 4 : Vérifier les logs**

**Vous devriez voir ces logs dans la console :**

```
🔍 Waler Instagram Tracker initializing...
✅ Tracking account: @votre_username
📦 Loaded follower database: 211 followers
📤 Auto-updating follower count to backend...
🔌 Starting continuous API interception...
```

**Quand Instagram charge les données du profil :**

```
📊 User info detected in API response
📊 Processing user info from API
User info: { username: "...", followersCount: 212, ... }
```

**Si le nombre a changé :**

```
🔔 Follower count changed: 211 → 212 (+1)
✨ 1 nouveau(x) follower(s) détecté(s) ! Ouvrez le modal des followers pour les identifier.
```

### **Étape 5 : Vérifier la notification**

**Vous devriez voir :**
- 🔔 Une notification système : "Waler - Followers Changed"
- 🔢 Le badge de l'extension : "+1" (vert) ou "-1" (orange)

### **Étape 6 : Vérifier le dashboard**

```
1. Ouvrez http://localhost:5000/dashboard
2. Le compteur devrait afficher le nouveau nombre (212)
3. Pas besoin de recharger, c'est automatique !
```

---

## 🔍 Débogage

### **Si vous ne voyez pas les logs :**

**1. Vérifier que l'extension est bien rechargée**
```
chrome://extensions/ → Waler → Recharger
```

**2. Vérifier que la console est bien ouverte**
```
F12 → Console → Rechargez Instagram (F5)
```

**3. Vérifier les erreurs**
```
Console → Cherchez les messages en rouge
```

### **Si l'API n'est pas interceptée :**

**Vérifiez dans la console :**
```
🔌 Starting continuous API interception...
```

**Si ce message n'apparaît pas :**
- L'extension n'est pas initialisée
- Rechargez la page Instagram

### **Si le nombre ne change pas :**

**C'est normal si :**
- Vous n'avez pas eu de nouveau follower depuis le dernier chargement
- Le nombre est déjà à jour dans la base

**Pour forcer un test :**
1. Ouvrez la console du service worker :
   - `chrome://extensions/` → Waler → "Service worker" (lien bleu)
2. Tapez dans la console :
   ```javascript
   chrome.storage.local.get('followerDatabase', (data) => {
     console.log('Current followers:', Object.keys(data.followerDatabase.followers).length);
   });
   ```
3. Comparez avec le nombre réel sur Instagram

---

## 📊 Logs attendus (scénario complet)

### **Au chargement de la page :**

```
🔍 Waler Instagram Tracker initializing...
✅ Tracking account: @pako_mrtz
📦 Loaded follower database: 211 followers
📤 Auto-updating follower count to backend...
🔌 Starting continuous API interception...
🔍 Checking initialization status...
📊 followerDatabase.isInitialized: true
📊 Total followers in DB: 211
✅ Database already initialized, skipping initial scan
```

### **Quand Instagram charge les données :**

```
📊 User info detected in API response
📊 Processing user info from API
User info: {
  username: "pako_mrtz",
  followersCount: 212,
  followingCount: 150,
  postsCount: 45,
  bio: "...",
  isPrivate: false
}
```

### **Si le nombre a changé :**

```
🔔 Follower count changed: 211 → 212 (+1)
✨ 1 nouveau(x) follower(s) détecté(s) ! Ouvrez le modal des followers pour les identifier.
```

### **Dans la console du service worker :**

```
🔔 Follower count changed: { oldCount: 211, newCount: 212, diff: 1 }
📊 Badge updated: +1
```

---

## ✅ Checklist de test

- [ ] Extension rechargée
- [ ] Instagram ouvert
- [ ] Console ouverte (F12)
- [ ] Page rechargée (F5)
- [ ] Log "🔌 Starting continuous API interception..." visible
- [ ] Log "📊 User info detected in API response" visible (après quelques secondes)
- [ ] Si le nombre a changé : notification visible
- [ ] Badge de l'extension mis à jour
- [ ] Dashboard affiche le bon nombre

---

## 🎯 Résultat attendu

**Après avoir suivi ces étapes :**

1. ✅ L'extension intercepte automatiquement les données Instagram
2. ✅ Le nombre de followers est détecté
3. ✅ Si le nombre change, vous êtes notifié
4. ✅ Le badge est mis à jour
5. ✅ Le dashboard affiche le bon nombre
6. ✅ Tout fonctionne automatiquement !

---

## 🐛 Problèmes connus

### **"User info detected" n'apparaît pas**

**Cause :** Instagram n'a pas encore chargé les données du profil

**Solution :**
- Attendez quelques secondes
- Rechargez la page (F5)
- Naviguez vers un autre profil puis revenez

### **Le nombre ne change pas**

**Cause :** Vous n'avez pas eu de nouveau follower

**Solution :**
- C'est normal ! Le système détecte seulement les vrais changements
- Pour tester, demandez à quelqu'un de vous suivre/unfollow

### **Notification ne s'affiche pas**

**Cause :** Les notifications sont désactivées

**Solution :**
- Autorisez les notifications pour Chrome
- Vérifiez les paramètres de notification de l'extension

---

## 📚 Documentation complète

Pour plus de détails, consultez :
- `DETECTION-AUTOMATIQUE-NOUVEAUX-FOLLOWERS.md` → Explication complète du système
- `CORRECTION-FINALE-COMPTEUR.md` → Correction du compteur
- `RECAPITULATIF-FINAL-COMPLET.md` → Récapitulatif de toutes les corrections

---

## 🎉 Conclusion

Le système de détection automatique est maintenant opérationnel !

**Rechargez l'extension, ouvrez Instagram, et testez !** 🚀
