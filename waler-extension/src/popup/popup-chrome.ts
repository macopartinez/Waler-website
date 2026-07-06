// Version utilisant l'API Chrome native au lieu de webextension-polyfill

// Lecture du stockage ISOLÉE PAR COMPTE Instagram actif. Sans ça, le popup lit
// les clés globales (= compte principal) quel que soit le compte sélectionné, et
// affiche par ex. les « 211 unfollowers » du principal sur un compte secondaire.
import { accountGet } from '../background/account-storage.js';
import { DAILY_SCAN_BUDGET, getScanBudget } from '../content/scan-budget.js';
import { WEB_BASE } from '../config.js';
import {
  applyTranslations,
  fmt,
  getLanguage,
  setLanguage,
  t,
  type Language,
  type PopupTranslations,
} from './i18n.js';

// Dictionnaire actif du popup. Initialisé en anglais puis remplacé dans init()
// par la langue persistée (chrome.storage.local `walerLanguage`) AVANT tout
// rendu dynamique — les handlers ne tournent qu'après init.
let T: PopupTranslations = t('en');
let currentLanguage: Language = 'en';

/**
 * Sélecteur EN|FR du header : marque la langue active et bascule au clic.
 * Après persistance, on recharge le popup — c'est le moyen le plus robuste de
 * réappliquer TOUTES les traductions (statiques + libellés dynamiques déjà
 * rendus) sans devoir suivre chaque état de bouton.
 */
function setupLanguageSwitcher(): void {
  document.querySelectorAll<HTMLButtonElement>('#lang-switch .lang-btn').forEach((btn) => {
    const lang = (btn.getAttribute('data-lang') as Language) || 'en';
    btn.classList.toggle('active', lang === currentLanguage);
    btn.addEventListener('click', async () => {
      if (lang === currentLanguage) return;
      await setLanguage(lang);
      location.reload();
    });
  });
}

// ==================== ICÔNES (line minimalistes, style lucide) ====================
// Source de vérité unique des pictos du popup. Les éléments statiques portent
// `data-icon` (+ option `data-icon-variant="green|red"`) et sont peints par
// hydrateIcons(). Les boutons à états dynamiques fabriquent leur libellé via
// lbl()/ic() (en innerHTML, pour que l'icône survive aux changements d'état).
const ICON_PATHS: Record<string, string> = {
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  check: '<path d="M20 6 9 17l-4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
};

type IconVariant = '' | 'green' | 'red';

function ic(name: string, variant: IconVariant = ''): string {
  const cls = variant ? `ic ic-${variant}` : 'ic';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

/** Libellé « icône + texte » pour un bouton (à poser via innerHTML). */
function lbl(name: string, text: string, variant: IconVariant = ''): string {
  return `${ic(name, variant)}<span>${text}</span>`;
}

/** Libellé « spinner + texte » (état de chargement en cours). */
function loadingLbl(text: string): string {
  return `<span class="spinner-sm" style="width:13px;height:13px;"></span><span>${text}</span>`;
}

/**
 * Garantit que le content script est présent dans l'onglet Instagram avant de
 * lui envoyer une commande. Quand l'extension vient d'être (re)chargée, les
 * content scripts déclarés dans le manifest NE sont PAS injectés dans les
 * onglets déjà ouverts : il fallait recharger la page manuellement, sinon
 * chrome.tabs.sendMessage échouait ("Could not establish connection") et le
 * popup affichait "Erreur". Ici on ping le content script ; s'il ne répond pas,
 * on l'injecte à la volée (interceptor MAIN world + tracker) — équivalent à un
 * rechargement de page, sans action de l'utilisateur.
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const pong = (await chrome.tabs.sendMessage(tabId, { type: 'PING' })) as
      | { ready?: boolean }
      | undefined;
    if (pong?.ready) return true;
  } catch {
    // Pas de récepteur : le content script n'est pas encore injecté.
  }

  try {
    // Interceptor d'API (monde MAIN), comme au document_start d'un vrai chargement.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['injected/page-interceptor.js'],
      world: 'MAIN',
    });
    // Tracker principal (monde isolé) qui écoute les messages du popup.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/instagram-tracker.js'],
    });
    return true;
  } catch (error) {
    console.error('Failed to inject content script:', error);
    return false;
  }
}

/** Peint tous les emplacements statiques [data-icon] avec leur SVG. */
function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon') || '';
    const variant = (el.getAttribute('data-icon-variant') as IconVariant) || '';
    el.innerHTML = ic(name, variant);
  });
}

async function init() {
  try {
    const loading = document.getElementById('loading')!;
    const notAuthenticated = document.getElementById('not-authenticated')!;
    const authenticated = document.getElementById('authenticated')!;
    const subscriptionInactive = document.getElementById('subscription-inactive')!;

    // Charger la langue persistée et traduire le DOM statique AVANT d'afficher
    // les vues (les textes dynamiques utilisent ensuite le même dictionnaire T).
    currentLanguage = await getLanguage();
    T = t(currentLanguage);
    document.documentElement.lang = currentLanguage;
    applyTranslations(T);
    setupLanguageSwitcher();

    // Peindre les icônes statiques (les deux vues sont dans le DOM).
    hydrateIcons();

    const stored = await chrome.storage.local.get(['isAuthenticated', 'userId', 'lastSync', 'isPro', 'subscriptionActive']);

    loading.style.display = 'none';

    if (!stored.isAuthenticated) {
      notAuthenticated.style.display = 'block';
      setupLoginButton();
    } else if (stored.subscriptionActive === false) {
      subscriptionInactive.style.display = 'block';
      setupRenewButton();
    } else {
      authenticated.style.display = 'block';
      await loadStats();
      await checkInitialScanStatus();
      await setupAccountSwitcher();
      setupButtons();
      setupSectionTabs();
      setupGlobalStop();
      initProSection(stored.isPro === true);
      // Le flag stocké peut être figé/obsolète (ex. handshake fait pendant une
      // panne DB). On rafraîchit le statut Pro à la volée via le backend.
      refreshProSection();
      // Démarrer le refresh automatique seulement si authentifié
      setInterval(loadStats, 30000);
    }
  } catch (error) {
    console.error('Init error:', error);
    // Afficher quand même quelque chose en cas d'erreur
    const loading = document.getElementById('loading');
    if (loading) {
      loading.innerHTML = `<div style="color: #ff4444;">${T.common.loadingError}</div>`;
    }
  }
}

async function checkInitialScanStatus() {
  try {
    const stored = await accountGet(['followerDatabase', 'unfollowerDetected', 'unfollowerCount']);
    const initialScanBtn = document.getElementById('initial-scan-btn')!;
    const unfollowerAnalysisBtn = document.getElementById('unfollower-analysis-btn')!;
    const unfollowerAlert = document.getElementById('unfollower-alert')!;
    const unfollowerCountBadge = document.getElementById('unfollower-count-badge')!;
    
    if (!stored.followerDatabase || !stored.followerDatabase.isInitialized) {
      // Afficher le bouton de scan initial
      initialScanBtn.style.display = 'block';
    } else {
      initialScanBtn.style.display = 'none';
    }

    // Vérifier si des unfollowers ont été détectés
    if (stored.unfollowerDetected && stored.unfollowerCount > 0) {
      unfollowerAlert.style.display = 'block';
      unfollowerAnalysisBtn.style.display = 'block';
      unfollowerCountBadge.textContent = stored.unfollowerCount.toString();
    } else {
      unfollowerAlert.style.display = 'none';
      unfollowerAnalysisBtn.style.display = 'none';
    }

    await renderScanBudgetStatus();
  } catch (error) {
    console.error('Error checking initial scan status:', error);
  }
}

/**
 * Affiche la limite de sécurité du scan (budget/jour) : une mention permanente
 * discrète + une bannière si un scan est actuellement en pause pour cette
 * raison (budget épuisé ou rate-limit Instagram). Voir scan-budget.ts.
 */
async function renderScanBudgetStatus() {
  const noteEl = document.getElementById('scan-budget-note');
  const alertEl = document.getElementById('scan-budget-alert');
  const alertTitle = document.getElementById('scan-budget-alert-title');
  const alertBody = document.getElementById('scan-budget-alert-body');
  if (!noteEl || !alertEl || !alertTitle || !alertBody) return;

  noteEl.textContent = fmt(T.scanBudget.safetyNote, { n: DAILY_SCAN_BUDGET });

  try {
    const state = await getScanBudget();
    if (state.status === 'paused-budget') {
      alertTitle.textContent = T.scanBudget.pausedTitle;
      alertBody.textContent = fmt(T.scanBudget.pausedBody, { n: state.scannedToday });
      alertEl.style.display = 'block';
    } else if (state.status === 'rate-limited' && state.backoffUntil > Date.now()) {
      const time = new Date(state.backoffUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      alertTitle.textContent = T.scanBudget.rateLimitedTitle;
      alertBody.textContent = fmt(T.scanBudget.rateLimitedBody, { time });
      alertEl.style.display = 'block';
    } else {
      alertEl.style.display = 'none';
    }
  } catch (error) {
    console.error('Error reading scan budget status:', error);
    alertEl.style.display = 'none';
  }
}

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' }) as any;
    
    if (response && response.success && response.data) {
      const stats = response.data;
      
      document.getElementById('followers-count')!.textContent = (stats.followers || 0).toString();
      document.getElementById('unfollowers-count')!.textContent = (stats.unfollowers || 0).toString();
      document.getElementById('ghost-count')!.textContent = (stats.ghost || 0).toString();
      document.getElementById('pending-count')!.textContent = (stats.pendingClassification || 0).toString();
    } else {
      // Valeurs par défaut si pas de données
      document.getElementById('followers-count')!.textContent = '0';
      document.getElementById('unfollowers-count')!.textContent = '0';
      document.getElementById('ghost-count')!.textContent = '0';
      document.getElementById('pending-count')!.textContent = '0';
    }
  } catch (error) {
    console.error('Error loading stats:', error);
    document.getElementById('followers-count')!.textContent = '0';
    document.getElementById('unfollowers-count')!.textContent = '0';
    document.getElementById('ghost-count')!.textContent = '0';
    document.getElementById('pending-count')!.textContent = '0';
  }

  // Vérifier si une analyse est en cours
  await checkAnalysisStatus();

  const stored = await accountGet('lastSync');
  if (stored.lastSync) {
    const lastSync = new Date(stored.lastSync as number);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSync.getTime()) / 60000);
    
    let relativeTime: string;
    if (diffMinutes < 1) {
      relativeTime = T.sync.justNow;
    } else if (diffMinutes < 60) {
      relativeTime = fmt(T.sync.minutesAgo, { n: diffMinutes });
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        relativeTime = fmt(T.sync.hoursAgo, { n: diffHours });
      } else {
        const diffDays = Math.floor(diffHours / 24);
        const remHours = diffHours % 24;
        relativeTime = remHours > 0
          ? fmt(T.sync.daysHoursAgo, { d: diffDays, h: remHours })
          : fmt(T.sync.daysAgo, { n: diffDays });
      }
    }

    document.getElementById('sync-info')!.textContent = fmt(T.sync.lastSync, { time: relativeTime });
  }
}

async function checkAnalysisStatus() {
  try {
    const stored = await chrome.storage.local.get(['unfollowerCheckState', 'isAnalyzing']);
    const analysisIndicator = document.getElementById('analysis-indicator')!;
    const analysisProgress = document.getElementById('analysis-progress')!;
    const analysisStatus = document.getElementById('analysis-status')!;

    if (stored.isAnalyzing || stored.unfollowerCheckState) {
      // Analyse en cours
      analysisIndicator.style.display = 'block';
      
      if (stored.unfollowerCheckState) {
        const state = stored.unfollowerCheckState;
        const percentage = Math.round((state.currentIndex / state.missingFollowers.length) * 100);
        analysisProgress.textContent = `${percentage}%`;
        analysisStatus.textContent = fmt(T.analysis.checkingAccounts, {
          current: state.currentIndex,
          total: state.missingFollowers.length,
        });
      } else {
        analysisProgress.textContent = '0%';
        analysisStatus.textContent = T.analysis.initializing;
      }
    } else {
      // Pas d'analyse en cours
      analysisIndicator.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking analysis status:', error);
  }
}

// ==================== SÉLECTEUR DE COMPTE (MULTI-COMPTE) ====================

interface LinkedAccountView {
  dsUserId: string;
  igUsername: string;
  accountId?: number;
  avatarUrl?: string;
}

/**
 * Avatar de repli lettré (initiales sur fond vert de marque), identique au
 * `fallbackAvatar` du dashboard. On ignore volontairement la vraie photo IG
 * (`avatarUrl`), souvent un visage cartoon hors-thème, pour rester cohérent
 * avec le style minimaliste vert du reste de l'app.
 */
function letteredAvatar(seed: string): string {
  const s = encodeURIComponent(seed || 'waler');
  return `https://api.dicebear.com/7.x/initials/svg?seed=${s}&backgroundColor=16a34a,15803d,166534&fontWeight=600`;
}

async function setupAccountSwitcher() {
  const currentBtn = document.getElementById('account-current')!;
  const listEl = document.getElementById('account-list')!;
  const linkBtn = document.getElementById('account-link-btn')!;

  // Ouvre Instagram pour lier un nouveau compte (le popup de liaison s'affiche
  // sur le profil).
  linkBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.instagram.com/' });
  });

  currentBtn.addEventListener('click', () => {
    const open = listEl.style.display !== 'none';
    listEl.style.display = open ? 'none' : 'block';
    linkBtn.style.display = open ? 'none' : 'block';
    document.getElementById('account-caret')!.textContent = open ? '▼' : '▲';
  });

  await renderAccountSwitcher();
}

async function renderAccountSwitcher() {
  const nameEl = document.getElementById('account-current-name')!;
  const avatarEl = document.getElementById('account-current-avatar') as HTMLImageElement;
  const listEl = document.getElementById('account-list')!;

  // Feedback de chargement pendant la récupération des comptes (évite le « @— »
  // figé qui laisse croire que rien ne se passe).
  nameEl.innerHTML = `<span class="spinner-sm" style="width:13px;height:13px;"></span> ${T.common.loadingShort}`;
  // Avatar de repli immédiat : sans ça l'<img src=""> affiche l'icône d'image
  // cassée du navigateur pendant tout le chargement.
  avatarEl.src = letteredAvatar('waler');

  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' })) as any;
    const accountsMap: Record<string, LinkedAccountView> =
      resp && resp.success ? resp.accounts || {} : {};
    const activeDsUserId: string | null = resp?.activeDsUserId || null;
    const accounts = Object.values(accountsMap).filter((a) => !!a.accountId);

    const active = activeDsUserId ? accountsMap[activeDsUserId] : undefined;

    // Compte actif affiché en haut
    nameEl.textContent = active ? `@${active.igUsername}` : '@—';
    avatarEl.src = letteredAvatar(active?.igUsername || 'waler');

    // Liste des comptes
    listEl.innerHTML = '';
    if (accounts.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 10px 12px; font-size: 12px; color: hsl(240,5%,64.9%);';
      empty.textContent = T.accounts.noLinkedAccounts;
      listEl.appendChild(empty);
      return;
    }

    for (const acc of accounts) {
      const isActive = acc.dsUserId === activeDsUserId;
      const row = document.createElement('button');
      row.style.cssText = `width:100%; display:flex; align-items:center; gap:8px; padding:9px 12px; border:none; background:${isActive ? 'hsl(240,3.7%,20%)' : 'transparent'}; color:hsl(0,0%,98%); cursor:pointer; font-family:inherit; text-align:left;`;
      row.innerHTML = `
        <img src="${letteredAvatar(acc.igUsername)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;background:hsl(240,3.7%,25%);" />
        <span style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@${acc.igUsername}</span>
        ${isActive ? `<span style="font-size:11px;color:hsl(142,70%,55%);">${T.accounts.activeMarker}</span>` : ''}
      `;
      if (!isActive) {
        row.addEventListener('click', () => switchAccount(acc.dsUserId, row));
      }
      listEl.appendChild(row);
    }
  } catch (error) {
    console.error('Error rendering account switcher:', error);
    nameEl.textContent = '@—';
  }
}

async function switchAccount(dsUserId: string, row?: HTMLElement) {
  const listEl = document.getElementById('account-list')!;

  // Feedback immédiat : spinner sur la ligne cliquée + liste non-cliquable, le
  // temps que le compte actif change et que les vues se rechargent. Évite que
  // l'utilisateur reclique en croyant que rien ne s'est passé.
  if (row) {
    row.style.pointerEvents = 'none';
    listEl.style.opacity = '0.6';
    const marker = document.createElement('span');
    marker.className = 'spinner-sm';
    marker.style.cssText = 'width:14px;height:14px;';
    row.appendChild(marker);
  }

  try {
    await chrome.runtime.sendMessage({ type: 'SET_ACTIVE_ACCOUNT', dsUserId });
    // Recharger les vues dépendantes du compte actif (renderAccountSwitcher
    // reconstruit la liste, ce qui retire le spinner).
    await renderAccountSwitcher();
    await loadStats();
    await checkInitialScanStatus();
    await refreshProSection(); // ré-évaluer le statut Pro pour le compte actif
    // Réaligner le menu « Analyzed account » sur le nouveau compte actif (il suit
    // le compte du haut), puis recharger la liste People pour ce compte. Sans ça,
    // le menu Pro et les People resteraient figés sur l'ancien compte.
    await populateProAccountSelect();
    await loadPeople(true);
  } catch (error) {
    console.error('Error switching account:', error);
  } finally {
    // Refermer la liste et restaurer son état interactif dans tous les cas.
    listEl.style.opacity = '1';
    listEl.style.display = 'none';
    document.getElementById('account-link-btn')!.style.display = 'none';
    document.getElementById('account-caret')!.textContent = '▼';
  }
}

// ==================== SECTION PRO ====================

function setupSectionTabs() {
  const tabBase = document.getElementById('tab-base')!;
  const tabPro = document.getElementById('tab-pro')!;
  const baseSection = document.getElementById('base-section')!;
  const proSection = document.getElementById('pro-section')!;

  const activate = (which: 'base' | 'pro') => {
    const baseActive = which === 'base';
    baseSection.style.display = baseActive ? 'block' : 'none';
    proSection.style.display = baseActive ? 'none' : 'block';

    tabBase.style.background = baseActive ? 'hsl(240, 3.7%, 20%)' : 'transparent';
    tabBase.style.color = baseActive ? 'hsl(0,0%,98%)' : 'hsl(240,5%,64.9%)';
    tabPro.style.background = baseActive ? 'transparent' : 'hsl(240, 3.7%, 20%)';
    tabPro.style.color = baseActive ? 'hsl(240,5%,64.9%)' : 'hsl(0,0%,98%)';
  };

  tabBase.addEventListener('click', () => activate('base'));
  tabPro.addEventListener('click', () => {
    activate('pro');
    // Charger la liste des people à la première ouverture de l'onglet Pro
    loadPeople();
  });
}

/**
 * Bouton d'ARRÊT GLOBAL : envoie STOP_ALL au content script de chaque onglet
 * Instagram, qui stoppe toute tâche longue en cours (analyse Pro de conversation,
 * analyse d'engagement, scan d'unfollowers). Sans effet si rien ne tourne.
 */
function setupGlobalStop() {
  const btn = document.getElementById('global-stop-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.innerHTML;
    btn.setAttribute('disabled', 'true');
    btn.style.opacity = '0.6';
    try {
      const tabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });
      for (const tab of tabs) {
        if (tab.id == null) continue;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_ALL' });
        } catch {
          /* content script pas injecté sur cet onglet → on ignore */
        }
      }
      // Nettoyer le badge même si aucune tâche n'a répondu.
      void chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', text: '' }).catch(() => {});
      btn.innerHTML = lbl('check', T.common.stopDone);
    } catch (error) {
      console.error('Global stop error:', error);
      btn.innerHTML = lbl('x', T.common.error);
    } finally {
      setTimeout(() => {
        btn.innerHTML = original;
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
      }, 1500);
    }
  });
}

function initProSection(isPro: boolean) {
  const upsell = document.getElementById('pro-upsell')!;
  const content = document.getElementById('pro-content')!;

  if (isPro) {
    upsell.style.display = 'none';
    content.style.display = 'block';

    const refreshBtn = document.getElementById('pro-refresh-btn') as HTMLButtonElement | null;
    if (refreshBtn) refreshBtn.onclick = () => loadPeople(true);

    const engagementBtn = document.getElementById('pro-engagement-btn') as HTMLButtonElement | null;
    if (engagementBtn) engagementBtn.onclick = () => startProEngagement(engagementBtn);

    // Filet de sécurité « toujours demander avant d'ouvrir une conversation » :
    // lu par le content script (pro-conversation-collector) via la même clé de
    // stockage. Indépendant de la détection du point bleu.
    const alwaysAskBox = document.getElementById('pro-always-ask') as HTMLInputElement | null;
    if (alwaysAskBox) {
      void chrome.storage.local.get(PRO_ALWAYS_ASK_KEY).then((s) => {
        alwaysAskBox.checked = s[PRO_ALWAYS_ASK_KEY] === true;
      });
      alwaysAskBox.onchange = () => {
        void chrome.storage.local.set({ [PRO_ALWAYS_ASK_KEY]: alwaysAskBox.checked });
      };
    }

    void populateProAccountSelect();
  } else {
    upsell.style.display = 'block';
    content.style.display = 'none';

    const upgradeBtn = document.getElementById('upgrade-pro-btn') as HTMLButtonElement | null;
    if (upgradeBtn) upgradeBtn.onclick = () => {
      chrome.tabs.create({ url: `${WEB_BASE}/upgrade-to-pro` });
    };
  }
}

/**
 * Rafraîchit le statut Pro auprès du backend (cookie de session) et met à jour
 * l'affichage de la section Pro. Auto-répare un `isPro` figé/obsolète (ex.
 * handshake effectué pendant une panne DB).
 */
async function refreshProSection() {
  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'REFRESH_PRO_STATUS' })) as any;
    if (resp && resp.success) {
      initProSection(resp.isPro === true);
      await refreshSubscriptionGate();
    }
  } catch {
    /* best-effort : on garde l'affichage courant */
  }
}

/**
 * Re-vérifie l'état d'abonnement après un REFRESH_PRO_STATUS (qui a aussi
 * rafraîchi `subscriptionActive` côté service worker) et re-bascule
 * l'affichage si le cache initial était périmé (ex. renouvellement pendant
 * que le popup était déjà ouvert, ou abonnement expiré depuis le dernier
 * handshake).
 */
async function refreshSubscriptionGate() {
  const notAuthenticated = document.getElementById('not-authenticated')!;
  if (notAuthenticated.style.display === 'block') return; // pas connecté, rien à faire ici

  const { subscriptionActive } = await chrome.storage.local.get('subscriptionActive');
  const authenticated = document.getElementById('authenticated')!;
  const subscriptionInactive = document.getElementById('subscription-inactive')!;

  if (subscriptionActive === false) {
    authenticated.style.display = 'none';
    subscriptionInactive.style.display = 'block';
    setupRenewButton();
  } else {
    subscriptionInactive.style.display = 'none';
    authenticated.style.display = 'block';
  }
}

let peopleLoaded = false;
let peopleLoading = false;
// Compte Instagram ciblé par la section Pro (repli explicite si l'auto-détection
// se trompe). null = utiliser le compte actif déduit côté service worker.
let proSelectedUsername: string | null = null;

const PRO_ACCOUNT_KEY = 'proSelectedAccount';
// Réglage « toujours demander avant d'ouvrir une conversation » (filet de sécurité
// indépendant de la détection non-lu). Lu par pro-conversation-collector.ts.
const PRO_ALWAYS_ASK_KEY = 'proAlwaysAskBeforeOpen';

/**
 * Remplit le sélecteur « Compte analysé » de la section Pro à partir des comptes
 * liés (registre). Restaure le choix mémorisé, sinon le compte actif. Au
 * changement : mémorise + recharge la liste des People.
 */
async function populateProAccountSelect() {
  const select = document.getElementById('pro-account-select') as HTMLSelectElement | null;
  if (!select) return;

  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' })) as any;
    const accountsMap: Record<string, LinkedAccountView> =
      resp && resp.success ? resp.accounts || {} : {};
    const activeDsUserId: string | null = resp?.activeDsUserId || null;
    const accounts = Object.values(accountsMap).filter((a) => !!a.igUsername);

    // Le sélecteur Pro SUIT le compte actif (choisi dans le switcher du haut).
    // Le compte actif prime donc sur la valeur mémorisée, sinon la liste People
    // resterait figée sur un ancien compte après un changement de compte actif.
    // La valeur mémorisée ne sert que de repli quand aucun compte actif n'est
    // détecté. Un choix manuel dans ce menu ne dure que la session du popup.
    const stored = await chrome.storage.local.get(PRO_ACCOUNT_KEY);
    const activeUser = activeDsUserId ? accountsMap[activeDsUserId]?.igUsername : undefined;
    const initial = activeUser || (stored[PRO_ACCOUNT_KEY] as string) || accounts[0]?.igUsername || '';
    proSelectedUsername = initial || null;

    select.innerHTML = '';
    if (accounts.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = T.accounts.activeAccount;
      select.appendChild(opt);
    } else {
      for (const acc of accounts) {
        const opt = document.createElement('option');
        opt.value = acc.igUsername;
        opt.textContent = `@${acc.igUsername}`;
        if (acc.igUsername === initial) opt.selected = true;
        select.appendChild(opt);
      }
    }

    select.onchange = async () => {
      proSelectedUsername = select.value || null;
      await chrome.storage.local.set({ [PRO_ACCOUNT_KEY]: select.value });
      await loadPeople(true);
    };
  } catch (error) {
    console.error('Error populating pro account select:', error);
  }
}

async function loadPeople(force = false) {
  const loadingEl = document.getElementById('pro-people-loading')!;
  const emptyEl = document.getElementById('pro-people-empty')!;
  const listEl = document.getElementById('pro-people-list')!;

  // Ne pas recharger inutilement si déjà chargé (sauf rafraîchissement explicite)
  if (peopleLoaded && !force) return;
  // Éviter les appels concurrents qui doubleraient la liste
  if (peopleLoading) return;
  peopleLoading = true;

  loadingEl.style.display = 'flex';
  emptyEl.style.display = 'none';
  listEl.style.display = 'none';
  listEl.innerHTML = '';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PEOPLE', username: proSelectedUsername || undefined }) as any;
    peopleLoaded = true;
    loadingEl.style.display = 'none';

    const people: any[] = (response && response.success && Array.isArray(response.people)) ? response.people : [];

    if (people.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'flex';
    for (const person of people) {
      listEl.appendChild(renderPersonRow(person));
    }
  } catch (error) {
    console.error('Error loading people:', error);
    loadingEl.style.display = 'none';
    emptyEl.style.display = 'block';
  } finally {
    peopleLoading = false;
  }
}

function renderPersonRow(person: any): HTMLElement {
  const username = person.memberUsername || person.username || '';
  const fullName = person.fullName || '';
  const score = typeof person.relationshipScore === 'number' ? person.relationshipScore : null;
  // Profil pas encore préparé → le 1er « Analyze » collecte le profil (1 appel
  // API) AVANT d'analyser la conversation. Une fois préparé, « Analyze » va droit
  // à la conversation et un bouton « Refresh profile » permet de réactualiser.
  const profileCollected = !!person.profileCollectedAt;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; background: hsl(240,3.7%,15.9%); border:1px solid hsl(240,3.7%,20%); border-radius:10px; padding:10px 12px;';

  const info = document.createElement('div');
  info.style.cssText = 'min-width:0; flex:1;';
  info.innerHTML = `
    <div style="font-size:13px; font-weight:600; color:hsl(0,0%,98%); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${username}</div>
    <div style="font-size:11px; color:hsl(240,5%,64.9%); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${fullName}${score !== null ? ` · ${fmt(T.pro.scoreLabel, { n: score })}` : ''}</div>
  `;

  // Conteneur d'actions (Analyze + éventuellement Refresh profile).
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; align-items:center; gap:6px; flex-shrink:0;';

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.style.cssText = 'padding:8px 10px; font-size:12px; white-space:nowrap; flex-shrink:0;';
  btn.innerHTML = lbl('search', T.pro.analyze);
  btn.addEventListener('click', () => startProAnalysis(username, fullName, btn, !profileCollected));
  actions.appendChild(btn);

  // Profil déjà préparé : bouton de réactualisation du profil (1 appel API, sans
  // toucher à la conversation). Absent pour un nouveau People (la collecte est
  // intégrée au 1er « Analyze »).
  if (profileCollected) {
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn';
    refreshBtn.title = T.pro.refreshProfile;
    refreshBtn.setAttribute('aria-label', T.pro.refreshProfile);
    refreshBtn.style.cssText = 'padding:8px; font-size:12px; flex-shrink:0;';
    refreshBtn.innerHTML = ic('refresh');
    refreshBtn.addEventListener('click', () => refreshPersonProfile(username, refreshBtn));
    actions.appendChild(refreshBtn);
  }

  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

/** Collecte/actualise le profil d'un People (1 appel API), sans conversation. */
async function refreshPersonProfile(username: string, btn: HTMLButtonElement) {
  const originalHtml = btn.innerHTML;
  btn.setAttribute('disabled', 'true');
  btn.style.opacity = '0.6';
  btn.innerHTML = '<span class="spinner-sm" style="width:13px;height:13px;"></span>';
  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'COLLECT_PERSON_PROFILE', username })) as any;
    btn.innerHTML = resp?.success ? ic('check', 'green') : ic('x', 'red');
    if (resp?.success) {
      // Recharger la liste pour refléter le profil mis à jour.
      setTimeout(() => { void loadPeople(true); }, 600);
    } else {
      setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 2500);
    }
  } catch (error) {
    console.error('Error refreshing profile:', error);
    btn.innerHTML = ic('x', 'red');
    setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 2500);
  }
}

async function startProAnalysis(username: string, fullName: string, btn: HTMLButtonElement, collectProfileFirst = false) {
  const originalHtml = btn.innerHTML;
  btn.setAttribute('disabled', 'true');
  btn.style.opacity = '0.6';
  btn.innerHTML = '<span class="spinner-sm" style="width:13px;height:13px;"></span>';

  try {
    // Nouveau People : préparer le profil (1 appel API) AVANT la conversation.
    // Best-effort — un échec de collecte ne bloque pas l'analyse de conversation.
    if (collectProfileFirst) {
      btn.innerHTML = loadingLbl(T.buttonStates.profileLoading);
      try {
        await chrome.runtime.sendMessage({ type: 'COLLECT_PERSON_PROFILE', username });
      } catch (e) {
        console.warn('⚠️ Collecte de profil échouée (on poursuit la conversation):', e);
      }
      btn.innerHTML = '<span class="spinner-sm" style="width:13px;height:13px;"></span>';
    }

    const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });
    if (instagramTabs.length === 0 || !instagramTabs[0]?.id) {
      btn.innerHTML = lbl('x', T.buttonStates.openInstagram);
      setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 3000);
      return;
    }

    await ensureContentScript(instagramTabs[0].id);
    await chrome.tabs.sendMessage(instagramTabs[0].id, {
      type: 'START_PRO_CONVERSATION_ANALYSIS',
      username,
      fullName,
    });

    btn.innerHTML = lbl('check', T.buttonStates.started);
    // Décrémenter EN ATTENTE : cette personne est maintenant en cours de classement
    void chrome.runtime.sendMessage({ type: 'PERSON_CLASSIFIED' });
    // Donner le focus à l'onglet Instagram pour suivre l'analyse
    await chrome.tabs.update(instagramTabs[0].id, { active: true });
    setTimeout(() => { window.close(); }, 800);
  } catch (error) {
    console.error('Error starting pro analysis:', error);
    btn.innerHTML = lbl('x', T.common.error);
    setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 3000);
  }
}

// Lance l'analyse d'engagement (likes + commentaires) sur les posts du compte,
// pour TOUTES les People en un seul passage. Pas de username : le content script
// récupère lui-même la liste des People.
async function startProEngagement(btn: HTMLButtonElement) {
  const originalHtml = btn.innerHTML;
  btn.setAttribute('disabled', 'true');
  btn.style.opacity = '0.6';
  btn.innerHTML = loadingLbl(T.buttonStates.analyzing);

  try {
    const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });
    if (instagramTabs.length === 0 || !instagramTabs[0]?.id) {
      btn.innerHTML = lbl('x', T.buttonStates.openInstagram);
      setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 3000);
      return;
    }

    await ensureContentScript(instagramTabs[0].id);
    await chrome.tabs.sendMessage(instagramTabs[0].id, { type: 'START_PRO_ENGAGEMENT_ANALYSIS' });

    btn.innerHTML = lbl('check', T.buttonStates.started);
    await chrome.tabs.update(instagramTabs[0].id, { active: true });
    setTimeout(() => { window.close(); }, 800);
  } catch (error) {
    console.error('Error starting pro engagement:', error);
    btn.innerHTML = lbl('x', T.common.error);
    setTimeout(() => { btn.innerHTML = originalHtml; btn.removeAttribute('disabled'); btn.style.opacity = '1'; }, 3000);
  }
}

function setupLoginButton() {
  const loginBtn = document.getElementById('login-btn')!;
  loginBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: `${WEB_BASE}/extension-auth`,
    });
  });
}

function setupRenewButton() {
  const renewBtn = document.getElementById('renew-subscription-btn')!;
  renewBtn.onclick = () => {
    chrome.tabs.create({
      url: `${WEB_BASE}/billing`,
    });
  };
}

function setupButtons() {
  const initialScanBtn = document.getElementById('initial-scan-btn')!;
  const unfollowerAnalysisBtn = document.getElementById('unfollower-analysis-btn')!;
  const syncBtn = document.getElementById('sync-btn')!;
  const syncFullBtn = document.getElementById('sync-full-btn')!;
  const restoreDbBtn = document.getElementById('restore-db-btn')!;
  const dashboardBtn = document.getElementById('dashboard-btn')!;
  const resetStatsBtn = document.getElementById('reset-stats-btn')!;
  let isSyncing = false;
  let isAnalyzing = false;
  let isFullSyncing = false;

  // Bouton réinitialiser les stats
  resetStatsBtn.addEventListener('click', async () => {
    if (confirm(T.stats.resetConfirm)) {
      try {
        await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
        await loadStats();
        console.log('✅ Stats réinitialisées');
      } catch (error) {
        console.error('Error resetting stats:', error);
      }
    }
  });

  // Bouton synchronisation complète
  syncFullBtn.addEventListener('click', async () => {
    if (isFullSyncing) {
      console.log('⏳ Synchronisation complète déjà en cours...');
      return;
    }

    isFullSyncing = true;
    const originalHtml = syncFullBtn.innerHTML;
    syncFullBtn.innerHTML = loadingLbl(T.buttonStates.syncing);
    syncFullBtn.setAttribute('disabled', 'true');
    syncFullBtn.style.opacity = '0.6';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_FULL_DATABASE' });

      if (response.success) {
        syncFullBtn.innerHTML = lbl('check', fmt(T.buttonStates.followersSynced, { n: response.synced }));
        console.log('✅ Full sync successful:', response);

        setTimeout(() => {
          syncFullBtn.innerHTML = originalHtml;
          syncFullBtn.removeAttribute('disabled');
          syncFullBtn.style.opacity = '1';
          isFullSyncing = false;
        }, 3000);
      } else {
        syncFullBtn.innerHTML = lbl('x', T.buttonStates.syncError);
        console.error('❌ Full sync failed:', response.error);

        setTimeout(() => {
          syncFullBtn.innerHTML = originalHtml;
          syncFullBtn.removeAttribute('disabled');
          syncFullBtn.style.opacity = '1';
          isFullSyncing = false;
        }, 3000);
      }
    } catch (error) {
      console.error('Error during full sync:', error);
      syncFullBtn.innerHTML = lbl('x', T.common.error);

      setTimeout(() => {
        syncFullBtn.innerHTML = originalHtml;
        syncFullBtn.removeAttribute('disabled');
        syncFullBtn.style.opacity = '1';
        isFullSyncing = false;
      }, 3000);
    }
  });

  // Bouton restauration de la base locale depuis le backend (Dashboard → Base).
  // Reconstruit la DB locale de l'extension à partir des followers déjà en base,
  // sans re-scanner Instagram.
  restoreDbBtn.addEventListener('click', async () => {
    const originalHtml = restoreDbBtn.innerHTML;
    restoreDbBtn.innerHTML = loadingLbl(T.buttonStates.restoring);
    restoreDbBtn.setAttribute('disabled', 'true');
    restoreDbBtn.style.opacity = '0.6';

    const reset = (html: string) => {
      restoreDbBtn.innerHTML = html;
      setTimeout(() => {
        restoreDbBtn.innerHTML = originalHtml;
        restoreDbBtn.removeAttribute('disabled');
        restoreDbBtn.style.opacity = '1';
      }, 3000);
    };

    try {
      // tryRestoreFromBackend vit dans le content script → cibler un onglet Instagram.
      const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });
      if (instagramTabs.length === 0 || !instagramTabs[0]?.id) {
        reset(lbl('x', T.buttonStates.openInstagramFirst));
        return;
      }

      await ensureContentScript(instagramTabs[0].id);
      const response = (await chrome.tabs.sendMessage(instagramTabs[0].id, {
        type: 'RESTORE_FROM_BACKEND',
      })) as { success: boolean; count?: number };

      if (response?.success) {
        await loadStats();
        reset(lbl('check', fmt(T.buttonStates.followersRestored, { n: response.count ?? 0 })));
      } else {
        reset(lbl('info', T.buttonStates.noDataToRestore));
      }
    } catch (error) {
      console.error('Error restoring database:', error);
      reset(lbl('x', T.common.error));
    }
  });

  // Bouton scan initial
  initialScanBtn.addEventListener('click', async () => {
    initialScanBtn.innerHTML = loadingLbl(T.buttonStates.scanning);
    initialScanBtn.setAttribute('disabled', 'true');
    initialScanBtn.style.opacity = '0.6';

    try {
      // Chercher n'importe quel onglet Instagram (pas seulement l'onglet actif)
      const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });

      if (instagramTabs.length === 0 || !instagramTabs[0]?.id) {
        initialScanBtn.innerHTML = lbl('x', T.buttonStates.openInstagramFirst);
        initialScanBtn.removeAttribute('disabled');
        initialScanBtn.style.opacity = '1';
        return;
      }

      await ensureContentScript(instagramTabs[0].id);
      await chrome.tabs.sendMessage(instagramTabs[0].id, { type: 'START_INITIAL_SCAN' });
      initialScanBtn.innerHTML = lbl('check', T.buttonStates.scanStarted);

      setTimeout(() => {
        initialScanBtn.style.display = 'none';
      }, 2000);
    } catch (error) {
      console.error('Error starting initial scan:', error);
      initialScanBtn.innerHTML = lbl('x', T.buttonStates.errorOpenInstagram);
      initialScanBtn.removeAttribute('disabled');
      initialScanBtn.style.opacity = '1';
    }
  });

  // Bouton analyse des unfollowers
  unfollowerAnalysisBtn.addEventListener('click', async () => {
    if (isAnalyzing) {
      console.log('⏳ Analyse déjà en cours...');
      return;
    }

    isAnalyzing = true;
    unfollowerAnalysisBtn.innerHTML = loadingLbl(T.buttonStates.analyzing);
    unfollowerAnalysisBtn.setAttribute('disabled', 'true');
    unfollowerAnalysisBtn.style.opacity = '0.6';

    try {
      // Chercher n'importe quel onglet Instagram (pas seulement l'onglet actif) —
      // même pattern que les autres boutons, pour ne pas obliger l'utilisateur à
      // avoir Instagram au premier plan avant de lancer l'analyse.
      const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });

      if (instagramTabs.length === 0 || !instagramTabs[0]?.id) {
        unfollowerAnalysisBtn.innerHTML = lbl('x', T.buttonStates.openInstagramFirst);
        unfollowerAnalysisBtn.removeAttribute('disabled');
        unfollowerAnalysisBtn.style.opacity = '1';
        isAnalyzing = false;
        return;
      }

      // Envoyer un message au content script pour lancer l'analyse
      await ensureContentScript(instagramTabs[0].id);
      await chrome.tabs.sendMessage(instagramTabs[0].id, { type: 'START_UNFOLLOWER_ANALYSIS' });

      unfollowerAnalysisBtn.innerHTML = lbl('check', T.buttonStates.analysisStarted);

      setTimeout(() => {
        unfollowerAnalysisBtn.style.display = 'none';
        document.getElementById('unfollower-alert')!.style.display = 'none';
        isAnalyzing = false;
      }, 2000);
    } catch (error) {
      console.error('Error starting unfollower analysis:', error);
      unfollowerAnalysisBtn.innerHTML = lbl('x', T.common.error);
      unfollowerAnalysisBtn.removeAttribute('disabled');
      unfollowerAnalysisBtn.style.opacity = '1';
      isAnalyzing = false;
    }
  });

  syncBtn.addEventListener('click', async () => {
    // Empêcher les clics multiples
    if (isSyncing) {
      console.log('⏳ Synchronisation déjà en cours...');
      return;
    }

    isSyncing = true;
    syncBtn.innerHTML = loadingLbl(T.buttonStates.syncing);
    syncBtn.setAttribute('disabled', 'true');
    syncBtn.style.opacity = '0.6';
    syncBtn.style.cursor = 'not-allowed';

    try {
      // 1. Vérifier les notifications pour détecter les unfollowers cachés
      syncBtn.innerHTML = loadingLbl(T.buttonStates.checkingNotifications);
      await chrome.runtime.sendMessage({ type: 'CHECK_NOTIFICATIONS' });

      // 2. Synchroniser normalement
      syncBtn.innerHTML = loadingLbl(T.buttonStates.syncing);
      await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
      await loadStats();
      syncBtn.innerHTML = lbl('check', T.buttonStates.synced);

      setTimeout(() => {
        syncBtn.textContent = T.actions.quickSync;
        syncBtn.removeAttribute('disabled');
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
        isSyncing = false;
      }, 3000);
    } catch (error) {
      console.error('Sync error:', error);
      syncBtn.innerHTML = lbl('x', T.common.error);

      setTimeout(() => {
        syncBtn.textContent = T.actions.quickSync;
        syncBtn.removeAttribute('disabled');
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
        isSyncing = false;
      }, 2000);
    }
  });

  dashboardBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get('userId');
    chrome.tabs.create({
      url: `${WEB_BASE}/dashboard/${stored.userId}`,
    });
  });
}

// Écouter les messages du background script pour rafraîchir automatiquement
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_COMPLETED') {
    console.log('✅ Analysis completed, refreshing stats...', message.data);
    
    // Rafraîchir les stats immédiatement
    loadStats().then(() => {
      console.log('📊 Stats refreshed after analysis completion');
    });
    
    // Afficher une notification visuelle
    const analysisIndicator = document.getElementById('analysis-indicator');
    if (analysisIndicator) {
      analysisIndicator.style.display = 'none';
    }
    
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async response
});

init();


