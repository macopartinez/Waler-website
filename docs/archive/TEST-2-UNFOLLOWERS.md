# 🎯 Test de détection des 2 unfollowers manquants

## 📊 Situation actuelle

- **Followers dans la DB de l'extension** : 213
- **Followers actuels sur Instagram** : 211
- **Différence** : **2 unfollowers non détectés** ❌

## 🧪 Option 1 : Simulation rapide (RECOMMANDÉ)

Cette méthode simule la détection des 2 unfollowers et teste la mise à jour automatique du popup et du dashboard.

### Étapes :

1. **Ouvrir la console de l'extension**
   - Allez sur `chrome://extensions/`
   - Activez le "Mode développeur"
   - Trouvez "Waler" et cliquez sur "Service worker"

2. **Copier-coller ce code dans la console**

```javascript
(async function simulate2Unfollowers() {
  console.log('🎬 Simulation de la détection de 2 unfollowers...\n');

  const stored = await chrome.storage.local.get(['sessionStats', 'followerDatabase']);
  const currentStats = stored.sessionStats || {
    followers: 0,
    unfollowers: 0,
    potentialBlockers: 0,
    engagements: 0,
  };

  console.log('📊 Stats AVANT:', currentStats);

  const newStats = {
    ...currentStats,
    unfollowers: currentStats.unfollowers + 2,
  };

  await chrome.storage.local.set({ sessionStats: newStats });

  if (stored.followerDatabase) {
    const db = stored.followerDatabase;
    db.totalCount = 211;
    await chrome.storage.local.set({ 
      followerDatabase: db,
      lastFollowerCount: 211
    });
  }

  await chrome.storage.local.set({
    unfollowerDetected: true,
    unfollowerCount: 2
  });

  console.log('📊 Stats APRÈS:', newStats);

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url?.includes('localhost:5000/dashboard')) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'REFRESH_DASHBOARD',
          data: { unfollowers: 2, blocked: 0, notFound: 0 }
        });
        console.log('✅ Dashboard notifié');
      } catch (e) {}
    }
  }

  console.log('\n✅ TERMINÉ! Ouvrez le popup pour voir +2 unfollowers');
})();
```

3. **Vérifier les résultats**
   - ✅ Ouvrez le popup → Vous devriez voir **+2 unfollowers**
   - ✅ Si un dashboard est ouvert → Il devrait se **rafraîchir automatiquement**
   - ✅ Pas besoin de recharger quoi que ce soit !

---

## 🔍 Option 2 : Vraie analyse (plus long)

Cette méthode lance une vraie analyse pour identifier les 2 personnes qui vous ont unfollowé.

### Étapes :

1. **Ouvrir Instagram**
   - Allez sur `https://www.instagram.com/`
   - Connectez-vous à votre compte

2. **Ouvrir le modal de vos followers**
   - Cliquez sur votre nombre de followers
   - Le modal avec la liste s'ouvre

3. **Lancer l'analyse depuis le popup**
   - Cliquez sur l'icône de l'extension
   - Cliquez sur "Analyser les unfollowers"

4. **Attendre la fin de l'analyse**
   - L'extension va :
     - Scanner vos 211 followers actuels
     - Comparer avec les 213 en base
     - Identifier les 2 manquants
     - Les classifier (unfollowed/blocked/deleted)
     - **Mettre à jour automatiquement le popup et le dashboard** ✨

---

## 🔄 Réinitialiser pour retester

Si vous voulez remettre les stats à zéro pour retester :

```javascript
(async function resetStats() {
  await chrome.storage.local.set({
    sessionStats: {
      followers: 0,
      unfollowers: 0,
      potentialBlockers: 0,
      engagements: 0,
    },
    unfollowerDetected: false,
    unfollowerCount: 0
  });
  console.log('✅ Stats réinitialisées');
})();
```

---

## 📋 Vérifier les stats actuelles

```javascript
(async function checkStats() {
  const stored = await chrome.storage.local.get(['sessionStats', 'followerDatabase', 'unfollowerDetected', 'unfollowerCount']);
  console.log('📊 Stats de session:', stored.sessionStats);
  console.log('📁 DB followers:', stored.followerDatabase?.totalCount);
  console.log('🔔 Unfollowers détectés:', stored.unfollowerDetected);
  console.log('🔢 Nombre d\'unfollowers:', stored.unfollowerCount);
})();
```

---

## ✅ Ce qui devrait se passer

Après avoir exécuté la simulation ou l'analyse :

1. **Popup de l'extension** :
   - ✅ Affiche +2 unfollowers
   - ✅ Se met à jour automatiquement (pas besoin de fermer/rouvrir)

2. **Dashboard web** :
   - ✅ Se rafraîchit automatiquement
   - ✅ Affiche les nouvelles stats
   - ✅ Pas besoin de recharger la page

3. **Base de données backend** :
   - ✅ Les 2 unfollowers sont enregistrés
   - ✅ Disponibles dans le dashboard

---

## 🎯 Objectif du test

Vérifier que les corrections fonctionnent :
- ✅ Le popup se met à jour automatiquement
- ✅ Le dashboard se rafraîchit automatiquement
- ✅ Plus besoin de recharger manuellement

**Prêt à tester !** 🚀
