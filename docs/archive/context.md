# FlowTrack / Waler — Context

> **Repo**: FlowTrack | **Extension**: Waler Extension | **Last updated**: 2026-06-23

---

## Product Vision

Waler is a relationship clarity tool for Instagram. It detects when someone leaves your digital circle and guides you through understanding what that means about yourself and your relationship. Positioning: introspective, not surveillance.

---

## Brand Identity

- **Name**: Waler (brand) / FlowTrack (repo/internal)
- **Positioning**: "Relationship clarity tool", not a tracker
- **Tone**: Introspective, compassionate, psychologically aware
- **Design**: OLED black (`#0a0a0a`), single neon green accent (`#02c950`), lucide line icons (no emojis), `.oled-card` / `.text-gradient` design system

---

## Monetization

Premium-only model, two tiers (plans table in Supabase):

| Plan | Price | Trial |
|------|-------|-------|
| Premium | ~$4.99/mo | 7 days |
| Pro | ~$14.99/mo | 14 days |

**Premium**: unfollower/blocker detection, history, RevealGate, AI insights  
**Pro**: everything Premium + circle management, contact classification, DM analysis, surveillance, people suggestions

### Conversion Points
1. **Onboarding Step 11** (AI Insights Summary) — 3 free insights visible, rest blurred → PricingModal
2. **Dashboard** — unfollower names locked behind paywall
3. **Landing page** — "Begin Your Journey" CTA with trial mention

---

## Architecture Overview

```
FlowTrack/
├── client/          # React + TypeScript + Vite frontend
├── server/          # Express + TypeScript backend
│   ├── routes.ts    # All API routes (~4100 lines)
│   ├── routes/      # Python routes (auth.py, clients.py, subscription.py)
│   ├── db.ts        # Drizzle ORM → Supabase Postgres
│   ├── waler.db     # better-sqlite3 — Pro features data
│   └── middleware.ts
├── shared/
│   └── schema.ts    # Drizzle schema (maps to Supabase `app_users`)
└── waler-extension/ # Chrome extension
    └── src/
        ├── background/
        │   ├── service-worker.ts      # Message bus + all logic
        │   ├── sync-manager.ts        # Queue & server sync
        │   ├── classification-manager.ts
        │   └── account-storage.ts     # Multi-account storage
        ├── popup/
        │   ├── popup-chrome.ts        # Popup logic + lucide icons via ic()/lbl()/hydrateIcons()
        │   ├── index.html
        │   └── suggestions.html       # Relationship transition suggestions UI
        ├── content/                   # Content scripts + dm-analyzer
        └── injected/
```

---

## Two-Database Architecture (CRITICAL)

**Database 1 — Supabase Postgres** (via Drizzle ORM, `server/db.ts`):
- Auth, sessions, accounts: `app_users` (NOT `public.users` which is legacy/unused)
- Follower tracking: `followers`, `unfollowers`, `blockers`
- Plans/billing: `plans`, `subscriptions`, `planChangeHistory`, `agentStates`
- Session persistence: `connect-pg-simple` session store

**Database 2 — SQLite `server/waler.db`** (via `better-sqlite3`):
- Pro circle/people: `circle_members`, `contact_scores`, `liked_posts`, `timeline_events`
- Separate `users` table (different IDs from Supabase!)

**ID Mismatch Gotcha**: The same Instagram account has DIFFERENT ids in each DB.  
Example: `eth4nduvin` = `app_users.id=22` (Supabase) but `waler.db users.id=21`.  
**Fix pattern**: always resolve waler.db user by Instagram **username** (`SELECT id FROM users WHERE lower(username)=lower(?)`), not by Supabase accountId.

---

## Supabase Schema (`shared/schema.ts` → physical table `app_users`)

```
app_users:
  id, username, email, passwordHash
  ownerId            -- null = owner login; set = secondary linked account
  instagramUserId    -- ds_user_id (deduplicates linked accounts)
  platform           -- always 'instagram'
  avatarUrl, isConnected, isVerified
  verificationCode, verificationToken, verificationTokenExpiry, verificationAttempts
  subscriptionTier   -- 'premium' | 'pro' | null
  subscriptionStatus -- 'active' | 'trialing' | 'cancelled' | 'expired'
  trialEndsAt
  followersCount, followingCount, postsCount, bio, isPrivate
  analysisStatus     -- 'pending' | 'analyzing' | 'completed' | 'failed'
  lastAnalyzedAt, createdAt

followers:       id, userId, username, avatarUrl, detectedAt
unfollowers:     id, userId, username, avatarUrl, status, detectedAt, verifiedAt, recoveredAt
blockers:        id, userId, username, avatarUrl, type, blockType, detectedAt
verificationCodes: codeToSend, code (6-digit), instagramUsername, userId, expiresAt, used
plans:           id, name, displayName, priceMonthly, priceYearly, maxAccounts, maxHistoryDays, features, stripePriceIds
subscriptions:   userId(unique), planId, stripeCustomerId, stripeSubscriptionId, status, billingPeriod, ...
planChangeHistory, agentStates
```

**Follower count source of truth** = COUNT of rows in `followers` table, NOT `app_users.followers_count` (stale).

---

## Authentication

- Session-cookie only (`req.session.userId`), HTTP-only cookies
- Extension handshake: `POST /api/extension/generate-token` → one-time `apiToken` → `POST /api/extension/validate-token` (deletes token after use, sets session cookie)
- Extension API calls use `credentials: 'include'` (session cookie), NOT the apiToken
- `isPro` flag: stored in `chrome.storage.local`, refreshed via `GET /api/extension/pro-status` on popup init and account switch — NEVER downgraded on fetch failure (transient outage protection)
- Middleware: `requireAuth`, `requireOwnership`, `requireVerified`, `requireAdmin` (x-admin-token header)
- Server requires `SESSION_SECRET` env var in prod or refuses to start

---

## Chrome Extension — Waler Extension

### Multi-Account Storage (`account-storage.ts`)
- **Primary account** (1st Instagram seen = FlowTrack signup account, tracked by `primaryDsUserId`): uses global non-namespaced storage keys. Auto-linked silently, no popup.
- **Secondary accounts**: isolated under `acct:<dsUserId>:` namespace. Shows link prompt.
- Logic: `resolveActiveAccount` (instagram-tracker.ts) + `ensurePrimaryAccount` / `autoLinkPrimaryAccount`

### Service Worker Messages (key ones)
```
FLOWTRACK_AUTH         -- handshake with server, sets auth + isPro
REFRESH_PRO_STATUS     -- refreshes isPro without downgrading on failure
TRACK_FOLLOWER/UNFOLLOWER/TRACK_GHOST/TRACK_POTENTIAL_BLOCKER
TRACK_ENGAGEMENT       -- likes, comments
PERSON_CLASSIFIED      -- contact category change
SYNC_NOW / GET_STATS
GET_PEOPLE             -- Pro circle (sends ?username= for waler.db id resolution)
RESTORE_FOLLOWERS      -- rebuild local follower DB from backend
AUTHENTICATE / LINK_ACCOUNT / GET_ACCOUNTS / SET_ACTIVE_ACCOUNT
NEW_DM / SYNC_DMS / GET_DM_CONVERSATIONS / ANALYZE_DMS
SYNC_PRO_ENGAGEMENT / UPDATE_CONTACT_SCORE / UPDATE_CONTACT_NAME
CREATE_SUGGESTION / GET_SUGGESTIONS / ACCEPT_SUGGESTION / REJECT_SUGGESTION
FOLLOWER_CHANGE_DETECTED / UPDATE_BADGE / CHECK_NOTIFICATIONS
INITIAL_SCAN_REQUIRED / SCAN_PROGRESS
SEND_UNFOLLOWER_RESULTS / UNFOLLOWER_ANALYSIS_PROGRESS
REPAIR_FOLLOWER_DB / GET_DB_DUMP / RESET_FOLLOWER_DB / RESET_STATS
```

### Extension UI
- `popup-chrome.ts`: icon system via `ICON_PATHS` + `ic()` / `lbl()` / `hydrateIcons()`, `data-icon` slots
- `suggestions.html`: relationship transition suggestions (separate page)
- CSS: `.ic` / `.ic-green` / `.ic-red`, OLED black bg matching server pages

### Instagram API Gotcha
`friendships/<id>/followers/?count=N` returns 400 for large N — cap at 50 and paginate.

---

## Server API Routes (key groups)

### Auth
```
POST /api/auth/register          -- rate limited 5/min
POST /api/auth/login             -- rate limited 5/min
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/verification/generate|verify|resend
```

### Multi-Account
```
GET  /api/accounts               -- list all accounts for owner
POST /api/accounts/switch        -- switch active account
POST /api/accounts/link          -- link secondary IG account
```

### Extension
```
POST /api/extension/generate-token
POST /api/extension/validate-token
GET  /api/extension/pro-status   -- isPro refresh (session cookie)
GET  /api/extension/followers    -- full follower list for RESTORE_FOLLOWERS
POST /api/extension/sync         -- incremental sync (followers/unfollowers/ghosts)
POST /api/extension/sync-full    -- full scan, rebuilds followers table
POST /api/extension/auth         -- update user info from extension
POST /api/extension/update-user-info
GET  /api/extension/people       -- Pro circle (?username= for waler.db resolution)
POST /api/extension/analyze-contact
POST /api/extension/contact-name
POST /api/extension/pro-engagement
POST /api/extension/suggest-transition
POST /api/extension/validate-suggestion
GET  /api/extension/pending-suggestions
POST /api/extension/log-transition
POST /api/extension/sync-dms
POST /api/extension/analyze-dms
GET  /api/extension/dm-conversations
GET  /api/extension/dm-stats/:username
POST /api/extension/verify-missing-followers
GET  /extension-auth             -- server-rendered auth page (OLED style)
```

### Pro Features
```
GET  /api/pro/circle-stats
GET  /api/pro/people-suggestions
POST /api/pro/people-suggestions/dismiss
POST /api/pro/analyze-person
GET  /api/pro/person-analysis-status/:username
```

### Classification
```
GET  /api/classification/dashboard-stats
GET  /api/classification/suggestions
POST /api/classification/validate-suggestion
GET  /api/classification/contact-scores
GET  /api/classification/stats
GET  /api/classification/dm-conversations
GET  /api/classification/privacy-data|privacy-settings
POST /api/classification/privacy-settings
GET  /api/classification/export-data
DELETE /api/classification/delete-data
```

### Surveillance
```
GET  /api/surveillance/config|to-check|alerts|stats
POST /api/surveillance/config|record-check|sync-with-classification
POST /api/surveillance/alerts/:alertId/read
```

### Unfollowers
```
GET  /api/unfollowers            -- list (with RevealGate unlock check)
GET  /api/ghost-followers
GET  /api/unfollowers/stats
GET  /api/unfollowers/unlocked/list
GET  /api/unfollowers/:id/unlocked
POST /api/unfollowers/:id/unlock
POST /api/unfollowers/unlock-all
POST /api/unfollowers/:id/mark-as-blocker
```

### Plans & Billing (Stripe)
```
GET  /api/plans
GET  /api/subscription/status|current
POST /api/subscription/force-pro  -- dev only (blocked in prod)
POST /api/checkout               -- Stripe Checkout session
POST /api/portal                 -- Stripe Customer Portal
POST /api/webhooks/stripe        -- Stripe webhooks
```

### User & Stats
```
GET  /api/users/:id
GET  /api/stats/:userId
POST /api/verification/generate-code
POST /api/users/connect
```

---

## Frontend Pages

```
/              Landing.tsx
/onboard       Onboard.tsx        (questionnaire + paywall)
/dashboard     Dashboard.tsx
/extension-auth ExtensionAuth.tsx (OAuth-style extension link page)
/how-it-works  HowItWorks.tsx
/pricing       Pricing.tsx + PlanComparison.tsx
/upgrade       UpgradeToPro.tsx
/storytelling  Storytelling.tsx
/verification  Verification.tsx
/legal         LegalNotice.tsx, Terms.tsx, Privacy.tsx, Cookies.tsx
```

### Key Components
- `ConnectDialog.tsx` — login/register modal (reference OLED style)
- `RevealGate.tsx` — 5-question consciousness check before showing unfollowers
- `PricingModal.tsx` — conversion modal
- `AIInsightsSummary.tsx` — Step 11 conversion wall
- `AccountSwitcher.tsx` — switch between linked IG accounts
- `SettingsModal.tsx` — account/notifications/privacy tabs
- `classification/`, `surveillance/`, `pro/` — feature-specific components

---

## Onboarding Flow

1. Consent & warning
2. Usage mode (personal / professional)
3. Demographics (continent → country selector)
4. Steps 3–9: 14-question introspection questionnaire
   - Phase 1: You (relationship profile, patterns)
   - Phase 2: The relationship (nature, real-life presence)
   - Phase 3: Introspection (who were you, emotional debt, responsibility)
   - Phase 4: The signal (unfollow as message, emotional reaction)
   - Phase 5: The future (hope, reflection frequency)
5. Step 10: Summary
6. **Step 11: AI Insights Summary** → 3 free insights + PricingModal (primary conversion)
7. Steps 12+: Email, password, Instagram username + extension-based verification

---

## RevealGate

5 consciousness-raising questions before revealing unfollower identities:
1. Feeling check (calm nervous system)
2. Recent tension (anchor in relational reality)
3. Unresolved relationships
4. First instinct
5. Conscious commitments (micro-contract)

---

## Relationship Score (waler.db)

Computed by `computeRelationshipScore()` in `routes.ts` (0–100):
- Likes given ×2 (max 30) + received ×2 (max 20)
- Consecutive likes streak ×4 (max 20)
- Days since first like / 7 (max 15)
- Mutual followers (max 15)
- Bonus for varied interactions (+10); penalties: unfollow (–20), ghost (–25)
- Bonuses: refollow (+15), follow/follow_back (+10)

---

## Environment Variables

```env
DATABASE_URL=postgresql://...supabase.com.../postgres
SESSION_SECRET=...          # Required in prod
ADMIN_API_TOKEN=...         # Required for /api/admin/* routes

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

CLIENT_URL=http://localhost:5000
PORT=5000
```

---

## Scripts

```
scripts/verify-user.ts          -- mark user as verified
scripts/fix-user-plan.ts        -- update plan + trigger analysis
scripts/check-user-stats.ts     -- check stored stats
scripts/delete-test-users.ts    -- delete test users (except agents)
scripts/generate-6digit.ts      -- generate verification codes
server/set-pro.ts               -- set Pro subscription manually
server/set-user-pro.ts          -- variant
```

---

## Known Gotchas

1. **Schema drift**: Supabase can be out of sync with Drizzle schema. Run `npm run db:push` after any schema change. On 2026-06-20, missing `owner_id` + `instagram_user_id` caused login 500s.
2. **ID mismatch**: Supabase `app_users.id` ≠ `waler.db users.id` for same Instagram account. Always resolve by username in waler.db.
3. **isPro freeze**: if `validate-token` fails (DB down), `isPro=false` gets stored. Popup self-heals on next open via `REFRESH_PRO_STATUS` (never downgrades on failure).
4. **Follower count**: use COUNT from `followers` table, not `app_users.followers_count` (stale cache).
5. **Instagram API**: `friendships/<id>/followers/?count=N` → 400 for large N. Cap at 50, paginate.
6. **Server restart required** after editing `routes.ts`.
7. **drizzle `users`** in code maps to physical `app_users` (schema.ts line 6) — raw SQL `FROM users` hits a DIFFERENT table.
