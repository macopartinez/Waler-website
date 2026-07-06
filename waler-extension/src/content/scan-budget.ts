/**
 * scan-budget.ts — Couche sécurité du scan de followers.
 *
 * Objectif : rendre un scan de plusieurs milliers de followers indistinguable
 * d'une navigation humaine normale, sans jamais perdre le travail déjà fait.
 * Trois garde-fous, tous persistés PAR COMPTE Instagram (clé `scanBudget`,
 * cf. PER_ACCOUNT_KEYS dans account-storage.ts) :
 *
 *  1. Budget journalier  — plafond dur de followers capturés/jour (défaut 1500,
 *     posture prudente). Au-delà, le scan se met en pause et reprend le lendemain.
 *  2. Backoff rate-limit  — sur un 429 / "please wait a few minutes" d'Instagram,
 *     arrêt immédiat et reprise différée exponentielle (5 → 15 → 45 min…).
 *  3. Résumabilité        — l'ensemble `seen` (usernames déjà capturés) et le
 *     `targetCount` sont persistés, pour reprendre un baseline interrompu
 *     (reload, fermeture d'onglet, "Extension context invalidated") au lieu de
 *     tout recommencer.
 *
 * Ce module ne scrolle PAS et n'émet AUCUNE requête : il ne fait que décider si
 * l'on a le droit de continuer et mémoriser l'avancement. Le câblage dans le
 * scroller est fait à l'étape B.
 */

import { accountGet, accountSet } from '../background/account-storage.js';

const STORAGE_KEY = 'scanBudget';

/** Plafond de followers capturés par jour (posture prudente : 1500/j). */
export const DAILY_SCAN_BUDGET = 1500;

/**
 * Clé de debug GLOBALE (non préfixée par compte) permettant de surcharger le
 * budget journalier à chaud, sans rebuild — utile pour tester la pause/reprise
 * sur un petit compte. Depuis la console du service worker de l'extension :
 *
 *   chrome.storage.local.set({ debugScanBudgetOverride: 20 })   // active
 *   chrome.storage.local.remove('debugScanBudgetOverride')      // désactive
 *
 * Toute valeur numérique > 0 remplace DAILY_SCAN_BUDGET. À laisser inactif en prod.
 */
const DEBUG_BUDGET_KEY = 'debugScanBudgetOverride';

/** Budget journalier effectif = override debug s'il existe, sinon la constante. */
async function effectiveDailyBudget(): Promise<number> {
  try {
    const stored = await chrome.storage.local.get(DEBUG_BUDGET_KEY);
    const v = stored[DEBUG_BUDGET_KEY];
    if (typeof v === 'number' && v > 0) {
      console.log(`🧪 [scan-budget] Override debug actif : budget/jour = ${v}`);
      return v;
    }
  } catch {
    /* contexte invalidé — on retombe sur la constante */
  }
  return DAILY_SCAN_BUDGET;
}

/**
 * Paliers de backoff après un rate-limit, en millisecondes. On avance d'un
 * palier à chaque nouveau 429 ; on reste sur le dernier une fois atteint.
 */
const BACKOFF_LADDER_MS = [
  5 * 60 * 1000,   // 5 min
  15 * 60 * 1000,  // 15 min
  45 * 60 * 1000,  // 45 min
  2 * 60 * 60 * 1000, // 2 h
  6 * 60 * 60 * 1000, // 6 h (plafond)
];

export type ScanStatus =
  | 'idle'          // aucun baseline en cours
  | 'running'       // baseline en cours, autorisé à scanner
  | 'paused-budget' // budget journalier épuisé, reprise demain
  | 'rate-limited'  // Instagram a renvoyé un signal de limite, backoff actif
  | 'done';         // baseline complet atteint (targetCount capturé)

export interface ScanBudgetState {
  /** Jour local "YYYY-MM-DD" auquel `scannedToday` se rapporte. */
  dayStamp: string;
  /** Followers comptabilisés dans le budget aujourd'hui. */
  scannedToday: number;
  /** État courant du baseline. */
  status: ScanStatus;
  /** Usernames déjà capturés dans le baseline en cours (dédup + reprise). */
  seen: string[];
  /** Cible à atteindre (followerCount intercepté), 0 si inconnue. */
  targetCount: number;
  /** Timestamp (epoch ms) avant lequel on ne doit pas scanner ; 0 si aucun. */
  backoffUntil: number;
  /** Index courant dans BACKOFF_LADDER_MS (escalade des rate-limits). */
  backoffLevel: number;
  /** Dernière écriture (epoch ms), pour diagnostic. */
  updatedAt: number;
}

/** Résultat d'une vérification "ai-je le droit de scanner maintenant ?". */
export interface ScanGate {
  ok: boolean;
  reason: 'ok' | 'rate-limited' | 'budget-exhausted' | 'done';
  /** Followers encore autorisés aujourd'hui (0 si épuisé). */
  remainingToday: number;
  /** Si rate-limited : timestamp de reprise possible. */
  retryAt?: number;
  state: ScanBudgetState;
}

/** Jour local au format "YYYY-MM-DD" (le budget se raisonne en heure locale). */
function localDayStamp(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function freshState(now = Date.now()): ScanBudgetState {
  return {
    dayStamp: localDayStamp(now),
    scannedToday: 0,
    status: 'idle',
    seen: [],
    targetCount: 0,
    backoffUntil: 0,
    backoffLevel: 0,
    updatedAt: now,
  };
}

/**
 * Normalise un état brut lu du stockage : applique le reset journalier paresseux
 * (si le jour a changé, le compteur repart à 0 et une pause budget se lève) et
 * lève un backoff expiré. Le reset paresseux est plus robuste qu'une alarme :
 * il survit à la mise en veille du service worker.
 */
function normalize(raw: Partial<ScanBudgetState> | undefined, now = Date.now()): ScanBudgetState {
  const base = freshState(now);
  if (!raw) return base;

  const today = localDayStamp(now);
  const state: ScanBudgetState = {
    dayStamp: typeof raw.dayStamp === 'string' ? raw.dayStamp : today,
    scannedToday: Number.isFinite(raw.scannedToday as number) ? (raw.scannedToday as number) : 0,
    status: (raw.status as ScanStatus) ?? 'idle',
    seen: Array.isArray(raw.seen) ? raw.seen : [],
    targetCount: Number.isFinite(raw.targetCount as number) ? (raw.targetCount as number) : 0,
    backoffUntil: Number.isFinite(raw.backoffUntil as number) ? (raw.backoffUntil as number) : 0,
    backoffLevel: Number.isFinite(raw.backoffLevel as number) ? (raw.backoffLevel as number) : 0,
    updatedAt: now,
  };

  // Reset journalier paresseux : nouveau jour → budget réarmé.
  if (state.dayStamp !== today) {
    state.dayStamp = today;
    state.scannedToday = 0;
    state.backoffLevel = 0;
    // Une pause purement budgétaire se lève d'elle-même au nouveau jour ;
    // un baseline en cours redevient "running", un baseline fini reste "done".
    if (state.status === 'paused-budget') {
      state.status = state.targetCount > 0 ? 'running' : 'idle';
    }
  }

  // Backoff expiré → on le lève (le statut redevient running s'il y a un baseline).
  if (state.backoffUntil && now >= state.backoffUntil) {
    state.backoffUntil = 0;
    if (state.status === 'rate-limited') {
      state.status = state.targetCount > 0 ? 'running' : 'idle';
    }
  }

  return state;
}

/** Lit l'état du budget du compte actif (normalisé, jamais null). */
export async function getScanBudget(): Promise<ScanBudgetState> {
  const stored = await accountGet(STORAGE_KEY);
  return normalize(stored[STORAGE_KEY]);
}

async function save(state: ScanBudgetState): Promise<ScanBudgetState> {
  state.updatedAt = Date.now();
  await accountSet({ [STORAGE_KEY]: state });
  return state;
}

/**
 * Followers encore autorisés aujourd'hui (>= 0). `dailyBudget` permet d'injecter
 * le budget effectif (override debug) ; par défaut la constante.
 */
export function remainingToday(
  state: ScanBudgetState,
  dailyBudget: number = DAILY_SCAN_BUDGET
): number {
  return Math.max(0, dailyBudget - state.scannedToday);
}

/** True si un backoff rate-limit est actif à l'instant présent. */
export function isBackoffActive(state: ScanBudgetState, now = Date.now()): boolean {
  return state.backoffUntil > 0 && now < state.backoffUntil;
}

/**
 * Porte d'entrée : ai-je le droit de scanner maintenant ? À appeler AVANT
 * chaque portion de scroll. Ne modifie pas le budget (lecture seule normalisée),
 * mais persiste l'état si la normalisation l'a fait évoluer (reset de jour, fin
 * de backoff), pour garder le stockage cohérent.
 */
export async function checkScanGate(): Promise<ScanGate> {
  const state = await getScanBudget();
  await save(state); // persiste un éventuel reset journalier / backoff expiré
  const dailyBudget = await effectiveDailyBudget();

  if (isBackoffActive(state)) {
    return {
      ok: false,
      reason: 'rate-limited',
      remainingToday: remainingToday(state, dailyBudget),
      retryAt: state.backoffUntil,
      state,
    };
  }
  if (state.status === 'done') {
    return { ok: false, reason: 'done', remainingToday: remainingToday(state, dailyBudget), state };
  }
  if (remainingToday(state, dailyBudget) <= 0) {
    return { ok: false, reason: 'budget-exhausted', remainingToday: 0, state };
  }
  return { ok: true, reason: 'ok', remainingToday: remainingToday(state, dailyBudget), state };
}

/**
 * Démarre (ou reprend) un baseline. Idempotent : si un baseline est déjà en
 * cours pour ce compte, on conserve `seen` et on met simplement à jour la cible.
 * Renvoie les usernames déjà capturés (pour amorcer la dédup du scroller).
 */
export async function startBaseline(targetCount: number): Promise<ScanBudgetState> {
  const state = await getScanBudget();
  state.targetCount = targetCount > 0 ? targetCount : state.targetCount;
  if (state.status === 'idle' || state.status === 'done') {
    // Nouveau baseline : repartir d'un ensemble seen vierge.
    state.seen = [];
    state.status = 'running';
  } else {
    // Reprise d'un baseline interrompu : on garde seen.
    state.status = 'running';
  }
  return save(state);
}

/**
 * Enregistre une portion de followers capturés : met à jour l'ensemble `seen`
 * (dédup) et incrémente le budget du delta réellement nouveau. Renvoie l'état à
 * jour + combien de NOUVEAUX followers ont été comptés. À appeler après chaque
 * portion de scroll extraite.
 */
export async function recordCaptured(
  usernames: string[]
): Promise<{ state: ScanBudgetState; newlyCounted: number }> {
  const state = await getScanBudget();
  const seenSet = new Set(state.seen);
  let newlyCounted = 0;
  for (const u of usernames) {
    if (!seenSet.has(u)) {
      seenSet.add(u);
      newlyCounted++;
    }
  }
  state.seen = Array.from(seenSet);
  state.scannedToday += newlyCounted;

  const dailyBudget = await effectiveDailyBudget();
  if (state.targetCount > 0 && state.seen.length >= state.targetCount) {
    state.status = 'done';
  } else if (remainingToday(state, dailyBudget) <= 0) {
    state.status = 'paused-budget';
  }

  await save(state);
  return { state, newlyCounted };
}

/**
 * Déclenche un backoff suite à un signal de rate-limit d'Instagram. Escalade
 * d'un palier à chaque appel, passe le statut à `rate-limited`. Le baseline
 * reprendra automatiquement après `backoffUntil` (grâce à la persistance de
 * `seen`). Renvoie l'état avec le timestamp de reprise.
 */
export async function triggerBackoff(now = Date.now()): Promise<ScanBudgetState> {
  const state = await getScanBudget();
  const level = Math.min(state.backoffLevel, BACKOFF_LADDER_MS.length - 1);
  const delay = BACKOFF_LADDER_MS[level];
  state.backoffUntil = now + delay;
  state.backoffLevel = Math.min(state.backoffLevel + 1, BACKOFF_LADDER_MS.length - 1);
  state.status = 'rate-limited';
  console.warn(
    `🛑 [scan-budget] Rate-limit détecté → backoff ${Math.round(delay / 60000)} min ` +
      `(reprise à ${new Date(state.backoffUntil).toLocaleTimeString()})`
  );
  return save(state);
}

/**
 * Détecte un signal de rate-limit / action-block d'Instagram à partir d'une
 * réponse HTTP. Couvre le 429 classique et les corps "please wait a few minutes"
 * / feedback_required renvoyés en 200 par Instagram lors d'un throttle.
 */
export function isRateLimitSignal(status: number, bodyText?: string): boolean {
  if (status === 429) return true;
  if (!bodyText) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes('please wait a few minutes') ||
    t.includes('feedback_required') ||
    t.includes('rate limit') ||
    t.includes('try again later')
  );
}

/** Marque le baseline comme terminé (cible atteinte). */
export async function completeBaseline(): Promise<ScanBudgetState> {
  const state = await getScanBudget();
  state.status = 'done';
  return save(state);
}

/**
 * Réinitialise complètement le budget/baseline du compte actif (pour un
 * re-scan manuel depuis zéro).
 */
export async function resetScanBudget(): Promise<ScanBudgetState> {
  return save(freshState());
}
