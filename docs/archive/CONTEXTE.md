# Contexte du Projet Waler

## Dernière mise à jour : 28 Juin 2026

---

## 🎯 Vue Rapide des Changements Majeurs

| Période | Changement |
|---------|-----------|
| Avril 2026 | Fusion Prospects + Connections → People (Mode Pro) |
| Avril 2026 | Améliorations UI/UX Mode Pro, ProSettingsModal |
| Avril 2026 | Blocker Feature (blockType manuel vs auto) |
| Mai 2026 | Système de Vérification 2FA avant paywall |
| Mai 2026 | Extension Chrome Waler (remplace bots Playwright) |
| Mai 2026 | Système de Détection Unfollowers via Extension |
| Mai 2026 | Système de Classification Intelligente (scoring DMs) |
| Mai 2026 | Collecte DMs en temps réel + Pro Conversation Collector |
| Mai 2026 | Setting Coach (qualification DM) |
| Mai 2026 | Surveillance Dashboard |
| Mai 2026 | Système Pause/Reprise des Agents (changements de plan) |
| Mai 2026 | Instagram Only (suppression Facebook) |
| Juin 2026 | Correctifs bugs extension (compteur, unfollowers, auth) |

---

## 🔌 Extension Chrome Waler

### Architecture Générale

L'extension remplace les bots Playwright (indétectable par Meta, temps réel, coût serveur minimal).

```
Instagram.com
  └── Content Scripts (monde isolé)
        ├── instagram-tracker.ts        ← orchestrateur principal
        ├── unfollower-detector.ts      ← analyse unfollowers 2 phases
        ├── instagram-search-automator.ts
        ├── profile-analyzer.ts
        ├── notification-checker.ts     ← détection via page /notifications/
        ├── data-collector.ts           ← collecte filtrée (trackedUsername)
        ├── dom-observer.ts
        ├── instagram-api-interceptor.ts← écoute postMessage de page-interceptor
        ├── instagram-modal-scroller.ts ← scroll modal followers
        ├── follower-extractor.ts
        ├── dm-interceptor.ts           ← STUB (constructor+init+getDMMessages)
        ├── dm-message-extractor.ts     ← extraction messages DOM
        ├── dm-thread-scroller.ts       ← scroll historique DM
        ├── dm-analyzer.ts              ← analyse sémantique DMs (FR+EN)
        ├── scoring-engine.ts           ← score 0-100 (5 composantes)
        ├── conversation-dynamics.ts    ← dynamiques comportementales
        ├── setting-coach.ts            ← coach qualification DM (setting)
        ├── pro-conversation-collector.ts ← collecte DMs Pro (machine à états)
        ├── pro-engagement-collector.ts ← engage posts/likes sans Playwright
        ├── account-linker.ts
        ├── action-recorder.ts
        ├── auth-listener.ts
        ├── confirm-dialog.ts
        └── scan-overlay.ts
  └── Injected Script (monde MAIN)
        └── injected/page-interceptor.ts← intercepte window.fetch Instagram
Background Service Worker
  ├── service-worker.ts               ← handlers messages + notifications
  ├── sync-manager.ts                 ← queue offline-first + retry
  ├── classification-manager.ts       ← suggestions + validation
  └── account-storage.ts
Utils
  ├── api-client.ts
  ├── consent.ts                      ← consentement RGPD
  ├── encryption.ts
  ├── error-handler.ts
  ├── surveillance-scheduler.ts
  └── validation.ts
```

### Build & Chargement
```bash
cd waler-extension
npm run build     # ou .\BUILD.bat
# Charger depuis waler-extension/dist/ dans chrome://extensions/
```

### Points Techniques Clés

- **Interception fetch** : `window.fetch` surchargé dans le monde isolé n'intercepte rien. Solution : `page-interceptor.ts` (world: MAIN, document_start) poste via `postMessage('WALER_PAGE_INTERCEPTOR')` ; `instagram-api-interceptor.ts` écoute.
- **Compteur fiable** : `fetchRealFollowerCount()` utilise le cookie `ds_user_id` (compte connecté) → `https://i.instagram.com/api/v1/users/{id}/info/` (header `x-ig-app-id: 936619743392459`) → `user.follower_count`. Indépendant du profil affiché. Fallback : `web_profile_info` via username.
- **`checkFollowerCountChange()`** : appelée toutes les 30s ; `ANOMALY_THRESHOLD=1000` (resync sans notif si diff > 1000) ; ignorée pendant `isScanning`.
- **`cleanupCorruptedState()`** : appelée au démarrage, efface `unfollowerCount/lastFollowerCount` absurdes et badge.
- **DataCollector** : `setTrackedUsername()` + filtre `username === trackedUsername` → évite 29 000 faux unfollowers.
- **`apiToken`** : le service-worker lit `apiToken` (et non `token`) pour `POST /api/users/instagram-stats`.

---

## 🔍 Système de Détection des Unfollowers (Extension)

### 2 Phases Distinctes

**Phase 1 — Scan du modal followers** (`isScanning = true`)
- Ouverture et scroll du modal followers sur le profil principal
- Comparaison avec la base locale → liste des `missingFollowers`
- `checkFollowerCountChange()` ignorée pendant le scan

**Phase 2 — Navigation entre profils** (`unfollowerCheckState` localStorage + `isAnalyzing` chrome.storage)
- Navigation automatique vers chaque profil manquant (`/@username`)
- `profile-analyzer.ts` → classification : `blocked` / `deleted` / `unfollowed`
- Retour automatique au profil principal après chaque profil
- Envoi résultats backend + déclenchement Agent B si nécessaire
- Nettoyage localStorage + `isAnalyzing` quand terminé

### Protection Anti-Interruption (`instagram-tracker.ts`)

```
init() appelé à chaque navigation :
  1. checkCurrentPageForUnfollower() EN PREMIER (continue l'analyse phase 2)
  2. Si isScanning → bloque init(), réessai 2s
  3. Si unfollowerCheckState || isAnalyzing → bloque init(), réessai 3s
     Log: "⏸️ Init bloqué : analyse unfollower en cours (navigation entre profils)"
```

### Suppression Automatique de l'Historique de Recherche

Après chaque profil vérifié, `instagram-search-automator.clearSearchHistory(username)` :
- Ouvre la barre de recherche Instagram
- Détecte et supprime l'entrée par aria-label / SVG X / siblings
- Délai naturel de 300ms → aucune trace dans l'historique
- Fonctionne même en cas d'erreur ou de timeout

### Fichiers Concernés
- `waler-extension/src/content/unfollower-detector.ts`
- `waler-extension/src/content/instagram-search-automator.ts`
- `waler-extension/src/content/profile-analyzer.ts`
- `waler-extension/src/content/instagram-tracker.ts`

---

## 🧠 Système de Classification Intelligente

### Scoring Multi-Critères (0-100)

| Composante | Points | Source |
|-----------|--------|--------|
| DMs | 30 | `dm-analyzer.ts` (mots-clés FR+EN) |
| Engagement | 25 | Likes, commentaires, stories |
| Activité | 20 | Fréquence des interactions |
| Ancienneté | 10 | Durée de la relation |
| Réciprocité | 15 | Follow mutuel, réponses |

### Workflow Complet
```
Extension collecte données
  → scoring-engine.ts calcule score (0-100)
  → Détection de transition potentielle
  → classification-manager.ts crée suggestion (avec raison + preuves)
  → Notification badge popup
  → Utilisateur accepte/rejette dans suggestions.html
  → BDD mise à jour + historique
```

### Catégories de Contacts
- `lead` → `prospect` → `client` → `converted`
- `network` (relation informelle)

### Mots-Clés DM Analysés (`dm-analyzer.ts`)
- **Client** : merci, résultat, progrès, coaching, séance, paiement…
- **Prospect** : intéressé, prix, tarif, info, disponibilité, rdv…
- **Network** : salut, cool, bravo, félicitations…

### Tables Base de Données
- `contact_scores` — score détaillé par contact
- `classification_suggestions` — suggestions en attente (pending/accepted/rejected)
- `classification_history` — historique des transitions

### Routes API
- `POST /api/extension/analyze-contact`
- `POST /api/extension/suggest-transition`
- `POST /api/extension/validate-suggestion`
- `GET /api/extension/pending-suggestions`
- `POST /api/extension/log-transition`

### Frontend Classification
- `client/src/components/classification/ClassificationDashboard.tsx`
- `client/src/components/classification/ClassificationStats.tsx`
- `client/src/components/classification/ContactScores.tsx`
- `client/src/components/classification/DMConversations.tsx`
- `client/src/components/classification/SuggestionsList.tsx`
- `client/src/components/classification/PrivacySettings.tsx`

---

## 💬 Collecte DMs & Pro Conversation Collector

### DMInterceptor (STUB)
`dm-interceptor.ts` est un stub minimal (constructor + init + getDMMessages). `startDMSync` vérifie `typeof .start === 'function'` avant d'appeler. L'initialisation DM est reordonnée après `startFollowerCountMonitoring`.

### DM Thread Scroller
`dm-thread-scroller.ts` : scroll vers le haut d'un thread pour charger l'historique complet. Analyse incrémentale : s'arrête si les `messageId` connus sont retrouvés.

### DM Message Extractor
`dm-message-extractor.ts` : extraction structurée des messages (texte, média, reactions, timestamp, direction).

### Pro Conversation Collector
`pro-conversation-collector.ts` : orchestre l'analyse complète d'une conversation DM pour la section Pro.
- **Machine à états persistée** dans `chrome.storage.local` (`proAnalysisState`) — survit aux reloads de navigation
- Phases : `goto_inbox` → recherche → détection non-lu → scroll → extraction → analyse → mise à jour stats
- Utilise `DMThreadScroller`, `DMMessageExtractor`, `ScoringEngine`, `DMAnalyzer`, `ConversationDynamicsAnalyzer`, `SettingCoach`

### Pro Engagement Collector
`pro-engagement-collector.ts` : remplace l'agent Python Playwright (`agent_pro_circle.py`).
- Clique chaque vignette de la grille pour ouvrir le post en **modal** (accès likes + commentaires)
- Note les People qui ont commenté/liké → envoi backend via `SYNC_PRO_ENGAGEMENT`
- État persisté dans `chrome.storage.local` — aucun rechargement pendant la boucle

### Setting Coach
`setting-coach.ts` : coach de qualification DM basé sur la méthodologie "setting".
- **4 phases** : Connexion → Situation → Problème → Transition (vers un call)
- Déduit la phase depuis le contenu des messages reçus (heuristique FR)
- Extrait : budget, timeline, goal, activité, objections du prospect
- Calcule `EmotionalState` (hot/neutral/cold/skeptical) et `Momentum` (accelerating/steady/cooling)
- Complémentaire de `DMAnalyzer` (intention) et `ConversationDynamicsAnalyzer` (comportement)

### Tables DMs
- `dm_messages` — messages individuels
- `dm_conversations` — métadonnées conversation
- `dm_stats` — statistiques par contact (temps de réponse, longueur, initiateur)
- Vues : `v_recent_conversations`, `v_dm_global_stats`

### Routes DMs
- `POST /api/extension/sync-dms`
- `GET /api/extension/dm-conversations`
- `GET /api/extension/dm-stats/:username`
- `POST /api/extension/analyze-dms`

---

## 🛡️ Surveillance Dashboard

- `client/src/components/surveillance/SurveillanceDashboard.tsx`
- `waler-extension/src/utils/surveillance-scheduler.ts`
- `server/init_surveillance_tables.sql` — tables de surveillance

---

## ⏸️ Système Pause/Reprise des Agents

### Comportement lors des Changements de Plan

| Scénario | Agents Affectés | Action | Données |
|----------|----------------|--------|---------|
| Pro → Premium | Prospects, Connections, Clients | ⏸️ Pause (`plan_downgrade`) | ✅ Préservées |
| Premium → Pro | Prospects, Connections, Clients | ▶️ Reprise automatique | ✅ Préservées |
| Annulation | Tous | ⏹️ Arrêt | ✅ Préservées |

- Table `agent_states` : `agent_type`, `status` (active/paused/stopped), `pause_reason`, `last_run_at`, `metadata`
- Les agents Pro ne se reprennent **pas** si la pause était manuelle (`pausedByPlanChange !== true`)
- Wrapper `withAgentCheck(userId, agentType, fn)` — vérifie plan + statut avant chaque exécution
- Intégration dans `server/plan-migration.ts`

---

## 🚫 Blocker Feature

- **`blockType`** : `'deleted_account'` (auto-détecté par l'extension) | `'manually_marked'` (action utilisateur)
- **`UnfollowerModal.tsx`** : affiche les infos unfollower + lien profil Instagram + 2 options + message psychologique si "blocked"
- **Route** : `POST /api/unfollowers/:id/mark-as-blocker` → déplace vers table `blockers`
- Dashboard integration : badges 🗑️ (deleted) et 🚫 (manually marked)

---

## 🔐 Système de Vérification 2FA (Onboarding)

### Flux d'Onboarding (17 étapes)
```
1-10.  Questionnaire psychologique
11.    Username Instagram
12.    ✅ Vérification que le compte existe
13.    📱 Code 6 chiffres envoyé par DM @waler
14.    💰 PAYWALL
15.    Email
16.    Password
17.    → Création compte + Activation agents
```

### Implémentation
- Bot `@waler` (Instagram) envoie les codes par DM
- Table `verification_codes` : code, expiration 15 min, max 5 tentatives
- `server/verification-codes.ts`, `server/waler-onboarding-bot.ts`

---

## 🏗️ Architecture Actuelle

### Mode Personnel (Dashboard)
- Sphère interactive + statistiques Instagram
- Sections : Followers, Unfollowers, Blockers
- Extension Chrome → source des données (remplace agents Playwright)
- `SettingsModal` avec 4 tabs

### Mode Pro
- **Clients** : CRM avec milestones, goals (followers/views/posts), timezone
- **People** : Gestion unifiée prospects + connexions
  - Tags : `prospect | vip | keep | watch | client | converted`
  - Scoring automatique via extension
  - Vue détaillée avec scores, signaux, notes, historique DMs
- **Classification** : Dashboard suggestions de transition de catégorie
- **Settings** : `ProSettingsModal` avec 5 tabs
- **Tutorial** : `ProTutorial.tsx`

### Waler Extension (Client-side Agents)
- Remplace les agents Python/Playwright côté collecte
- Multi-collecteurs : followers, unfollowers, DMs, engagement, posts

---

## 📦 Agents Backend

### Agent A → Extension Chrome (Unfollowers)
- Détection via extension (modal scroll + navigation profils)
- Résultats envoyés au backend via `POST /api/extension/verify-missing-followers`
- Stockage dans table `unfollowers`

### Agent B (Follow Automatique)
- Follow automatique avec Playwright
- Déclenché par l'extension après classification unfollower
- Gestion cookies, sessions, retry

### Agent C (Tracking Clients Pro)
- Métriques et milestones
- Auto-complétion des goals
- Tracking posts quotidiens/hebdomadaires/mensuels

### Agent Connections → Extension Chrome (Pro)
- Remplacé par `pro-engagement-collector.ts` pour la collecte
- Scraping modal posts, likes, commentaires sans Playwright
- Scores de santé relationnelle (0-100)
- Tables `mutual_connections`, `follow_like_correlations`

### Agent Prospects → Extension Chrome (Pro)
- Détection nouveaux followers via `notification-checker.ts`
- Scoring automatique basé sur engagement + DMs
- Intégration avec People

### Agent Waler (Onboarding)
- Bot Instagram `@waler` pour codes de vérification
- Gestion sessions Playwright

---

## 🗄️ Stockage des Données

### Base de Données (SQLite / PostgreSQL)

#### Tables Principales
- `users` — authentification sécurisée
- `unfollowers` — historique des unfollows
- `blockers` — comptes bloquants (`blockType`)
- `followers` — nouveaux followers
- `verification_codes` — codes 2FA
- `subscriptions` — abonnements Stripe
- `plans` — Free / Premium / Pro
- `plan_change_history`
- `agent_states` — statut des agents (active/paused/stopped)

#### Tables Pro
- `pro_clients`, `pro_people`, `pro_milestones`, `pro_notes`
- `circle_members`, `mutual_connections`, `follow_like_correlations`

#### Tables Extension/Classification
- `contact_scores` — score 0-100 par contact
- `classification_suggestions` — suggestions en attente
- `classification_history` — historique des transitions
- `dm_messages`, `dm_conversations`, `dm_stats`
- Tables surveillance (`init_surveillance_tables.sql`)

### Chrome Storage (Extension)
- `followerDatabase` — base locale followers + `totalCount` (toujours synchronisé)
- `apiToken` — token d'authentification backend
- `isAnalyzing` — indicateur phase 2 analyse unfollowers
- `proAnalysisState` — état machine à états Pro Conversation Collector

### localStorage (Instagram Tab)
- `unfollowerCheckState` — état phase 2 analyse unfollowers (currentIndex, missingFollowers, results)
- Conversations DM (nettoyage auto > 30 jours)

### localStorage (Dashboard Frontend)
- `pro-clients`, `pro-people`, `client-{id}-milestones`, `client-{id}-notes`
- `disableBackgroundAnimation`

---

## 🎨 Design System

### Couleurs
- Primary: `#02c950` (vert Waler)
- Gradients: `from-green-500 to-emerald-500`
- Backgrounds: `bg-black/80`, `bg-white/5`
- Borders: `border-white/10`, `border-white/20`

### Animations
- `animate-blob` — Blobs fond (7s infinite)
- `animation-delay-2000` / `animation-delay-4000`
- Hover: `hover:scale-105`

### Typographie
- Display: Outfit
- Body: Plus Jakarta Sans
- Doppio: Doppio One

---

## 🔧 Stack Technique

### Frontend
- React + TypeScript, Vite, TailwindCSS
- Framer Motion, Lucide Icons, Recharts

### Backend
- Node.js + Express, SQLite (`waler.db`) / PostgreSQL
- Playwright (Agent B uniquement)

### Extension Chrome
- TypeScript + esbuild (pas de type-check au build)
- `webextension-polyfill`
- Content Scripts (monde isolé) + Injected Script (monde MAIN)
- Service Worker (Manifest V3)

---

## 🐛 Bugs Corrigés (Extension)

1. **window.fetch isolé** → `page-interceptor.ts` en monde MAIN + postMessage
2. **DMInterceptor crash** → stub vérifié avec `typeof`, monitoring avant DM
3. **29 000 faux unfollowers** → `DataCollector.setTrackedUsername()` + filtre + `ANOMALY_THRESHOLD=1000` + `cleanupCorruptedState()`
4. **Dashboard non synchro** → `apiToken` (et non `token`) dans service-worker
5. **totalCount désynchronisé** → auto-fix au chargement + avant chaque sauvegarde
6. **Analyse unfollower interrompue** → `checkCurrentPageForUnfollower()` appelé en premier dans `init()` + blocage conditionnel

---

## 📝 Prochaines Étapes

1. **Intégration Extension ↔ Agents Backend** — système de relais
2. **Dashboard Surveillance** — visualisation complète
3. **Notifications Push** — webhooks sur milestones atteints
4. **Analytics Avancés** — graphiques de croissance, prédictions
5. **Mode Pro** — export CSV/PDF, templates notes
6. **Chrome Web Store** — publication de l'extension

---

## 📚 Documentation Associée

### Extension
- `WALER_EXTENSION_ARCHITECTURE.md` — architecture complète
- `CHANGELOG_UNFOLLOWER_SYSTEM.md` — historique système unfollowers
- `UNFOLLOWER_DETECTION_SYSTEM.md` — système de détection
- `FOLLOWER_COUNT_SYNC_FIX.md` — fix compteur
- `CLASSIFICATION_SYSTEM_READY.md` — système de classification
- `DM_COLLECTION_READY.md` — collecte DMs
- `SERVICE_WORKER_COMPLETE.md` — handlers service worker
- `EXTENSION_AUTH_FIX.md`, `EXTENSION_TESTING_GUIDE.md`

### Agents & Pro
- `AGENT_CONNECTIONS_GUIDE.md`, `AGENT_C_GUIDE.md`, `AGENT_PROSPECTS_GUIDE.md`
- `AGENT_PRO_GUIDE.md`, `AGENT_FOLLOW_SYSTEM.md`, `AGENT_WALER_README.md`
- `AGENT_PAUSE_RESUME_SYSTEM.md` — système pause/reprise
- `AGENTS_PRO_COMPLETE.md`, `AUTO_TRIGGER_AGENTS_README.md`

### Sécurité & Auth
- `SECURITY_SETUP.md`, `2FA_SETUP.md`, `CODE_VERIFICATION_AVANT_PAYWALL.md`

### Monétisation
- `STRIPE_SETUP.md`, `PREMIUM_SETUP.md`, `GUIDE_CHANGEMENT_PLAN.md`
- `PLAN_CHANGE_DATA_PRESERVATION.md`, `TUNNEL_DE_VENTE.md`

### Flux & UX
- `NOUVEAU_FLUX_ONBOARDING.md`, `FLUX_FINAL_COMPLET.md`, `AMELIORATIONS_UX.md`

---

## 👥 Contributeurs

- Développement principal: Cascade AI + User
- Architecture: Évolution itérative basée sur feedback utilisateur
