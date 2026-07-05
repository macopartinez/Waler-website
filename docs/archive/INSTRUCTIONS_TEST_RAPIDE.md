# 🚀 Instructions de Test Rapide

## Problème Corrigé
L'extension ne détectait pas les nouveaux followers car deux systèmes (API et DOM) n'étaient pas synchronisés.

## ✅ Solution Appliquée
- Synchronisation automatique de `lastFollowerCount` entre API et DOM
- Transmission des messages entre tous les composants
- Logs améliorés pour le débogage

## 🧪 Comment Tester Maintenant

### Étape 1 : Rebuilder l'extension
```powershell
cd waler-extension
.\BUILD.bat
```

### Étape 2 : Recharger l'extension
1. Aller sur `chrome://extensions/`
2. Trouver **Waler**
3. Cliquer sur le bouton **⟳ Recharger**

### Étape 3 : Ouvrir Instagram
1. Aller sur `https://www.instagram.com/VOTRE_USERNAME`
2. Appuyer sur **F12** pour ouvrir la console

### Étape 4 : Vérifier l'état (IMPORTANT)
Dans la console, tapez :
```javascript
debugFollowerDetection()
```

Vous devriez voir :
```
📊 [1/4] DOM...
   ✅ Followers (DOM): 214
📦 [2/4] Storage...
   lastFollowerCount: 214
   Database count: 214
🔌 [3/4] API Interceptor...
   ✅ ACTIF
🔍 [4/4] Synchronisation...
   ✅ Tout est synchronisé!
```

### Étape 5 : Tester avec un nouveau follower
1. **Demandez à quelqu'un de vous follow** (ou utilisez un compte test)
2. **Observez la console** - Vous devriez voir :
   ```
   🔔 [API] Follower count changed: 213 → 214 (+1)
   💾 Updated lastFollowerCount to 214
   📨 Received FOLLOWER_COUNT_CHANGED from API interceptor
   🔄 Synchronized lastFollowerCount to 214 (+1)
   🆕 1 new follower(s) detected
   ```

3. **Vérifiez la notification Windows** - Une notification devrait apparaître
4. **Vérifiez le badge** - L'icône de l'extension devrait afficher `+1`

### Étape 6 : Vérifier qu'il n'y a pas de double détection
1. **Attendez 30 secondes**
2. **Observez la console** - Vous devriez voir :
   ```
   🔍 [DOM] Checking: current=214, last=214, diff=0
   ```
3. **Pas de double détection** = ✅ **SUCCÈS !**

## 🔍 Si Ça Ne Marche Pas

### Problème : `debugFollowerDetection is not defined`
**Solution** : Rechargez la page Instagram (F5)

### Problème : API Interceptor ⚠️ NON ACTIF
**Solution** : Rechargez la page Instagram (F5)

### Problème : Désynchronisation détectée
**Solution** : Tapez dans la console :
```javascript
fixFollowerCount()
```

### Problème : Aucun log lors d'un nouveau follower
**Vérifications** :
1. L'extension est-elle bien rechargée ?
2. Êtes-vous sur votre profil Instagram ?
3. La console est-elle ouverte ?
4. L'API Interceptor est-il actif ? (vérifier avec `debugFollowerDetection()`)

## 📝 Logs à Surveiller

### ✅ Bon Fonctionnement
```
[API] Follower count changed: 213 → 214 (+1)
Updated lastFollowerCount to 214
Received FOLLOWER_COUNT_CHANGED
Synchronized lastFollowerCount to 214
[DOM] Checking: current=214, last=214, diff=0
```

### ❌ Problème
```
[DOM] Checking: current=214, last=213, diff=1
```
→ L'API n'a pas détecté le changement. Vérifiez que l'API Interceptor est actif.

## 📚 Documentation Complète

Pour plus de détails, consultez :
- `FIX_DETECTION_NOUVEAUX_FOLLOWERS.md` - Documentation technique complète
- `GUIDE_DEBUG_RAPIDE.md` - Guide de débogage détaillé
- `TEST_FOLLOWER_DETECTION.bat` - Script de test automatisé

## 🆘 Besoin d'Aide ?

Si le problème persiste après avoir suivi ces étapes :
1. Exécutez `debugFollowerDetection()` et copiez le résultat
2. Vérifiez les logs dans la console
3. Vérifiez la console du Service Worker (`chrome://extensions/` > Waler > Service Worker)
