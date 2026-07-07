// ==================== i18n DU POPUP (EN/FR) ====================
// Couche de traduction légère, sans framework, réservée aux pages du popup
// (index.html / suggestions.html). Le web app (client/) a son propre système ;
// celui-ci reprend le même ton (vouvoiement, FR naturel) mais reste autonome.
//
// - Dictionnaires `en` / `fr` structurellement identiques (typés l'un sur l'autre).
// - Langue persistée dans chrome.storage.local sous `walerLanguage`.
// - Défaut : langue du navigateur (fr* → 'fr', sinon 'en').

export type Language = 'en' | 'fr';

export const LANGUAGE_STORAGE_KEY = 'walerLanguage';

const en = {
  header: {
    subtitle: 'Instagram Analytics',
  },
  common: {
    loading: 'Loading...',
    loadingShort: 'Loading…',
    error: 'Error',
    loadingError: 'Loading error. Check the console.',
    stopAll: 'Stop everything',
    stopDone: 'Stopped',
  },
  auth: {
    notConnectedTitle: 'Not connected',
    notConnectedBody: 'Connect to Waler to start tracking your Instagram stats',
    signIn: 'Sign in',
  },
  subscription: {
    inactiveTitle: 'Subscription inactive',
    inactiveBody: 'Your Waler subscription is no longer active. Renew it to keep tracking your Instagram stats.',
    renewButton: 'Renew subscription',
  },
  accounts: {
    linkAccount: 'Link an Instagram account',
    noLinkedAccounts: 'No linked accounts. Open your Instagram profile to link one.',
    activeMarker: '● active',
    activeAccount: 'Active account',
  },
  stats: {
    sessionStats: 'Session stats',
    reset: 'Reset',
    resetConfirm: 'Are you sure you want to reset the session statistics?',
    newFollowers: 'New followers',
    unfollowers: 'Unfollowers',
    ghost: 'Ghost',
    pending: 'Pending',
  },
  analysis: {
    analyzing: 'Analyzing',
    initializing: 'Initializing...',
    checkingAccounts: 'Checking {current}/{total} accounts...',
  },
  sync: {
    title: 'Sync',
    active: 'Active',
    lastSyncNever: 'Last sync: Never',
    lastSync: 'Last sync: {time}',
    justNow: 'Just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    daysHoursAgo: '{d}d {h}h ago',
  },
  unfollowerAlert: {
    detected: 'Unfollowers detected',
    body: 'Click "Analyze unfollowers" to identify who unfollowed, blocked, or deleted their account.',
  },
  scanBudget: {
    safetyNote: 'Large accounts are scanned gradually — up to {n} followers/day — to keep your Instagram account safe.',
    largeAccountEstimate: 'Your account has {count} followers. At {budget}/day, a first full scan takes about {days} days — it runs on its own and resumes each day.',
    pausedTitle: 'Scan paused — daily limit reached',
    pausedBody: '{n} followers scanned today. The scan will resume automatically tomorrow.',
    rateLimitedTitle: 'Scan paused — Instagram slowed us down',
    rateLimitedBody: 'Instagram temporarily limited access. Resuming automatically around {time}.',
  },
  actions: {
    runInitialScan: 'Run initial scan',
    analyzeUnfollowers: 'Analyze unfollowers',
    analyzeUnfollowersTitle:
      'Open Instagram, then click to scan who unfollowed, blocked, or deleted their account. Keep the Instagram tab in the foreground during the analysis.',
    fullSync: 'Full sync — push all (Base → Dashboard)',
    fullSyncTitle:
      'Pushes your ENTIRE local follower database to the dashboard. Use this after an initial scan, or if the dashboard looks incomplete. Slower than Quick sync.',
    restore: 'Restore (Dashboard → Base)',
    restoreTitle:
      'Rebuilds your local database from the dashboard, without re-scanning Instagram. Use this after reinstalling the extension or switching device.',
    quickSync: 'Quick sync (new changes)',
    quickSyncTitle:
      'Fast sync: sends only pending changes and refreshes your follower count. Run it regularly. To re-send everything, use “Full sync” above.',
    openDashboard: 'Open dashboard',
    openDashboardTitle: 'Opens your dashboard in a new tab.',
  },
  buttonStates: {
    scanning: 'Scanning...',
    scanStarted: 'Scan started!',
    analyzing: 'Analyzing...',
    analysisStarted: 'Analysis started!',
    started: 'Started!',
    syncing: 'Syncing...',
    checkingNotifications: 'Checking notifications...',
    synced: 'Synced',
    syncError: 'Sync error',
    followersSynced: '{n} followers synced!',
    restoring: 'Restoring...',
    followersRestored: '{n} followers restored!',
    noDataToRestore: 'No data to restore',
    openInstagram: 'Open Instagram',
    openInstagramFirst: 'Open Instagram first',
    errorOpenInstagram: 'Error - Open Instagram',
    pleaseOpenInstagram: 'Please open Instagram in the active tab to start the analysis.',
    profileLoading: 'Profile…',
  },
  pro: {
    feature: 'Pro feature',
    upsellBody:
      'Conversation analysis is reserved for the Pro plan. Upgrade to Pro to analyze your conversation history and track how your relationships evolve.',
    upgrade: 'Upgrade to Pro',
    yourContacts: 'Your contacts (people)',
    analyzedAccount: 'Analyzed account',
    alwaysAsk: 'Always ask before opening a conversation',
    showCoach: 'Show live coaching in the conversation',
    analyzeEngagement: 'Analyze engagement (posts)',
    noContactsLine1: 'No contacts yet.',
    noContactsLine2: 'Add people in the dashboard (People section).',
    refreshList: 'Refresh list',
    analyze: 'Analyze',
    refreshProfile: 'Refresh profile',
    scoreLabel: 'score {n}/100',
  },
  suggestions: {
    back: '← Back',
    subtitle: 'Automatic classifications',
    pendingOne: '{n} suggestion pending',
    pendingMany: '{n} suggestions pending',
    empty: 'No suggestions yet',
    evidence: 'Evidence:',
    accept: '✓ Accept',
    reject: '✗ Reject',
    rejectReasonPrompt: 'Reason for rejection (optional):',
    errorAccepting: 'Error while accepting',
    errorRejecting: 'Error while rejecting',
  },
};

export type PopupTranslations = typeof en;

const fr: PopupTranslations = {
  header: {
    subtitle: 'Statistiques Instagram',
  },
  common: {
    loading: 'Chargement...',
    loadingShort: 'Chargement…',
    error: 'Erreur',
    loadingError: 'Erreur de chargement. Consultez la console.',
    stopAll: 'Tout arrêter',
    stopDone: 'Arrêté',
  },
  auth: {
    notConnectedTitle: 'Non connecté',
    notConnectedBody: 'Connectez-vous à Waler pour commencer à suivre vos statistiques Instagram',
    signIn: 'Se connecter',
  },
  subscription: {
    inactiveTitle: 'Abonnement inactif',
    inactiveBody: 'Votre abonnement Waler n\'est plus actif. Renouvelez-le pour continuer à suivre vos statistiques Instagram.',
    renewButton: 'Renouveler l\'abonnement',
  },
  accounts: {
    linkAccount: 'Lier un compte Instagram',
    noLinkedAccounts: 'Aucun compte lié. Ouvrez votre profil Instagram pour en lier un.',
    activeMarker: '● actif',
    activeAccount: 'Compte actif',
  },
  stats: {
    sessionStats: 'Stats de session',
    reset: 'Réinitialiser',
    resetConfirm: 'Voulez-vous vraiment réinitialiser les statistiques de session ?',
    newFollowers: 'Nouveaux abonnés',
    unfollowers: 'Désabonnés',
    ghost: 'Fantômes',
    pending: 'En attente',
  },
  analysis: {
    analyzing: 'Analyse en cours',
    initializing: 'Initialisation...',
    checkingAccounts: 'Vérification de {current}/{total} comptes...',
  },
  sync: {
    title: 'Synchronisation',
    active: 'Active',
    lastSyncNever: 'Dernière synchro : jamais',
    lastSync: 'Dernière synchro : {time}',
    justNow: "à l'instant",
    minutesAgo: 'il y a {n} min',
    hoursAgo: 'il y a {n} h',
    daysAgo: 'il y a {n} j',
    daysHoursAgo: 'il y a {d} j {h} h',
  },
  unfollowerAlert: {
    detected: 'Désabonnements détectés',
    body: 'Cliquez sur « Analyser les désabonnés » pour identifier qui s\'est désabonné, vous a bloqué ou a supprimé son compte.',
  },
  scanBudget: {
    safetyNote: 'Les gros comptes sont scannés progressivement — jusqu\'à {n} abonnés/jour — pour protéger votre compte Instagram.',
    largeAccountEstimate: 'Votre compte a {count} abonnés. À {budget}/jour, un premier scan complet prend environ {days} jours — il tourne tout seul et reprend chaque jour.',
    pausedTitle: 'Scan en pause — limite quotidienne atteinte',
    pausedBody: '{n} abonnés scannés aujourd\'hui. Le scan reprendra automatiquement demain.',
    rateLimitedTitle: 'Scan en pause — Instagram a ralenti l\'accès',
    rateLimitedBody: 'Instagram a temporairement limité l\'accès. Reprise automatique vers {time}.',
  },
  actions: {
    runInitialScan: 'Lancer le scan initial',
    analyzeUnfollowers: 'Analyser les désabonnés',
    analyzeUnfollowersTitle:
      'Ouvrez Instagram, puis cliquez pour identifier qui s\'est désabonné, vous a bloqué ou a supprimé son compte. Gardez l\'onglet Instagram au premier plan pendant l\'analyse.',
    fullSync: 'Synchro complète — tout envoyer (Base → Dashboard)',
    fullSyncTitle:
      'Envoie TOUTE votre base locale d\'abonnés vers le dashboard. À utiliser après un scan initial, ou si le dashboard semble incomplet. Plus lent que la synchro rapide.',
    restore: 'Restaurer (Dashboard → Base)',
    restoreTitle:
      'Reconstruit votre base locale à partir du dashboard, sans re-scanner Instagram. À utiliser après une réinstallation de l\'extension ou un changement d\'appareil.',
    quickSync: 'Synchro rapide (nouveaux changements)',
    quickSyncTitle:
      'Synchro rapide : n\'envoie que les changements en attente et actualise votre nombre d\'abonnés. À lancer régulièrement. Pour tout renvoyer, utilisez « Synchro complète » ci-dessus.',
    openDashboard: 'Ouvrir le dashboard',
    openDashboardTitle: 'Ouvre votre dashboard dans un nouvel onglet.',
  },
  buttonStates: {
    scanning: 'Scan en cours...',
    scanStarted: 'Scan lancé !',
    analyzing: 'Analyse en cours...',
    analysisStarted: 'Analyse lancée !',
    started: 'Lancé !',
    syncing: 'Synchronisation...',
    checkingNotifications: 'Vérification des notifications...',
    synced: 'Synchronisé',
    syncError: 'Erreur de synchro',
    followersSynced: '{n} abonnés synchronisés !',
    restoring: 'Restauration...',
    followersRestored: '{n} abonnés restaurés !',
    noDataToRestore: 'Aucune donnée à restaurer',
    openInstagram: 'Ouvrez Instagram',
    openInstagramFirst: 'Ouvrez Instagram d\'abord',
    errorOpenInstagram: 'Erreur — Ouvrez Instagram',
    pleaseOpenInstagram: 'Veuillez ouvrir Instagram dans l\'onglet actif pour lancer l\'analyse.',
    profileLoading: 'Profil…',
  },
  pro: {
    feature: 'Fonctionnalité Pro',
    upsellBody:
      'L\'analyse de conversations est réservée au plan Pro. Passez au plan Pro pour analyser votre historique de conversations et suivre l\'évolution de vos relations.',
    upgrade: 'Passer au plan Pro',
    yourContacts: 'Vos contacts (people)',
    analyzedAccount: 'Compte analysé',
    alwaysAsk: 'Toujours demander avant d\'ouvrir une conversation',
    showCoach: 'Afficher le coaching live dans la conversation',
    analyzeEngagement: 'Analyser l\'engagement (posts)',
    noContactsLine1: 'Aucun contact pour le moment.',
    noContactsLine2: 'Ajoutez des personnes dans le dashboard (section People).',
    refreshList: 'Actualiser la liste',
    analyze: 'Analyser',
    refreshProfile: 'Actualiser le profil',
    scoreLabel: 'score {n}/100',
  },
  suggestions: {
    back: '← Retour',
    subtitle: 'Classifications automatiques',
    pendingOne: '{n} suggestion en attente',
    pendingMany: '{n} suggestions en attente',
    empty: 'Aucune suggestion pour le moment',
    evidence: 'Éléments :',
    accept: '✓ Accepter',
    reject: '✗ Refuser',
    rejectReasonPrompt: 'Motif du refus (facultatif) :',
    errorAccepting: 'Erreur lors de l\'acceptation',
    errorRejecting: 'Erreur lors du rejet',
  },
};

const dictionaries: Record<Language, PopupTranslations> = { en, fr };

/** Dictionnaire complet pour une langue donnée. */
export function t(lang: Language): PopupTranslations {
  return dictionaries[lang] || dictionaries.en;
}

function defaultLanguage(): Language {
  try {
    return navigator.language && navigator.language.startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

/** Langue courante : valeur persistée, sinon langue du navigateur. */
export async function getLanguage(): Promise<Language> {
  try {
    const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
    const value = stored[LANGUAGE_STORAGE_KEY];
    if (value === 'en' || value === 'fr') return value;
  } catch {
    /* storage indisponible → défaut navigateur */
  }
  return defaultLanguage();
}

/** Persiste le choix de langue (partagé par toutes les pages du popup). */
export async function setLanguage(lang: Language): Promise<void> {
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: lang });
}

/** Interpolation minimaliste : fmt('Checking {current}/{total}', { current: 1, total: 9 }). */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

/** Résolution d'une clé pointée ('pro.refreshList') dans le dictionnaire. */
export function lookupKey(dict: PopupTranslations, path: string): string | undefined {
  let node: unknown = dict;
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Applique les traductions au DOM :
 * - [data-i18n="clé.pointée"]        → textContent
 * - [data-i18n-title="clé.pointée"]  → attribut title (tooltips)
 * Les éléments contenant des icônes gardent leur pictogramme : le texte est
 * porté par un <span data-i18n> imbriqué, jamais par le bouton entier.
 */
export function applyTranslations(dict: PopupTranslations, root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const value = lookupKey(dict, el.getAttribute('data-i18n') || '');
    if (value !== undefined) el.textContent = value;
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const value = lookupKey(dict, el.getAttribute('data-i18n-title') || '');
    if (value !== undefined) el.title = value;
  });
}
