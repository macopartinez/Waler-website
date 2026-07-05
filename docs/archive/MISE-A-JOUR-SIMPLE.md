# 🔧 Mise à jour simple du nombre de followers

## ❌ Erreur rencontrée

L'erreur `SyntaxError: Unexpected token '<'` signifie que le serveur a renvoyé du HTML au lieu de JSON.

**Cause probable :** Problème d'authentification ou endpoint incorrect.

---

## ✅ Solution simple : Utiliser l'extension directement

Au lieu de passer par le dashboard, utilisons l'extension sur Instagram :

### **Méthode 1 : Via le popup de l'extension**

1. **Allez sur Instagram** (n'importe quelle page)
2. **Cliquez sur l'icône de l'extension Waler** (en haut à droite)
3. **Cliquez sur "Synchroniser maintenant"**
4. **Attendez** que la synchronisation se termine
5. **Rechargez le dashboard** → Le nombre devrait être à jour

---

### **Méthode 2 : Via la console Instagram (recommandé)**

1. **Allez sur votre profil Instagram** (`https://www.instagram.com/VOTRE_USERNAME/`)
2. **Ouvrez la console** (F12 → Console)
3. **Copiez-collez ce code** :

```javascript
// Forcer la mise à jour des informations utilisateur
(async () => {
  console.log('🔄 Envoi de la mise à jour au service worker...');
  
  // Simuler les données du profil
  const userInfo = {
    username: 'VOTRE_USERNAME', // Remplacez par votre username
    followersCount: 211,
    followingCount: 0, // Mettez le bon nombre si vous le connaissez
    postsCount: 0,
    bio: '',
    isPrivate: false,
  };
  
  // Envoyer au service worker
  chrome.runtime.sendMessage({
    type: 'UPDATE_USER_INFO',
    data: userInfo
  }, (response) => {
    if (response && response.success) {
      console.log('✅ Mise à jour envoyée avec succès !', response);
      console.log('🔄 Rechargez le dashboard pour voir le changement');
    } else {
      console.error('❌ Erreur:', response);
    }
  });
})();
```

4. **Remplacez `VOTRE_USERNAME`** par votre vrai username Instagram
5. **Appuyez sur Entrée**
6. **Attendez le message** `✅ Mise à jour envoyée avec succès !`
7. **Rechargez le dashboard**

---

### **Méthode 3 : Déclencher l'interception automatique**

La meilleure façon est de laisser l'extension intercepter automatiquement les données :

1. **Allez sur `chrome://extensions/`**
2. **Trouvez "Waler"**
3. **Cliquez sur "Recharger"** (⟳)
4. **Allez sur Instagram → Votre profil**
5. **Ouvrez la console** (F12 → Console)
6. **Rechargez la page** (F5)
7. **Attendez 5 secondes**
8. **Cherchez dans la console** :
   ```
   📊 Processing user info from API
   User info: { followersCount: 211, ... }
   📊 Updating user info: ...
   ✅ User info updated successfully
   ```

Si vous voyez ces messages, c'est bon ! Sinon, utilisez la Méthode 2.

---

## 🔍 Vérification de l'authentification

Si aucune méthode ne fonctionne, vérifiez l'authentification :

1. **Ouvrez la console sur Instagram**
2. **Tapez** :
   ```javascript
   chrome.storage.local.get(['userId', 'token'], (result) => {
     console.log('Auth:', result);
   });
   ```
3. **Vérifiez** que vous avez bien un `userId` et un `token`

Si vous n'avez pas de token, vous devez vous reconnecter :
- Allez sur le dashboard
- Déconnectez-vous
- Reconnectez-vous

---

## 📝 Résumé

**Essayez dans cet ordre :**

1. ✅ **Méthode 2** (console Instagram avec le script)
2. ✅ **Méthode 3** (recharger l'extension et Instagram)
3. ✅ **Méthode 1** (bouton "Synchroniser" dans le popup)

**La plus simple et rapide : Méthode 2** 🚀
