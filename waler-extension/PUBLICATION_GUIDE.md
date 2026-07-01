# 📘 Guide Complet de Publication - Waler Extension

Ce guide vous accompagne étape par étape pour publier l'extension Waler sur Chrome Web Store, Firefox Add-ons et Edge Add-ons.

---

## 🚀 Étape 1 : Préparation

### 1.1 Vérifications Préalables

- [ ] L'extension fonctionne correctement en local
- [ ] Tous les tests sont passés
- [ ] Le domaine `waler.website` est actif et accessible
- [ ] L'API backend est déployée sur `https://waler.website`
- [ ] Les icônes sont présentes dans `assets/icons/` (16, 32, 48, 128px)

### 1.2 Build et Packaging

```bash
cd waler-extension
npm install
node package-extension.js
```

Cela créera :
- `releases/waler-chrome-v1.0.0.zip` (pour Chrome et Edge)
- `releases/waler-firefox-v1.0.0.zip` (pour Firefox)

### 1.3 Test des Packages

#### Chrome/Edge
1. Ouvrir `chrome://extensions/`
2. Activer "Mode développeur"
3. Dézipper le package Chrome
4. "Charger l'extension non empaquetée" → sélectionner le dossier dézippé
5. Tester toutes les fonctionnalités

#### Firefox
1. Ouvrir `about:debugging#/runtime/this-firefox`
2. "Charger un module complémentaire temporaire"
3. Sélectionner le fichier `manifest.json` du package Firefox dézippé
4. Tester toutes les fonctionnalités

---

## 🌐 Étape 2 : Chrome Web Store

### 2.1 Créer un Compte Développeur

1. Aller sur [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Se connecter avec un compte Google
3. Payer les **5 USD** de frais d'inscription (paiement unique)
4. Accepter les conditions d'utilisation

### 2.2 Préparer les Assets

#### Screenshots (OBLIGATOIRE)
- **Taille** : 1280x800 ou 640x400 pixels
- **Format** : PNG ou JPEG
- **Nombre** : 3 à 5 captures d'écran
- **Contenu suggéré** :
  1. Dashboard avec statistiques de followers
  2. Détection d'unfollowers en action
  3. Popup de l'extension
  4. Notifications
  5. Page de profil Instagram avec l'extension active

#### Image Promotionnelle (OPTIONNEL)
- **Taille** : 440x280 pixels
- **Format** : PNG ou JPEG

#### Bannière (OPTIONNEL)
- **Taille** : 1400x560 pixels
- **Format** : PNG ou JPEG

### 2.3 Informations à Remplir

#### Informations de Base
- **Nom** : Waler - Instagram Analytics
- **Description courte** : Track your Instagram followers, unfollowers, and engagement in real-time
- **Description détaillée** :
```
Waler is the ultimate Instagram analytics tool that helps you:

✨ FEATURES
• Real-time follower/unfollower tracking
• Instant notifications when someone unfollows you
• Detailed engagement analytics (likes, comments, shares)
• Beautiful dashboard with charts and statistics
• Automatic synchronization across devices
• Privacy-focused: your data stays secure

📊 ANALYTICS
• Track follower growth over time
• Identify your most engaged followers
• Detect fake/inactive accounts
• Monitor profile visits
• Export your data anytime

🔒 PRIVACY & SECURITY
• No passwords stored
• Encrypted data transmission
• GDPR compliant
• Your data is never sold to third parties

💎 PERFECT FOR
• Influencers tracking their audience
• Businesses monitoring their Instagram presence
• Anyone curious about their Instagram statistics

Get started in seconds - just install and log in to Instagram!
```

#### Catégorie
- **Principale** : Social & Communication
- **Secondaire** : Productivity

#### Langue
- Anglais (principal)
- Français (optionnel)

#### Site Web
- **Site officiel** : https://waler.website
- **Politique de confidentialité** : https://waler.website/privacy (ou uploader PRIVACY_POLICY.md)

### 2.4 Permissions - Justifications

Chrome demande de justifier certaines permissions. Voici les réponses :

**`webRequest`**
```
Cette permission est nécessaire pour intercepter les requêtes API Instagram 
afin de détecter en temps réel les changements de followers. Nous n'utilisons 
cette permission que sur instagram.com et uniquement pour collecter VOS 
propres statistiques.
```

**`cookies`**
```
Utilisé uniquement pour lire le cookie d'authentification Instagram afin 
d'accéder aux API Instagram en votre nom. Aucun cookie n'est modifié ou 
partagé avec des tiers.
```

**`notifications`**
```
Pour vous alerter instantanément lorsque quelqu'un vous unfollow ou vous 
bloque sur Instagram.
```

### 2.5 Soumettre l'Extension

1. Cliquer sur "New Item"
2. Uploader `waler-chrome-v1.0.0.zip`
3. Remplir tous les champs (voir section 2.3)
4. Uploader les screenshots
5. Cocher "This extension does not use remote code"
6. Déclarer que vous respectez les politiques de Google
7. Cliquer sur "Submit for Review"

### 2.6 Délai de Review
- **Première soumission** : 1 à 5 jours ouvrés
- **Mises à jour** : 1 à 2 jours

---

## 🦊 Étape 3 : Firefox Add-ons

### 3.1 Créer un Compte Développeur

1. Aller sur [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
2. Se connecter avec un compte Firefox
3. **Gratuit** (pas de frais d'inscription)

### 3.2 Soumettre l'Extension

1. Cliquer sur "Submit a New Add-on"
2. Choisir "On this site" (pour distribution publique)
3. Uploader `waler-firefox-v1.0.0.zip`

### 3.3 Informations à Remplir

- **Nom** : Waler - Instagram Analytics
- **Slug** : waler-instagram-analytics
- **Description** : (même que Chrome)
- **Catégories** : Social Networking, Web Development
- **Tags** : instagram, analytics, followers, unfollowers, statistics
- **Politique de confidentialité** : Uploader PRIVACY_POLICY.md
- **Licence** : MIT

### 3.4 Review Automatique

Firefox effectue une review automatique :
- Scan de sécurité
- Vérification des permissions
- Détection de code malveillant

Si tout est OK, l'extension est **approuvée automatiquement** !

### 3.5 Review Manuelle (si nécessaire)

Si la review automatique échoue :
- **Délai** : 1 à 7 jours
- Firefox peut demander des clarifications sur les permissions

---

## 🧭 Étape 4 : Microsoft Edge Add-ons

### 4.1 Créer un Compte Développeur

1. Aller sur [Microsoft Partner Center](https://partner.microsoft.com/dashboard)
2. Se connecter avec un compte Microsoft
3. S'inscrire au programme "Microsoft Edge Add-ons"
4. **Gratuit** (pas de frais)

### 4.2 Soumettre l'Extension

1. Cliquer sur "New Extension"
2. Uploader `waler-chrome-v1.0.0.zip` (même package que Chrome)
3. Remplir les informations (similaires à Chrome)

### 4.3 Informations Spécifiques

- **Availability** : All markets (ou sélectionner des pays spécifiques)
- **Pricing** : Free
- **Age Rating** : 3+ (Everyone)

### 4.4 Délai de Review
- **Première soumission** : 1 à 3 jours
- **Très rapide** comparé à Chrome

---

## 📋 Étape 5 : Checklist Finale

### Avant Soumission
- [ ] Package Chrome créé et testé
- [ ] Package Firefox créé et testé
- [ ] Screenshots préparés (1280x800)
- [ ] Politique de confidentialité accessible en ligne
- [ ] Site web waler.website actif
- [ ] Backend API fonctionnel

### Chrome Web Store
- [ ] Compte développeur créé (5 USD payés)
- [ ] Extension uploadée
- [ ] Screenshots ajoutés (3-5)
- [ ] Description remplie
- [ ] Permissions justifiées
- [ ] Politique de confidentialité liée
- [ ] Soumis pour review

### Firefox Add-ons
- [ ] Compte développeur créé
- [ ] Extension uploadée
- [ ] Informations remplies
- [ ] Politique de confidentialité uploadée
- [ ] Review automatique passée

### Edge Add-ons
- [ ] Compte Partner Center créé
- [ ] Extension uploadée
- [ ] Informations remplies
- [ ] Soumis pour review

---

## 🔄 Étape 6 : Après Publication

### Monitoring
- Surveiller les reviews utilisateurs
- Répondre aux commentaires
- Corriger les bugs signalés

### Mises à Jour
Pour publier une mise à jour :
1. Incrémenter la version dans `manifest.production.json` et `manifest.firefox.json`
2. Rebuild : `node package-extension.js`
3. Uploader les nouveaux packages sur chaque store
4. Les mises à jour sont généralement approuvées plus rapidement

### Analytics
- Chrome : Tableau de bord avec statistiques d'installation
- Firefox : Statistiques détaillées sur addons.mozilla.org
- Edge : Analytics dans Partner Center

---

## ⚠️ Problèmes Courants

### Extension Rejetée - Chrome

**Raison** : Permissions trop larges
**Solution** : Justifier chaque permission en détail

**Raison** : Code obfusqué détecté
**Solution** : Notre build esbuild est OK, mais expliquer que c'est du TypeScript compilé

**Raison** : Politique de confidentialité manquante
**Solution** : Uploader PRIVACY_POLICY.md sur waler.website/privacy

### Extension Rejetée - Firefox

**Raison** : Manifest v2 vs v3
**Solution** : Utiliser manifest.firefox.json (déjà configuré)

**Raison** : ID manquant
**Solution** : Déjà présent dans manifest.firefox.json (`waler@waler.website`)

### Extension Rejetée - Edge

**Raison** : Similaire à Chrome
**Solution** : Mêmes justifications que Chrome

---

## 📞 Support

### Chrome Web Store
- [Documentation](https://developer.chrome.com/docs/webstore/)
- [Support](https://support.google.com/chrome_webstore/)

### Firefox Add-ons
- [Documentation](https://extensionworkshop.com/)
- [Support](https://discourse.mozilla.org/c/add-ons/35)

### Edge Add-ons
- [Documentation](https://docs.microsoft.com/microsoft-edge/extensions-chromium/)
- [Support](https://developer.microsoft.com/microsoft-edge/support/)

---

## 🎉 Félicitations !

Une fois approuvée, votre extension sera disponible pour des millions d'utilisateurs !

**Liens de publication** :
- Chrome : `https://chrome.google.com/webstore/detail/[VOTRE-ID]`
- Firefox : `https://addons.mozilla.org/firefox/addon/waler-instagram-analytics/`
- Edge : `https://microsoftedge.microsoft.com/addons/detail/[VOTRE-ID]`

---

**Besoin d'aide ?** Consultez les documentations officielles ou contactez le support de chaque plateforme.
