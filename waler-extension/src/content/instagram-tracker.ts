// Using Chrome API
import { DOMObserver } from './dom-observer.js';
import { DataCollector } from './data-collector.js';
import { DMInterceptor, type DMMessage } from './dm-interceptor.js';
import { DMAnalyzer } from './dm-analyzer.js';
import { ScoringEngine, type Contact } from './scoring-engine.js';
import ScanOverlay from './scan-overlay.js';
import { InstagramAPIInterceptor } from './instagram-api-interceptor.js';
import { ActionRecorder } from './action-recorder.js';
import { InstagramModalScroller } from './instagram-modal-scroller.js';
import { FollowerExtractor } from './follower-extractor.js';
import { UnfollowerDetector } from './unfollower-detector.js';
import { NotificationChecker } from './notification-checker.js';
import { ProConversationCollector } from './pro-conversation-collector.js';
import { ProEngagementCollector } from './pro-engagement-collector.js';
import {
  accountGet,
  accountSet,
  accountRemove,
  getActiveDsUserId,
  setActiveDsUserId,
  migrateLegacyKeysToAccount,
  ensurePrimaryAccount,
  isAccountLinked,
} from '../background/account-storage.js';
import { maybePromptAccountLink, autoLinkPrimaryAccount } from './account-linker.js';
import { startBaseline, completeBaseline, triggerBackoff, getScanBudget, isBackoffActive } from './scan-budget.js';

// Interfaces pour la base de données de followers
interface FollowerEntry {
  username: string;
  avatarUrl?: string;
  addedAt: string;
  position?: number;
  // ID Instagram STABLE (pk). Insensible aux changements de pseudo : permet de
  // distinguer un vrai départ d'un simple renommage lors de l'analyse unfollower.
  pk?: string;
}

interface FollowerDatabase {
  followers: { [username: string]: FollowerEntry };
  lastScanDate: string;
  totalCount: number;
  firstFollowerId: string;
  isInitialized: boolean;
}

class InstagramTracker {
  private observer: DOMObserver;
  private collector: DataCollector;
  private dmInterceptor: DMInterceptor;
  private dmAnalyzer: DMAnalyzer;
  private scoringEngine: ScoringEngine;
  private currentUsername: string | null = null;
  // Vrai une fois `currentUsername` confirmé comme étant le compte CONNECTÉ
  // (résolu via ds_user_id), et non le profil affiché. Tant que c'est faux, on
  // n'exécute aucune opération destructrice par-compte (ex. heal/reset de base).
  private loggedInUsernameVerified = false;
  private dmSyncInterval: NodeJS.Timeout | null = null;
  private followersCache: Set<string> = new Set();
  private isInitialized = false;
  private followerCountObserver: MutationObserver | null = null;
  private lastFollowerCount: number = 0;
  private autoCheckInterval: NodeJS.Timeout | null = null;
  private lastUserActivity: number = Date.now();
  private readonly INACTIVITY_THRESHOLD = 2 * 60 * 1000; // 2 minutes
  
  // Nouvelles propriétés pour le système intelligent
  private followerDatabase: FollowerDatabase = {
    followers: {},
    lastScanDate: '',
    totalCount: 0,
    firstFollowerId: '',
    isInitialized: false
  };
  private isScanning: boolean = false;
  private scanProgress: { current: number; total: number } = { current: 0, total: 0 };
  private scanOverlay: ScanOverlay = new ScanOverlay();
  private apiInterceptor: InstagramAPIInterceptor = new InstagramAPIInterceptor();
  private recorder: ActionRecorder | null = null;
  private unfollowerDetector: UnfollowerDetector = new UnfollowerDetector();
  private notificationChecker: NotificationChecker = new NotificationChecker();
  private proCollector: ProConversationCollector;
  private proEngagementCollector: ProEngagementCollector;

  constructor() {
    this.observer = new DOMObserver();
    this.collector = new DataCollector();
    this.dmInterceptor = new DMInterceptor();
    this.dmAnalyzer = new DMAnalyzer();
    this.scoringEngine = new ScoringEngine();
    this.proCollector = new ProConversationCollector(this.scanOverlay);
    this.proEngagementCollector = new ProEngagementCollector(this.scanOverlay);
  }

  async init() {
    // PRIORITÉ ABSOLUE : Vérifier si une analyse unfollower est en cours
    // (navigation automatique entre profils). Cette vérification doit se faire
    // AVANT tout blocage pour que l'analyse puisse continuer.
    await this.unfollowerDetector.checkCurrentPageForUnfollower();

    if (this.isInitialized) return;

    // CRITIQUE : Ne pas réinitialiser pendant un scan actif (analyse unfollowers, etc.)
    // pour éviter l'interruption lors de la navigation vers /notifications ou autres pages
    if (this.isScanning) {
      console.log('⏸️ Init bloqué : scan modal en cours. Réessai dans 2s...');
      setTimeout(() => this.init(), 2000);
      return;
    }

    // Échappatoire MANUELLE : permet de tuer instantanément une analyse coincée
    // depuis la console (`__walerStop()`), sans attendre l'expiration automatique.
    (window as any).__walerStop = async () => {
      localStorage.removeItem('unfollowerCheckState');
      localStorage.removeItem('notificationCheckerAutoState');
      await accountSet({ isAnalyzing: false, unfollowerDetected: false, unfollowerCount: 0 });
      console.warn('✅ Analyse unfollower stoppée et nettoyée. Recharge la page (F5).');
    };

    // Vérifier si une analyse unfollower est en cours (navigation entre profils)
    const unfollowerCheckState = localStorage.getItem('unfollowerCheckState');
    const stored = await accountGet('isAnalyzing');
    if (unfollowerCheckState || stored.isAnalyzing) {
      // GARDE ANTI-FANTÔME : un scan interrompu/corrompu laisse ces drapeaux
      // allumés et piège l'init dans une boucle de 3s à l'infini. On ne bloque
      // QUE si l'analyse est réellement vivante. Est considéré « fantôme » (→ on
      // nettoie et on reprend normalement) :
      //   - un état SANS horodatage (legacy ou corrompu) ;
      //   - un état trop vieux (> 5 min de navigation = anormal) ;
      //   - un `isAnalyzing` orphelin (aucun état de navigation en localStorage).
      let startedAt = 0;
      if (unfollowerCheckState) {
        try { startedAt = JSON.parse(unfollowerCheckState).startedAt || 0; } catch { startedAt = 0; }
      }
      const STALE_MS = 5 * 60 * 1000;
      const isPhantom =
        (unfollowerCheckState && (startedAt === 0 || Date.now() - startedAt > STALE_MS)) ||
        (!unfollowerCheckState && stored.isAnalyzing);

      if (isPhantom) {
        console.warn('🧹 État d\'analyse fantôme détecté (scan interrompu) — nettoyage et reprise normale.');
        localStorage.removeItem('unfollowerCheckState');
        await accountSet({ isAnalyzing: false, unfollowerDetected: false, unfollowerCount: 0 });
      } else {
        console.log('⏸️ Init bloqué : analyse unfollower en cours (navigation entre profils). Réessai dans 3s...');
        setTimeout(() => this.init(), 3000);
        return;
      }
    }

    console.log('🔍 Waler Instagram Tracker initializing...');
    console.log('🆕 VERSION: API Interception Auto-Start v1.0');

    // Indice rapide depuis l'URL — MAIS extractUsername() lit le profil AFFICHÉ :
    // sur le profil de quelqu'un d'autre (une People qu'on consulte), il renvoie
    // SON pseudo, pas le nôtre. On l'écrase donc systématiquement par le pseudo
    // RÉEL du compte connecté (ds_user_id) avant toute logique par-compte.
    this.currentUsername = this.extractUsername();

    // AUTORITÉ : le compte suivi est TOUJOURS le compte connecté, jamais le profil
    // visité. Sans ça, visiter instagram.com/<une_people>/ faisait croire au
    // tracker que c'était notre compte → faux « N unfollowers » et, pire,
    // réinitialisation de la base du vrai compte (username stocké ≠ profil visité).
    await this.resolveLoggedInUsername();

    if (!this.currentUsername) {
      // Ni l'URL ni l'API n'ont donné le pseudo. Si on n'est même pas connecté,
      // inutile de continuer ; sinon on retentera la résolution plus tard.
      const loggedInId = this.getLoggedInUserId();
      if (!loggedInId) {
        console.log('❌ Could not detect Instagram username (utilisateur non connecté ?)');
        return;
      }
      console.log('ℹ️ Pseudo du compte connecté non résolu pour l\'instant — poursuite (retry ultérieur).');
    }

    // GATE ABONNEMENT : si le login Waler a un abonnement explicitement inactif
    // (Stripe annulé, past_due, etc.), on arrête tout tracking ici. On ne bloque
    // QUE sur `false` explicite — `undefined` (flag jamais encore récupéré, ex.
    // tout premier lancement avant la 1ère synchro) laisse passer, pour ne pas
    // bloquer un nouvel utilisateur avant que son statut soit connu.
    const subStatus = await chrome.storage.local.get('subscriptionActive');
    if (subStatus.subscriptionActive === false) {
      console.log('🚫 Abonnement Waler inactif — tracking désactivé.');
      return;
    }

    console.log(`✅ Tracking account: @${this.currentUsername}${this.loggedInUsernameVerified ? '' : ' (non vérifié)'}`);

    // Indiquer au collector quel compte suivre (filtre l'interception API)
    this.collector.setTrackedUsername(this.currentUsername);

    // MULTI-COMPTE : déterminer le compte Insta actif (ds_user_id) et basculer
    // le namespace de stockage AVANT toute lecture de données par-compte.
    await this.resolveActiveAccount();

    // Nettoyer un éventuel état corrompu (ex. fausse détection de 29000 unfollowers)
    await this.cleanupCorruptedState();

    // Charger la base de données de followers
    await this.loadFollowerDatabase();

    // Démarrer l'interception API pour détecter automatiquement les changements
    console.log('🔌 Starting continuous API interception...');
    this.apiInterceptor.start(
      (followers) => {
        // Callback pour les followers (utilisé pendant le scan)
      },
      (data) => {
        // Callback pour les informations utilisateur
        this.collector.processUserInfo(data);
      }
    );

    // Vérifier si un scan initial est nécessaire
    console.log('🔍 Checking initialization status...');
    console.log('📊 followerDatabase.isInitialized:', this.followerDatabase.isInitialized);
    console.log('📊 Total followers in DB:', Object.keys(this.followerDatabase.followers).length);
    
    if (!this.followerDatabase.isInitialized) {
      // Tenter d'abord de restaurer la base depuis le backend (followers déjà
      // synchronisés) pour éviter un re-scan complet d'Instagram.
      const restored = await this.tryRestoreFromBackend();
      if (restored) {
        console.log('✅ Base restaurée depuis le serveur, scan initial évité');
      } else {
        console.log('📊 First launch detected, initial scan required');
        await this.notifyInitialScanRequired();
      }
    } else {
      console.log('✅ Database already initialized, skipping initial scan');
    }

    await this.loadFollowersCache();

    // Auto-vérification des notifications (si état en cours)
    // Attendre que la page soit complètement chargée
    if (document.readyState === 'complete') {
      await this.notificationChecker.autoCheckNotifications();
    } else {
      window.addEventListener('load', async () => {
        await this.notificationChecker.autoCheckNotifications();
      });
    }

    // Reprendre une analyse de conversation Pro en attente (après navigation
    // vers /direct/inbox qui recharge le content script). Fire-and-forget pour
    // ne pas bloquer la fin de l'init.
    this.proCollector.resume();

    // Reprendre une analyse d'engagement Pro en attente (navigation de post en
    // post → reload du content script). Fire-and-forget.
    this.proEngagementCollector.resume();

    // Surveillance live des conversations (Pro) : met à jour les stats quand
    // l'utilisateur ouvre la conversation d'un contact suivi.
    this.startProLiveWatch();

    // Écouter les messages depuis la console pour déclencher l'Agent B
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'TRIGGER_AGENT_B_FROM_PAGE') {
        console.log('🤖 Message reçu pour déclencher l\'Agent B:', event.data.data);
        await this.unfollowerDetector.triggerAgentB(event.data.data.missingUsernames);
      }
    });

    // Activer le recorder avec Ctrl+Alt+R
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key === 'r') {
        e.preventDefault();
        if (!this.recorder) {
          console.log('🎬 Activation du Recorder Mode');
          this.recorder = new ActionRecorder();
        } else {
          console.log('⚠️ Recorder déjà actif');
        }
      }
    });

    this.observer.onEngagement((engagement) => {
      if (this.isSystemPage() || this.isOnOwnProfile()) {
        console.log(`🚫 Ignoring engagement on system page or own profile`);
        return;
      }
      
      this.collector.trackEngagement(engagement);
    });

    this.observer.start();

    console.log('📊 DOM observation started');

    // Observer automatique pour détecter l'ouverture du modal followers
    this.setupFollowersModalObserver();

    // Start follower count monitoring (PRIORITAIRE - avant le DM sync)
    await this.startFollowerCountMonitoring();

    // Start DM sync
    this.startDMSync();

    // Track user activity
    this.trackUserActivity();

    this.isInitialized = true;
    console.log('✅ Waler Instagram Tracker ready');
  }

  private extractUsername(): string | null {
    const metaTag = document.querySelector('meta[property="al:ios:url"]');
    if (metaTag) {
      const content = metaTag.getAttribute('content');
      const match = content?.match(/instagram:\/\/user\?username=([^&]+)/);
      if (match) return match[1];
    }

    // Chemins réservés qui ne sont PAS des usernames de profil
    const RESERVED_PATHS = [
      'explore', 'reels', 'reel', 'direct', 'accounts', 'stories',
      'notifications', 'p', 'tv', 'about', 'legal', 'privacy',
      'developer', 'directory', 'web', 'session', 'emails', 'challenge',
      'lite', 'igtv', 'ar', 'topics',
    ];

    const pathMatch = window.location.pathname.match(/^\/([^\/]+)/);
    if (pathMatch && !RESERVED_PATHS.includes(pathMatch[1])) {
      return pathMatch[1];
    }

    return null;
  }

  private isSystemPage(): boolean {
    const path = window.location.pathname;
    const systemPages = ['/explore', '/reels', '/direct', '/accounts', '/stories'];
    return systemPages.some(page => path.startsWith(page));
  }

  private isOnOwnProfile(): boolean {
    const path = window.location.pathname;
    return path === `/${this.currentUsername}` || path === `/${this.currentUsername}/`;
  }

  private async loadFollowerDatabase() {
    try {
      console.log('📂 Loading follower database from storage...');
      const stored = await accountGet('followerDatabase');
      console.log('📂 Storage result:', stored);
      
      if (stored.followerDatabase) {
        this.followerDatabase = stored.followerDatabase;
        const actualCount = Object.keys(this.followerDatabase.followers).length;
        console.log(`📦 Loaded follower database: ${actualCount} followers`);
        console.log('📦 Database isInitialized:', this.followerDatabase.isInitialized);
        console.log('📦 Database totalCount:', this.followerDatabase.totalCount);
        
        // NOTE: Ne pas synchroniser totalCount avec actualCount car :
        // - actualCount = nombre d'entrées dans la DB historique (inclut les unfollowers)
        // - totalCount devrait être le nombre RÉEL de followers actuels
        // La synchronisation se fera via l'API interceptor qui détecte le vrai nombre
        
        console.log(`📊 Database entries: ${actualCount} (historique)`);
        console.log(`📊 Database totalCount: ${this.followerDatabase.totalCount}`);
        console.log(`ℹ️ Waiting for API to detect real follower count...`);
      } else {
        console.log('📦 No follower database found in storage (first use)');
      }
    } catch (error) {
      console.error('Error loading follower database:', error);
    }
  }

  /**
   * Restaure la base de followers depuis le backend (followers déjà synchronisés
   * en base) au lieu de re-scanner Instagram. Utile quand le cache local a été
   * vidé. Renvoie true si des followers ont été restaurés.
   */
  async tryRestoreFromBackend(): Promise<boolean> {
    try {
      console.log('☁️ Tentative de restauration des followers depuis le serveur...');
      const resp = (await chrome.runtime.sendMessage({
        type: 'RESTORE_FOLLOWERS',
      })) as { success: boolean; followers?: Array<{ username: string; avatarUrl?: string; detectedAt?: string }>; totalCount?: number; error?: string };

      if (!resp?.success || !resp.followers || resp.followers.length === 0) {
        console.log('☁️ Aucune donnée à restaurer depuis le serveur', resp?.error ? `(${resp.error})` : '');
        return false;
      }

      const followers: { [username: string]: FollowerEntry } = {};
      let position = 0;
      for (const f of resp.followers) {
        if (!f.username) continue;
        followers[f.username] = {
          username: f.username,
          avatarUrl: f.avatarUrl,
          addedAt: f.detectedAt || new Date().toISOString(),
          position: position++,
        };
      }

      this.followerDatabase = {
        followers,
        lastScanDate: new Date().toISOString(),
        totalCount: resp.totalCount ?? Object.keys(followers).length,
        firstFollowerId: '',
        isInitialized: true,
      };

      await this.saveFollowerDatabase();
      // Aligner le cache des usernames pour la détection d'unfollowers.
      this.followersCache = new Set(Object.keys(followers));
      await accountSet({ followersCache: Array.from(this.followersCache) });

      console.log(`☁️ ${Object.keys(followers).length} followers restaurés depuis le serveur`);
      return true;
    } catch (error) {
      console.error('Error restoring followers from backend:', error);
      return false;
    }
  }

  private async updateFollowerCountToBackend(followerCount: number) {
    try {
      console.log(`📊 Sending follower count (${followerCount}) to backend...`);
      
      // Envoyer au service worker qui se chargera de l'envoi au backend
      chrome.runtime.sendMessage({
        type: 'UPDATE_USER_INFO',
        data: {
          username: this.currentUsername,
          followersCount: followerCount,
          followingCount: 0, // On mettra à jour plus tard si disponible
          postsCount: 0,
          bio: '',
          isPrivate: false,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error sending follower count:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('✅ Follower count sent successfully to backend');
        } else {
          console.warn('⚠️ Failed to send follower count:', response);
        }
      });
    } catch (error) {
      console.error('❌ Error updating follower count:', error);
    }
  }

  private async saveFollowerDatabase() {
    try {
      // NOTE: Ne PAS synchroniser totalCount avec le nombre d'entrées car :
      // - Nombre d'entrées = historique (inclut les unfollowers)
      // - totalCount = nombre réel de followers actuels (mis à jour par l'API)
      
      const entriesCount = Object.keys(this.followerDatabase.followers).length;
      
      await accountSet({ followerDatabase: this.followerDatabase });
      console.log(`💾 Follower database saved`);
      console.log(`   - Entries (historique): ${entriesCount}`);
      console.log(`   - totalCount (réel): ${this.followerDatabase.totalCount}`);
    } catch (error) {
      console.error('Error saving follower database:', error);
    }
  }

  private async loadFollowersCache() {
    try {
      const stored = await accountGet('followersCache');
      if (stored.followersCache) {
        this.followersCache = new Set(stored.followersCache);
        console.log(`📦 Loaded ${this.followersCache.size} followers from cache`);
      }
    } catch (error) {
      console.error('Error loading followers cache:', error);
    }
  }

  private async saveFollowersCache() {
    try {
      await accountSet({ followersCache: Array.from(this.followersCache) });
    } catch (error) {
      console.error('Error saving followers cache:', error);
    }
  }

  /**
   * Démarre la surveillance live des conversations Pro (si l'utilisateur est
   * abonné Pro) : récupère la liste des contacts et observe les ouvertures de
   * conversation pour mettre à jour les stats au fil de l'eau.
   */
  private async startProLiveWatch() {
    try {
      const stored = await accountGet('isPro');
      if (stored.isPro !== true) return;

      const resp = (await chrome.runtime.sendMessage({ type: 'GET_PEOPLE' })) as any;
      const people = resp && resp.success && Array.isArray(resp.people) ? resp.people : [];
      const usernames = people.map((p: any) => p.memberUsername).filter(Boolean);
      if (usernames.length > 0) {
        this.proCollector.startLiveWatch(usernames);
      }
      // Profils pas encore collectés (profileCollectedAt null) → le panneau rappelle
      // qu'il reste l'analyse complète (engagement) pour remplir les stats.
      const incomplete = people
        .filter((p: any) => !p.profileCollectedAt)
        .map((p: any) => p.memberUsername)
        .filter(Boolean);
      this.proCollector.setIncompleteProfiles(incomplete);
    } catch (error) {
      console.error('Error starting pro live watch:', error);
    }
  }

  private async notifyInitialScanRequired() {
    try {
      await chrome.runtime.sendMessage({
        type: 'INITIAL_SCAN_REQUIRED'
      });
    } catch (error) {
      console.error('Error sending initial scan notification:', error);
    }
  }

  private async updateScanProgress(current: number, total: number) {
    this.scanProgress = { current, total };
    
    try {
      await chrome.runtime.sendMessage({
        type: 'SCAN_PROGRESS',
        current,
        total
      });
    } catch (error) {
      console.error('Error updating scan progress:', error);
    }
  }

  private async updateBadge(text: string) {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        text
      });
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  /**
   * Start DM synchronization
   */
  private startDMSync() {
    // La fonctionnalité DM n'est pas encore implémentée (DMInterceptor est un stub).
    // On vérifie l'existence des méthodes pour ne pas planter l'initialisation.
    const interceptor = this.dmInterceptor as any;
    if (typeof interceptor.start !== 'function') {
      console.log('💬 DM interceptor non disponible (stub) - ignoré');
      return;
    }

    console.log('💬 Starting DM interceptor...');
    interceptor.start({});

    this.dmSyncInterval = setInterval(async () => {
      await this.syncDMs();
    }, 60000);

    console.log('💬 DM interceptor started');
  }

  private async syncDMs() {
    try {
      const interceptor = this.dmInterceptor as any;
      if (typeof interceptor.getConversations !== 'function') {
        return;
      }
      const conversations = interceptor.getConversations();
      
      if (conversations.length === 0) {
        console.log('💬 No DMs to sync');
        return;
      }

      const allMessages: any[] = [];
      
      conversations.forEach((conv: any) => {
        conv.messages.forEach((msg: any) => {
          allMessages.push({
            conversationId: conv.username,
            conversationWith: conv.username,
            messageId: `${conv.username}_${msg.timestamp}`,
            text: msg.text,
            timestamp: msg.timestamp,
            isSent: msg.isSent,
            mediaUrls: [],
            reactions: [],
            isRead: true
          });
        });
      });

      try {
        await chrome.runtime.sendMessage({
          type: 'SYNC_DMS',
          messages: allMessages,
          conversations: conversations.map(c => ({
            username: c.username,
            messageCount: c.messageCount,
            lastMessageAt: c.lastMessageAt
          }))
        });

        console.log(`💬 Synced ${allMessages.length} DMs from ${conversations.length} conversations`);
        await interceptor.saveConversations();
      } catch (msgError: any) {
        if (msgError.message?.includes('Extension context invalidated')) {
          console.log('⚠️ Extension reloaded, stopping DM sync');
          if (this.dmSyncInterval) {
            clearInterval(this.dmSyncInterval);
            this.dmSyncInterval = null;
          }
        } else {
          throw msgError;
        }
      }
    } catch (error) {
      console.error('Error syncing DMs:', error);
    }
  }

  /**
   * Track user activity for smart auto-check
   */
  private trackUserActivity() {
    const updateActivity = () => {
      this.lastUserActivity = Date.now();
    };

    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keydown', updateActivity);
    document.addEventListener('scroll', updateActivity);
    document.addEventListener('click', updateActivity);

    console.log('👤 User activity tracking enabled');
  }

  private isUserInactive(): boolean {
    return Date.now() - this.lastUserActivity > this.INACTIVITY_THRESHOLD;
  }

  /**
   * Nettoie un état corrompu provoqué par d'anciennes fausses détections
   * (ex. 29000 unfollowers issus du compteur d'un autre profil).
   */
  private async cleanupCorruptedState() {
    try {
      const ANOMALY_THRESHOLD = 1000;
      const stored = await accountGet(['unfollowerCount', 'unfollowerDetected', 'lastFollowerCount', 'followerDatabase']);

      let cleaned = false;

      // Invariant : le nombre d'unfollowers EN ATTENTE ne peut pas dépasser le
      // nombre de followers de la base locale (un « manquant » est forcément un
      // sous-ensemble de la base). Un compteur supérieur trahit une donnée
      // périmée/contaminée (ex. « 211 » hérité d'un autre compte). On le purge,
      // quel que soit son ordre de grandeur (le seuil de 1000 le laissait passer).
      const dbCount = stored.followerDatabase?.isInitialized
        ? Object.keys(stored.followerDatabase.followers || {}).length
        : 0;
      const impossiblePending =
        typeof stored.unfollowerCount === 'number' &&
        stored.unfollowerCount > 0 &&
        dbCount > 0 &&
        stored.unfollowerCount > dbCount;

      // Effacer une fausse détection d'unfollowers absurde
      if (
        (typeof stored.unfollowerCount === 'number' && stored.unfollowerCount > ANOMALY_THRESHOLD) ||
        impossiblePending
      ) {
        await accountRemove(['unfollowerDetected', 'unfollowerCount', 'unfollowerDetectedAt']);
        console.warn(`🧹 Fausse détection nettoyée: ${stored.unfollowerCount} unfollowers (base=${dbCount})`);
        cleaned = true;
      }

      // Réinitialiser un compteur de référence corrompu pour qu'il se resynchronise
      if (typeof stored.lastFollowerCount === 'number' && stored.lastFollowerCount > ANOMALY_THRESHOLD) {
        await accountRemove('lastFollowerCount');
        console.warn(`🧹 lastFollowerCount corrompu (${stored.lastFollowerCount}) réinitialisé`);
        cleaned = true;
      }

      if (cleaned) {
        // Effacer le badge erroné
        try {
          await chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', text: '' });
        } catch (e) {
          // ignore
        }
      }
    } catch (error) {
      console.error('Error cleaning corrupted state:', error);
    }
  }

  private async startFollowerCountMonitoring() {
    this.autoCheckInterval = setInterval(async () => {
      // Si l'extension a été rechargée/mise à jour, l'ancien content script reste
      // injecté dans l'onglet mais tout appel chrome.* lève « Extension context
      // invalidated ». On arrête le timer net pour ne pas spammer l'erreur
      // (la page sera rafraîchie pour ré-injecter un script frais).
      if (!chrome.runtime?.id) {
        if (this.autoCheckInterval) clearInterval(this.autoCheckInterval);
        return;
      }
      await this.detectAccountSwitch();
      this.checkFollowerCountChange();
      this.resumePendingNewFollowerScan();
    }, 30000);

    await this.detectAccountSwitch();
    await this.checkFollowerCountChange();
    await this.resumePendingNewFollowerScan();
    console.log('👥 Automatic follower monitoring started');
  }

  /**
   * Détecte une bascule de compte Instagram (ds_user_id) survenue DANS le même
   * onglet, sans rechargement de page. Sans cela, `this.followerDatabase` (chargé
   * une seule fois à l'init) resterait celui du compte précédent et les données
   * des deux comptes se mélangeraient (ex. 214 + 3 = 217).
   *
   * On réaligne le namespace de stockage ET on recharge la base en mémoire depuis
   * le namespace du NOUVEAU compte — en la vidant d'abord, pour ne jamais
   * conserver celle de l'ancien compte si le nouveau n'a pas encore de base.
   */
  private async detectAccountSwitch() {
    try {
      const current = this.getLoggedInUserId();
      if (!current) return;

      const active = await getActiveDsUserId();
      if (!active || active === current) return; // pas de changement

      console.log(`🔄 Bascule de compte Instagram détectée: ${active} → ${current} — réalignement`);

      // Réaligner compte principal/secondaire, namespace local et session backend.
      await ensurePrimaryAccount(current);
      await setActiveDsUserId(current);
      chrome.runtime.sendMessage({ type: 'SET_ACTIVE_ACCOUNT', dsUserId: current }).catch(() => {});

      // Repartir d'un état vierge puis recharger depuis le namespace du nouveau
      // compte (loadFollowerDatabase/Cache n'écrasent que si des données existent).
      this.currentUsername = null;
      this.followersCache = new Set();
      this.followerDatabase = {
        followers: {},
        lastScanDate: '',
        totalCount: 0,
        firstFollowerId: '',
        isInitialized: false,
      };
      await this.loadFollowerDatabase();
      await this.loadFollowersCache();
    } catch (error) {
      console.error('Error detecting account switch:', error);
    }
  }

  /**
   * Reprend une collecte de nouveau follower mise en attente : si un nouveau
   * follower a été détecté alors qu'on n'était pas sur le profil (modale
   * impossible à ouvrir), on relance la collecte dès qu'on arrive sur le profil.
   */
  private async resumePendingNewFollowerScan() {
    try {
      if (this.isScanning || !this.isOnOwnProfile()) return;

      const stored = await accountGet('pendingNewFollowerScan');
      const pendingRaw = stored.pendingNewFollowerScan as number | undefined;
      if (!pendingRaw || pendingRaw <= 0) return;

      // Garde-fou : un scan en attente ne peut pas dépasser le nombre RÉEL de
      // followers du compte. Une valeur aberrante (ex. 211 sur un compte de 3
      // followers) est une donnée périmée — on la borne, et on l'efface si le
      // compte n'a aucun follower.
      let pending = pendingRaw;
      const realCount = await this.fetchRealFollowerCount();
      if (realCount !== null && pendingRaw > realCount) {
        console.warn(`⚠️ pendingNewFollowerScan périmé (${pendingRaw} > ${realCount} followers réels) — corrigé`);
        if (realCount <= 0) {
          await accountRemove('pendingNewFollowerScan');
          return;
        }
        pending = realCount;
      }

      console.log(`🔁 Reprise de la collecte de ${pending} nouveau(x) follower(s) (sur le profil)`);
      await this.scanNewFollowersIntelligent(pending);
    } catch (error) {
      console.error('Error resuming pending new follower scan:', error);
    }
  }

  /**
   * Récupère l'ID du compte CONNECTÉ depuis le cookie ds_user_id.
   * Ce cookie est lisible par le content script et identifie l'utilisateur
   * connecté, indépendamment du profil actuellement affiché.
   */
  private getLoggedInUserId(): string | null {
    const match = document.cookie.match(/ds_user_id=(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Résout le pseudo RÉEL du compte connecté à partir de son ds_user_id (API
   * users/<id>/info), indépendamment du profil affiché. C'est la SEULE source
   * fiable de `currentUsername` : extractUsername() lit l'URL et renverrait le
   * pseudo d'une autre personne quand on consulte son profil. Marque
   * `loggedInUsernameVerified` pour autoriser ensuite les opérations par-compte.
   * En cas d'échec API (rate-limit…), on garde l'indice d'URL mais NON vérifié.
   */
  private async resolveLoggedInUsername(): Promise<void> {
    const userId = this.getLoggedInUserId();
    if (!userId) return;
    try {
      const resp = await fetch(`https://www.instagram.com/api/v1/users/${userId}/info/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'x-ig-app-id': '936619743392459' },
      });
      if (!resp.ok) {
        console.warn(`⚠️ [resolveLoggedInUsername] users/${userId}/info → HTTP ${resp.status} (pseudo non vérifié)`);
        return;
      }
      const data = await resp.json();
      const username: string | undefined = data?.user?.username;
      if (username) {
        if (username !== this.currentUsername) {
          console.log(`🔐 Compte connecté résolu via ds_user_id: @${username} (URL indiquait @${this.currentUsername ?? '?'})`);
          this.currentUsername = username;
          this.collector.setTrackedUsername(username);
        }
        this.loggedInUsernameVerified = true;
      }
    } catch (error) {
      console.warn('⚠️ [resolveLoggedInUsername] échec (pseudo non vérifié):', error);
    }
  }

  /**
   * MULTI-COMPTE : identifie le compte Insta connecté (ds_user_id) et bascule le
   * namespace de stockage. Migre les anciennes clés globales vers ce compte au
   * premier passage, puis propose la liaison si le compte n'est pas encore lié.
   */
  private async resolveActiveAccount() {
    try {
      const dsUserId = this.getLoggedInUserId();
      if (!dsUserId) return;

      // Le 1er compte vu = compte PRINCIPAL (celui de l'inscription Waler).
      // Il garde ses clés globales historiques (pas d'isolation, pas de migration,
      // pas de réinitialisation) et n'a pas à être "proposé" à la liaison.
      const isPrimary = await ensurePrimaryAccount(dsUserId);

      const previousActive = await getActiveDsUserId();

      if (!isPrimary) {
        // Compte SECONDAIRE uniquement : migration douce (une fois par compte) —
        // ne rapatrie les anciennes données globales que si elles appartiennent
        // VRAIMENT à ce compte (username concordant), pour ne pas contaminer.
        await migrateLegacyKeysToAccount(dsUserId, this.currentUsername || undefined);
      }

      if (previousActive !== dsUserId) {
        await setActiveDsUserId(dsUserId);
        console.log(
          `🔀 Compte Insta actif: ${dsUserId} (@${this.currentUsername})${isPrimary ? ' [principal]' : ''}`
        );
        // Aligner la session backend sur ce compte (si lié) pour que les syncs
        // atterrissent dans la bonne base. Fire-and-forget.
        chrome.runtime
          .sendMessage({ type: 'SET_ACTIVE_ACCOUNT', dsUserId })
          .catch(() => {});
      }

      if (!isPrimary) {
        // AUTO-RÉPARATION (comptes secondaires) : si les données de ce namespace
        // portent un username différent (contamination), on repart sur une base
        // vierge. JAMAIS pour le principal — ses données globales sont sacrées.
        await this.healContaminatedAccount();
      }

      // Liaison au login Waler, uniquement sur son propre profil.
      if (this.isOnOwnProfile() && !(await isAccountLinked(dsUserId))) {
        if (isPrimary) {
          // Compte principal : rattachement automatique silencieux (pas de popup).
          autoLinkPrimaryAccount({
            dsUserId,
            igUsername: this.currentUsername || '',
          });
        } else {
          // Compte secondaire : on propose la liaison.
          maybePromptAccountLink({
            dsUserId,
            igUsername: this.currentUsername || '',
          });
        }
      }
    } catch (error) {
      console.error('Error resolving active account:', error);
    }
  }

  /**
   * Réinitialise le namespace du compte actif si ses données appartiennent
   * manifestement à un autre compte (username stocké ≠ username courant). Corrige
   * la contamination provoquée par l'ancienne migration legacy.
   */
  private async healContaminatedAccount() {
    try {
      if (!this.currentUsername) return;
      // SÉCURITÉ : ne JAMAIS réinitialiser une base sur la foi d'un pseudo non
      // vérifié. Si `currentUsername` vient seulement de l'URL (profil consulté,
      // résolution API échouée), un mismatch avec le pseudo stocké est ATTENDU et
      // ne doit pas détruire les données du vrai compte connecté.
      if (!this.loggedInUsernameVerified) {
        console.log('🛡️ Heal ignoré : pseudo non vérifié (probable consultation d\'un autre profil).');
        return;
      }
      const stored = await accountGet('userInfo');
      const storedUsername: string | undefined = stored.userInfo?.username;
      if (
        storedUsername &&
        storedUsername.toLowerCase() !== this.currentUsername.toLowerCase()
      ) {
        console.warn(
          `🧹 Données contaminées pour @${this.currentUsername} (trouvé @${storedUsername}) — réinitialisation de la base de ce compte`
        );
        await accountSet({
          followerDatabase: {
            followers: {},
            isInitialized: false,
            totalCount: 0,
            firstFollowerId: '',
            lastScanDate: '',
          },
          sessionStats: { followers: 0, unfollowers: 0, potentialBlockers: 0, engagements: 0 },
          userInfo: { ...stored.userInfo, username: this.currentUsername },
        });
        await accountRemove([
          'lastFollowerCount',
          'lastFollowerCountSource',
          'lastFollowerCountAt',
          'unfollowerDetected',
          'unfollowerCount',
          'unfollowerDetectedAt',
          'followersCache',
          'lastNotificationCheck',
          'pendingNewFollowerScan',
        ]);
      }
    } catch (error) {
      console.error('Error healing contaminated account:', error);
    }
  }

  private async fetchRealFollowerCount(): Promise<number | null> {
    // Méthode 1 (FIABLE) : infos du compte CONNECTÉ via son user id (cookie ds_user_id).
    // Indépendant du profil affiché → évite de capter le compteur d'autres profils.
    try {
      const userId = this.getLoggedInUserId();
      if (userId) {
        // Même origine (www) pour éviter le blocage CORS depuis le content script
        const response = await fetch(`https://www.instagram.com/api/v1/users/${userId}/info/`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'x-ig-app-id': '936619743392459',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const user = data?.user;
          const count = user?.follower_count;
          if (typeof count === 'number') {
            // Corriger le username suivi si nécessaire
            if (user?.username && user.username !== this.currentUsername) {
              this.currentUsername = user.username;
              this.collector.setTrackedUsername(user.username);
            }
            return count;
          }
        } else {
          console.log(`⚠️ [API] users/${userId}/info a répondu ${response.status}`);
        }
      }
    } catch (error) {
      console.log('⚠️ [API] Echec récupération via ds_user_id:', error);
    }

    // Méthode 2 (fallback) : web_profile_info via le username suivi.
    // DANGER : hors de ton profil, `this.currentUsername` = le profil AFFICHÉ (ex.
    // @josh), donc cette requête renvoie les followers de QUELQU'UN D'AUTRE. Cause
    // confirmée du bug « 3 → 1138 » (followers de josh attribués à ton compte).
    // GARDE-FOU : on ne RETIENT le compteur que si l'`id` du profil interrogé ==
    // `ds_user_id` (le compte connecté). Sinon c'est un profil étranger → null.
    try {
      if (!this.currentUsername) return null;

      const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(this.currentUsername)}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        console.log(`⚠️ [API] web_profile_info a répondu ${response.status}`);
        return null;
      }

      const data = await response.json();
      const profile = data?.data?.user;
      const profileId = profile?.id != null ? String(profile.id) : null;
      const loggedInId = this.getLoggedInUserId();
      // Le profil interrogé n'est PAS le compte connecté → on refuse son compteur.
      if (loggedInId && profileId && profileId !== loggedInId) {
        console.warn(
          `🚫 [API] web_profile_info(@${this.currentUsername}) appartient à ${profileId} ≠ compte connecté ${loggedInId}. ` +
          `Compteur étranger IGNORÉ (pas de contamination).`
        );
        return null;
      }

      const count = profile?.edge_followed_by?.count;
      return typeof count === 'number' ? count : null;
    } catch (error) {
      console.log('⚠️ [API] Impossible de récupérer le nombre de followers via l\'API:', error);
      return null;
    }
  }

  /**
   * Récupère les followers les plus récents via l'API Instagram (la même qui
   * alimente la modale). Renvoie les usernames du plus récent au plus ancien.
   * Fonctionne depuis N'IMPORTE QUELLE page (pas besoin du profil ni de la
   * modale) → permet de collecter l'ID d'un nouveau follower partout.
   */
  private async fetchRecentFollowersFromAPI(limit: number): Promise<string[] | null> {
    try {
      const userId = this.getLoggedInUserId();
      if (!userId) return null;

      // Instagram rejette (400) les `count` trop élevés. On borne à 50 : les
      // nouveaux followers apparaissent en tête de liste, 50 suffit largement pour
      // une détection incrémentale (les gros scans passent par la modale).
      const safeCount = Math.min(Math.max(limit, 1), 50);
      const url = `https://www.instagram.com/api/v1/friendships/${userId}/followers/?count=${safeCount}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        console.log(`⚠️ [API] friendships/followers a répondu ${response.status}`);
        return null;
      }

      const data = await response.json();
      const users = data?.users;
      if (!Array.isArray(users)) return null;

      return users
        .map((u: any) => u?.username)
        .filter((name: any): name is string => typeof name === 'string' && name.length > 0);
    } catch (error) {
      console.log('⚠️ [API] Echec récupération des followers récents:', error);
      return null;
    }
  }

  /**
   * Lit le nombre de followers depuis le DOM (fallback si l'API échoue).
   */
  private getFollowerCountFromDOM(): number | null {
    const path = window.location.pathname;
    if (path !== `/${this.currentUsername}` && path !== `/${this.currentUsername}/`) {
      return null;
    }

    let followerCountElement: Element | null | undefined =
      document.querySelector('a[href*="/followers/"] span') ||
      document.querySelector('a[href$="/followers/"] span');

    if (!followerCountElement) {
      const spans = Array.from(document.querySelectorAll('span'));
      followerCountElement = spans.find(el => {
        const text = el.textContent?.trim() || '';
        return text.includes('follower') && /\d/.test(text);
      });
    }

    if (!followerCountElement) {
      const headerLinks = Array.from(document.querySelectorAll('header section ul li a'));
      for (const link of headerLinks) {
        if (link.getAttribute('href')?.includes('followers')) {
          followerCountElement = link.querySelector('span');
          break;
        }
      }
    }

    if (!followerCountElement) {
      return null;
    }

    // Instagram stocke le nombre EXACT dans l'attribut `title` (ex. title="1 234")
    // même quand l'affichage est abrégé ("1,2 k"). On le préfère pour la précision.
    const titleAttr =
      followerCountElement.getAttribute('title') ||
      followerCountElement.closest('[title]')?.getAttribute('title') ||
      '';
    const countText = titleAttr.trim() || followerCountElement.textContent?.trim() || '0';
    return this.parseFollowerCount(countText);
  }

  private async checkFollowerCountChange() {
    try {
      // Vérifier si le contexte de l'extension est toujours valide
      if (!chrome.runtime?.id) {
        console.log('⚠️ Extension context invalidated, stopping monitoring');
        if (this.autoCheckInterval) {
          clearInterval(this.autoCheckInterval);
        }
        return;
      }

      // Ne pas vérifier pendant un scan actif pour éviter l'interférence
      if (this.isScanning) {
        return;
      }

      // 1. Source principale : le DOM de NOTRE profil. C'est exactement le nombre
      //    que l'utilisateur voit, donc le plus frais. L'API users/info met son
      //    `follower_count` en cache et peut rester en retard de plusieurs minutes
      //    après un unfollow (ex. affiche 214 alors que le profil montre 213) →
      //    masque les vrais départs (diff=0). getFollowerCountFromDOM() ne renvoie
      //    une valeur que sur notre propre profil (sinon null), donc aucun risque
      //    de capter le compteur d'un autre compte.
      let count = this.getFollowerCountFromDOM();
      let source = 'DOM';

      // 2. Fallback : l'API Instagram (fonctionne hors de notre profil). MAIS on
      //    respecte le backoff global : si Instagram nous limite déjà (429/action-
      //    block → backoff armé dans scan-budget), on n'émet PAS cette requête
      //    toutes les 30s — marteler l'API pendant un throttling aggrave le risque.
      //    On saute simplement ce cycle (le DOM reprend la main dès qu'on repasse
      //    sur notre profil). Les appels internes au SCAN restent, eux, gouvernés
      //    par la porte du scroller (checkScanGate) en amont.
      if (count === null && !isBackoffActive(await getScanBudget())) {
        count = await this.fetchRealFollowerCount();
        source = 'API';
      }

      if (count === null) {
        console.log('⚠️ Impossible de déterminer le nombre de followers (API + DOM échoués)');
        return;
      }

      const stored = await accountGet(['lastFollowerCount', 'lastFollowerCountSource', 'lastFollowerCountAt', 'lastFollowerCountOwner']);
      const lastCount = stored.lastFollowerCount || 0;
      const lastSource = stored.lastFollowerCountSource || null;
      const lastCountAt = stored.lastFollowerCountAt || 0;
      const lastOwner = stored.lastFollowerCountOwner || null;

      // Identité du compte auquel `count` se rapporte : le compte CONNECTÉ
      // (cookie ds_user_id). `count` vient soit du DOM de notre profil, soit de
      // l'API users/<ds_user_id>/info → toujours ce compte. On estampille la
      // référence avec lui pour pouvoir détecter un croisement de données.
      const ownerId = this.getLoggedInUserId();
      const ownerStamp = ownerId ? { lastFollowerCountOwner: ownerId } : {};

      console.log(`🔍 [${source}] Checking: current=${count}, last=${lastCount}, diff=${count - lastCount}`);

      // GARDE-FOU IDENTITÉ : la référence stockée DOIT appartenir au compte
      // actuellement connecté. Si elle vient d'un AUTRE compte (ds_user_id
      // différent), ou n'est pas encore estampillée (donnée d'avant ce garde-fou),
      // on ne calcule JAMAIS de diff : on réattribue la référence au compte
      // courant, sans notification. Évite les faux "-211 unfollowers" quand les
      // données de deux comptes (ex. @pak ↔ @eth4nduvin) se croisent dans le
      // stockage partagé.
      if (lastCount !== 0 && ownerId && lastOwner !== ownerId) {
        if (lastOwner) {
          console.warn(`⚠️ [${source}] Référence d'un autre compte ignorée (owner=${lastOwner} ≠ connecté=${ownerId}). Resynchronisation sans notification.`);
        } else {
          console.log(`ℹ️ [${source}] Référence non estampillée — attribuée au compte ${ownerId} sans notification.`);
        }
        await accountSet({ lastFollowerCount: count, lastFollowerCountSource: source, lastFollowerCountAt: Date.now(), ...ownerStamp });
        this.lastFollowerCount = count;
        if (this.followerDatabase.isInitialized) {
          this.followerDatabase.totalCount = count;
          await this.saveFollowerDatabase();
          await this.updateFollowerCountToBackend(count);
        }
        return;
      }

      if (lastCount === 0) {
        await accountSet({ lastFollowerCount: count, lastFollowerCountSource: source, lastFollowerCountAt: Date.now(), ...ownerStamp });
        this.lastFollowerCount = count;
        console.log(`📊 [${source}] Initial follower count: ${count}`);

        // Mettre à jour aussi totalCount et envoyer au backend
        if (this.followerDatabase.isInitialized) {
          this.followerDatabase.totalCount = count;
          await this.saveFollowerDatabase();
          console.log(`💾 [${source}] Updated totalCount to ${count}`);

          // Envoyer au backend
          await this.updateFollowerCountToBackend(count);
        }
        return;
      }

      if (count !== lastCount) {
        const diff = count - lastCount;

        // ANTI-FLAPPING : ne jamais laisser l'API (mise en cache) écraser une
        // valeur récente issue du DOM (fraîche). Hors de notre profil, le DOM
        // n'est pas lisible et l'API peut renvoyer l'ancien total (ex. 214 alors
        // que le DOM avait corrigé à 213) → sinon on oscillerait entre faux
        // "+1 nouveau follower" et faux "-1 unfollower" à chaque navigation.
        // Une petite divergence API↔DOM est ignorée pendant une courte fenêtre
        // (le cache d'Instagram rattrape en quelques minutes). Passé ce délai, si
        // l'API persiste à diverger, c'est un vrai changement → on le prend.
        const CACHE_DIVERGENCE = 5;
        const ANTI_FLAP_WINDOW_MS = 10 * 60 * 1000; // 10 min
        const withinWindow = Date.now() - lastCountAt < ANTI_FLAP_WINDOW_MS;
        if (source === 'API' && lastSource === 'DOM' && Math.abs(diff) <= CACHE_DIVERGENCE && withinWindow) {
          console.log(`⏭️ [API] Divergence ignorée (API=${count} vs dernier DOM=${lastCount}) — cache API probablement en retard`);
          return;
        }

        // GARDE-FOU : un vrai changement entre deux vérifications (30s) est petit.
        // Un écart énorme signifie une donnée corrompue (ex. compteur d'un autre
        // profil capté par erreur). On resynchronise SANS déclencher de notification.
        const ANOMALY_THRESHOLD = 1000;
        if (Math.abs(diff) > ANOMALY_THRESHOLD) {
          console.warn(`⚠️ [${source}] Écart anormal détecté (${lastCount} → ${count}, diff=${diff}). Resynchronisation sans notification.`);
          await accountSet({ lastFollowerCount: count, lastFollowerCountSource: source, lastFollowerCountAt: Date.now(), ...ownerStamp });
          this.lastFollowerCount = count;
          if (this.followerDatabase.isInitialized) {
            this.followerDatabase.totalCount = count;
            await this.saveFollowerDatabase();
            await this.updateFollowerCountToBackend(count);
          }
          return;
        }

        console.log(`🔔 [${source}] Follower count changed: ${lastCount} → ${count} (${diff > 0 ? '+' : ''}${diff})`);

        await accountSet({ lastFollowerCount: count, lastFollowerCountSource: source, lastFollowerCountAt: Date.now(), ...ownerStamp });
        this.lastFollowerCount = count;

        // Mettre à jour totalCount et le backend avec le nombre réel
        if (this.followerDatabase.isInitialized) {
          this.followerDatabase.totalCount = count;
          await this.saveFollowerDatabase();
          await this.updateFollowerCountToBackend(count);
        }

        if (diff > 0) {
          await this.handleNewFollowers(diff);
        } else {
          await this.handleUnfollowers(Math.abs(diff));
        }
      } else {
        // Pas de changement apparent, mais vérifier les notifications
        // pour détecter les cas : +1 nouveau follower -1 unfollower = 0
        await this.checkForHiddenUnfollowers();
      }
    } catch (error) {
      console.error('Error checking follower count:', error);
    }
  }

  private parseFollowerCount(text: string): number {
    const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
    
    if (cleaned.includes('K')) {
      return Math.floor(parseFloat(cleaned) * 1000);
    } else if (cleaned.includes('M')) {
      return Math.floor(parseFloat(cleaned) * 1000000);
    }
    
    return parseInt(cleaned) || 0;
  }

  /**
   * Handle new followers (scan intelligent avec estimation)
   */
  private async handleNewFollowers(diff: number) {
    console.log(`🆕 ${diff} new follower(s) detected`);

    try {
      await chrome.runtime.sendMessage({
        type: 'FOLLOWER_CHANGE_DETECTED',
        count: diff,
        changeType: 'follower'
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }

    // Toujours collecter l'ID du/des nouveau(x) follower(s), que l'utilisateur
    // soit actif ou non. Sans cette collecte, sessionStats.followers reste à 0,
    // la DB n'est pas mise à jour et le dashboard ne reçoit jamais le nouveau
    // follower. Le scan ouvre brièvement la modale followers (en place, sans
    // recharger la page), récupère les nouveaux usernames et appelle
    // TRACK_FOLLOWER pour chacun (→ incrémente sessionStats + sync dashboard).
    try {
      await this.updateBadge(`+${diff}`);
    } catch (error) {
      console.error('Error updating badge:', error);
    }
    setTimeout(() => {
      this.scanNewFollowersIntelligent(diff);
    }, 1500);
  }

  /**
   * Handle unfollowers - Envoie une notification pour analyse manuelle
   */
  private async handleUnfollowers(diff: number) {
    console.log(`🚫 ${diff} unfollower(s) detected`);

    try {
      // Envoyer la notification au service worker
      await chrome.runtime.sendMessage({
        type: 'FOLLOWER_CHANGE_DETECTED',
        count: diff,
        changeType: 'unfollower'
      });

      // Stocker la baisse pour affichage dans le popup
      await accountSet({
        unfollowerDetected: true,
        unfollowerCount: diff,
        unfollowerDetectedAt: Date.now(),
      });

      // Mettre à jour le badge
      await this.updateBadge(`-${diff}`);

      console.log(`📢 Unfollower notification sent to popup`);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Vérifier les notifications pour détecter les unfollowers cachés
   * Logique : Si nouveaux followers dans notifications mais nombre total n'augmente pas assez → unfollowers cachés
   */
  private async checkForHiddenUnfollowers() {
    try {
      // DÉSACTIVÉ : la collecte des nouveaux followers se fait désormais via
      // l'API Instagram (fiable, IDs exacts). Le scan des notifications était
      // redondant et problématique : il naviguait vers /notifications/ (gênant)
      // et extrayait TOUTES les notifications « X started following you »
      // historiques (les 31 entrées vues dans les logs), au risque de les
      // compter comme de nouveaux followers. Retirer ce `return` pour le
      // réactiver (détection des unfollowers cachés via notifications).
      return;

      // Ne pas naviguer vers /notifications/ pendant une analyse unfollower
      if (localStorage.getItem('unfollowerCheckState')) {
        return;
      }
      const analysisStore = await accountGet('isAnalyzing');
      if (analysisStore.isAnalyzing) {
        return;
      }

      // Vérifier seulement toutes les 5 minutes pour éviter trop de requêtes
      const stored = await accountGet('lastNotificationCheck');
      const lastCheck = stored.lastNotificationCheck || 0;
      const now = Date.now();

      if (now - lastCheck < 5 * 60 * 1000) {
        return; // Moins de 5 minutes depuis la dernière vérification
      }

      // Si le compteur n'est pas encore chargé, impossible de comparer → on abandonne
      if (this.lastFollowerCount === 0) {
        console.log('⚠️ [HiddenUnfollower] Compteur de followers non chargé, vérification ignorée');
        return;
      }

      console.log('🔍 Checking notifications for hidden unfollowers...');
      
      const result = await this.notificationChecker.detectHiddenUnfollowers(this.followerDatabase);
      
      if (result.newFollowersFromNotifications.length > 0) {
        const newFollowersCount = result.newFollowersFromNotifications.length;
        console.log(`📢 Found ${newFollowersCount} new follower(s) in notifications`);
        
        // Ajouter les nouveaux followers à la base ET les tracker (TRACK_FOLLOWER
        // incrémente sessionStats.followers et synchronise avec le dashboard).
        for (const username of result.newFollowersFromNotifications) {
          if (this.followerDatabase.followers[username]) continue;
          this.followerDatabase.followers[username] = {
            username,
            addedAt: new Date().toISOString(),
            position: Object.keys(this.followerDatabase.followers).length + 1
          };

          try {
            await chrome.runtime.sendMessage({
              type: 'TRACK_FOLLOWER',
              data: {
                username,
                metadata: { detectedAt: new Date().toISOString(), source: 'notifications' }
              }
            });
          } catch (error) {
            console.error(`Error tracking new follower ${username} from notifications:`, error);
          }
        }

        // Synchroniser totalCount avec le nombre réel de followers
        this.followerDatabase.totalCount = Object.keys(this.followerDatabase.followers).length;
        
        // Calculer le nombre attendu vs le nombre réel
        const currentCount = this.lastFollowerCount; // Nombre actuel affiché
        const previousCount = this.followerDatabase.totalCount - newFollowersCount; // Nombre avant les nouveaux
        const expectedCount = previousCount + newFollowersCount; // Nombre attendu après les nouveaux
        
        console.log(`📊 Previous: ${previousCount}, New followers: ${newFollowersCount}, Expected: ${expectedCount}, Current: ${currentCount}`);
        
        if (currentCount < expectedCount) {
          // Il manque des followers → Unfollowers cachés détectés !
          const hiddenUnfollowers = expectedCount - currentCount;
          console.log(`⚠️ HIDDEN UNFOLLOWERS DETECTED! Expected ${expectedCount} but got ${currentCount} → ${hiddenUnfollowers} unfollower(s)`);
          
          // Sauvegarder la base mise à jour
          await accountSet({ followerDatabase: this.followerDatabase });
          
          // Déclencher l'analyse des unfollowers
          console.log('🚀 Triggering unfollower analysis due to hidden unfollowers...');
          await this.handleUnfollowers(hiddenUnfollowers);
        } else {
          // Tout est normal, juste des nouveaux followers (déjà ajoutés à la DB
          // et trackés ci-dessus). On notifie sans relancer de smart scan
          // (inutile : les usernames sont déjà connus et collectés).
          console.log('✅ No hidden unfollowers, just new followers');

          await accountSet({ followerDatabase: this.followerDatabase });

          try {
            await chrome.runtime.sendMessage({
              type: 'FOLLOWER_CHANGE_DETECTED',
              count: newFollowersCount,
              changeType: 'follower'
            });
            await this.updateBadge(`+${newFollowersCount}`);
          } catch (error) {
            console.error('Error notifying new followers:', error);
          }
        }
      }
      
      // Mettre à jour le timestamp de la dernière vérification
      await accountSet({ lastNotificationCheck: now });
      
    } catch (error) {
      console.error('Error checking for hidden unfollowers:', error);
    }
  }

  /**
   * Lance l'analyse complète des unfollowers (appelé depuis le popup)
   */
  async startUnfollowerAnalysis() {
    if (this.unfollowerDetector.isAnalysisRunning()) {
      console.log('⏳ Unfollower analysis already in progress');
      return;
    }

    try {
      console.log('🎬 Starting unfollower analysis...');
      this.isScanning = true;
      this.scanOverlay.show('Analyzing unfollowers...');

      // Lancer l'analyse
      const result = await this.unfollowerDetector.analyzeUnfollowers(this.currentUsername!);

      if (result.aborted) {
        // Scan incomplet : surtout NE PAS afficher « analyse réussie » (ce n'est
        // pas un vrai 0). On invite à re-scroller la liste.
        this.scanOverlay.showError(
          'Scan incomplet : fais défiler ta liste de followers jusqu\'en bas, puis relance l\'analyse.'
        );
      } else {
        this.scanOverlay.showSuccess(
          `Analysis complete!\n` +
          `Unfollows: ${result.unfollowed.length}\n` +
          `Blocks: ${result.blocked.length}\n` +
          `Google check: ${result.notFoundOnInstagram.length}`
        );
      }

      // NE PAS réinitialiser unfollowerDetected/unfollowerCount ici : analyzeUnfollowers
      // (et checkCurrentPageForUnfollower en fin de navigation) est SEUL maître du
      // cycle de vie du drapeau. Le forcer à 0 ici écrasait la détection que les
      // gardes (cache / complétude) venaient de conserver → l'unfollower
      // « disparaissait » juste après l'analyse.

      console.log('✅ Unfollower analysis completed');
    } catch (error) {
      console.error('Error during unfollower analysis:', error);
      this.scanOverlay.showError('Error while analyzing unfollowers');
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * SCAN INITIAL PROGRESSIF PAR PORTIONS
   */
  /**
   * Ouvre le modal followers de façon ROBUSTE — la même capacité que le scan
   * « basique » (performInitialScan*), factorisée pour que TOUTE fonction ayant
   * besoin du modal puisse l'ouvrir elle-même au lieu de supposer qu'il est déjà
   * ouvert :
   *   1. Si le modal est déjà ouvert → on le renvoie tel quel (aucune navigation).
   *   2. Sinon → on va sur le profil si besoin (le lien followers n'existe que là),
   *      on cherche le lien avec plusieurs stratégies + retries, on clique, puis on
   *      renvoie le modal.
   *
   * `options.navigate` (défaut true) : si false, on N'effectue PAS de
   * `window.location.href` — utile pour un scan déjà en cours qu'un rechargement
   * tuerait ; dans ce cas, hors du profil, on renvoie null et l'appelant gère son
   * propre repli.
   *
   * Renvoie l'élément modal, ou null si impossible à ouvrir.
   */
  private async ensureFollowersModalOpen(
    options: { navigate?: boolean } = {}
  ): Promise<Element | null> {
    const { navigate = true } = options;

    // 1. Déjà ouvert ? On le renvoie sans naviguer (évite tout effet de bord).
    let modal = document.querySelector('[role="dialog"]');
    if (modal) {
      console.log('✅ Followers modal already open!');
      return modal;
    }

    // 2. Aller sur le profil si nécessaire (le lien followers n'y est sinon pas).
    if (!this.isOnOwnProfile()) {
      if (!navigate) {
        console.log('ℹ️ Hors du profil et navigate=false → ouverture du modal impossible ici');
        return null;
      }
      console.log(`📍 Navigating to profile: /${this.currentUsername}`);
      window.location.href = `/${this.currentUsername}`;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 3. Trouver l'élément followers avec retries. Instagram ne rend plus le
    //    compteur comme un <a href="/…/followers/"> : c'est désormais un bouton
    //    React (`<a href="#">211 followers</a>`) ouvrant le modal via onClick.
    //    On cible donc par TEXTE ("followers"/"abonnés"), pas par href.
    console.log('🔍 Searching for followers button...');
    let followersEl: HTMLElement | null = null;
    const maxAttempts = 10;
    for (let attempts = 1; attempts <= maxAttempts && !followersEl; attempts++) {
      followersEl = this.findFollowersButton();
      if (!followersEl) {
        console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Waiting for page to load...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!followersEl) {
      console.error('❌ Followers button not found after multiple attempts');
      return null;
    }

    // 4. Cliquer l'élément (le onClick React ouvre le modal, sans recharger).
    console.log('✅ Followers button found:', followersEl.tagName, `"${(followersEl.textContent || '').trim().slice(0, 30)}"`);
    followersEl.click();

    // Laisser le onClick ouvrir le modal (léger polling plutôt qu'une attente fixe).
    for (let i = 0; i < 12 && !document.querySelector('[role="dialog"]'); i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    modal = document.querySelector('[role="dialog"]');
    if (!modal) {
      console.log('❌ Followers modal not found after click');
      return null;
    }
    console.log('✅ Modal opened successfully');
    return modal;
  }

  /**
   * Localise l'élément cliquable "followers" du header de profil, robuste aux
   * changements de DOM d'Instagram :
   *   1. Ancien rendu : <a href="/username/followers/"> (si jamais réintroduit).
   *   2. Rendu actuel : bouton React `<a href="#">211 followers</a>` — on cible
   *      par TEXTE ("followers"/"abonnés", multi-locale) et on remonte à
   *      l'ancêtre cliquable. Le lien /followers/ n'existant plus, le href ne
   *      sert plus de repère.
   * Renvoie l'élément à cliquer, ou null.
   */
  private findFollowersButton(): HTMLElement | null {
    // 1. Ancien lien href (compat).
    const legacy = document.querySelector<HTMLElement>(
      `a[href="/${this.currentUsername}/followers/"], a[href$="/followers/"]`
    );
    if (legacy) return legacy;

    // 2. Rendu actuel : élément textuel "followers"/"abonnés" → ancêtre cliquable.
    //    On borne la longueur pour éviter de matcher un paragraphe qui contient
    //    le mot, et on privilégie le 1er (le stat du header est en haut du DOM).
    const labelRe = /\bfollowers?\b|\babonn[ée]?s?\b/i;
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('header a, header div, header span, a, div, span')
    );
    // Les éléments "211 followers" sont imbriqués (div > a[href="#"] > span) et
    // renvoyés en ordre DOM, donc le <div> externe vient AVANT le <a> cliquable.
    // On PRIORISE le 1er élément ayant un ancêtre cliquable (le vrai bouton) ;
    // à défaut, on retombe sur le 1er élément au bon texte.
    let firstTextMatch: HTMLElement | null = null;
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (txt.length === 0 || txt.length > 40 || !labelRe.test(txt)) continue;
      if (!firstTextMatch) firstTextMatch = el;
      const clickable = el.closest<HTMLElement>('a, button, [role="link"], [role="button"]');
      if (clickable) return clickable;
    }
    return firstTextMatch;
  }

  async performInitialScan() {
    if (this.isScanning) {
      console.log('⏳ Scan already in progress');
      return;
    }

    this.isScanning = true;
    console.log('🎬 Starting initial follower scan...');
    await this.updateBadge('⏳');
    this.scanOverlay.show('Initial scan in progress...');

    try {
      // Ouvrir le modal followers automatiquement (helper robuste partagé).
      this.scanOverlay.updateProgress(0, 100, 'Opening the followers modal...');
      const modal = await this.ensureFollowersModalOpen();
      if (!modal) {
        console.error('❌ Followers modal could not be opened');
        this.scanOverlay.showError('Please open the followers modal manually and restart the scan');
        this.isScanning = false;
        return;
      }

      // Chercher le container scrollable (comme Playwright)
      // Essayer plusieurs stratégies
      let scrollContainer: HTMLElement | null = null;
      
      // Stratégie 1: Chercher un div avec overflow dans la modal
      const divs = modal.querySelectorAll('div');
      for (const div of Array.from(divs)) {
        const style = window.getComputedStyle(div);
        if ((style.overflow === 'auto' || style.overflow === 'scroll' || 
             style.overflowY === 'auto' || style.overflowY === 'scroll')) {
          scrollContainer = div as HTMLElement;
          console.log('✅ Found scrollable div with overflow');
          break;
        }
      }
      
      // Stratégie 2: Si pas trouvé, utiliser la modal elle-même
      if (!scrollContainer) {
        scrollContainer = modal as HTMLElement;
        console.log('⚠️ Using modal itself as scroll container');
      }
      
      console.log(`📏 Scroll container: scrollHeight=${scrollContainer.scrollHeight}, clientHeight=${scrollContainer.clientHeight}`);

      // Parser le nombre total de followers depuis plusieurs sources
      let totalFollowers = 0;
      
      // Stratégie 1: Depuis le titre de la modal
      const modalTitle = modal.querySelector('h1, div[role="dialog"] span');
      if (modalTitle) {
        const titleText = modalTitle.textContent || '';
        console.log(`📊 Modal title: "${titleText}"`);
        const match = titleText.match(/(\d+[\d,\.]*[KkMm]?)\s*(follower|abonné)/i);
        if (match) {
          totalFollowers = this.parseFollowerCount(match[1]);
          console.log(`✅ Parsed ${totalFollowers} followers from modal title`);
        }
      }
      
      // Stratégie 2: Depuis la page de profil (lien "X followers")
      if (totalFollowers === 0) {
        const profileFollowerLink = document.querySelector('a[href*="/followers/"]');
        if (profileFollowerLink) {
          const linkText = profileFollowerLink.textContent || '';
          console.log(`📊 Profile link text: "${linkText}"`);
          const match = linkText.match(/(\d+[\d,\.]*[KkMm]?)\s*(follower|abonné)/i);
          if (match) {
            totalFollowers = this.parseFollowerCount(match[1]);
            console.log(`✅ Parsed ${totalFollowers} followers from profile link`);
          }
        }
      }
      
      // Stratégie 3: Utiliser lastFollowerCount
      if (totalFollowers === 0 && this.lastFollowerCount > 0) {
        totalFollowers = this.lastFollowerCount;
        console.log(`✅ Using cached count: ${totalFollowers}`);
      }
      
      // Fallback final
      if (totalFollowers === 0) {
        totalFollowers = 100;
        console.log(`⚠️ Using fallback count: ${totalFollowers}`);
      }
      
      const portionSize = 100;
      const maxPortions = totalFollowers < 100 ? 1 : totalFollowers < 500 ? 5 : 10;
      
      console.log(`📊 Total followers: ${totalFollowers}, scanning in ${maxPortions} portions`);

      let scannedFollowers = new Set<string>();
      let lastCount = 0;
      let stableCount = 0;
      const maxStableChecks = 5; // Arrêter après 5 vérifications sans changement

      console.log('🔄 Starting API-based follower collection...');

      // Démarrer l'interception API
      let apiFollowers: string[] = [];
      this.apiInterceptor.start((followers) => {
        apiFollowers = followers;
        console.log(`📡 API intercepted ${followers.length} followers`);
      });

      // Fonction pour collecter les followers visibles
      const collectVisibleFollowers = () => {
        const links = modal.querySelectorAll('a[href^="/"]');
        for (const link of Array.from(links)) {
          const href = link.getAttribute('href');
          if (href) {
            const usernameMatch = href.match(/^\/([a-zA-Z0-9._]+)\/?(\?.*)?$/);
            if (usernameMatch) {
              const username = usernameMatch[1];
              const systemPages = ['explore', 'reels', 'direct', 'p', 'stories', 'tv', 'accounts'];
              if (!systemPages.includes(username) && !scannedFollowers.has(username)) {
                scannedFollowers.add(username);
              }
            }
          }
        }
      };

      // Pattern de scroll adaptatif et randomisé (basé sur Waler Recorder)
      // S'adapte au nombre de followers et ajoute de la variation naturelle
      
      // Calculer le scroll optimal en fonction du nombre de followers
      let baseScrollPx = 9; // Pattern de base enregistré
      let baseDelayMs = 58;
      
      if (totalFollowers > 1000) {
        // Énormément de followers : scroll encore plus rapide
        baseScrollPx = 50;
        baseDelayMs = 100;
      } else if (totalFollowers > 500) {
        // Beaucoup de followers : scroll plus rapide
        baseScrollPx = 25;
        baseDelayMs = 80;
      }
      
      console.log(`🚀 Starting adaptive scroll (${baseScrollPx}px/${baseDelayMs}ms for ${totalFollowers} followers)...`);
      
      while (stableCount < maxStableChecks) {
        // Collecter les followers visibles
        collectVisibleFollowers();
        
        const currentCount = scannedFollowers.size;
        const newFound = currentCount - lastCount;
        
        // Log toutes les 50 itérations pour ne pas spammer
        if (currentCount % 50 === 0 && currentCount !== lastCount) {
          console.log(`📊 Followers: ${currentCount}/${totalFollowers}`);
          await this.updateScanProgress(currentCount, totalFollowers);
          this.scanOverlay.updateProgress(currentCount, totalFollowers, `${currentCount}/${totalFollowers} followers`);
        }

        // Vérifier si on a tout chargé
        if (currentCount >= totalFollowers) {
          console.log('✅ All expected followers loaded!');
          break;
        }
        
        // Vérifier la stabilité
        if (currentCount === lastCount) {
          stableCount++;
        } else {
          stableCount = 0;
          lastCount = currentCount;
        }

        // Scroll avec variation naturelle (±30% du pattern de base)
        // Exemple : si base = 9px, variation entre 6.3px et 11.7px
        const scrollVariation = baseScrollPx * (0.7 + Math.random() * 0.6);
        scrollContainer.scrollTop += Math.round(scrollVariation);
        
        // Délai avec variation naturelle (±40% du délai de base)
        // Exemple : si base = 58ms, variation entre 34.8ms et 81.2ms
        const delayVariation = baseDelayMs * (0.6 + Math.random() * 0.8);
        await new Promise(resolve => setTimeout(resolve, Math.round(delayVariation)));
        
        // Pause aléatoire occasionnelle (simule l'hésitation humaine)
        if (Math.random() < 0.05) { // 5% de chance
          const pauseDuration = 200 + Math.random() * 500; // 200-700ms
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
        }
      }

      console.log(`✅ Scroll complete: ${scannedFollowers.size} followers collected from DOM`);

      // Arrêter l'interception API
      this.apiInterceptor.stop();
      
      // Combiner les followers du DOM et de l'API
      apiFollowers.forEach(username => scannedFollowers.add(username));
      
      console.log(`✅ Initial scan complete: ${scannedFollowers.size} followers loaded (DOM + API)`);

      // Sauvegarder dans la base
      this.followerDatabase.followers = {};
      const followersArray = Array.from(scannedFollowers);
      const firstFollower = followersArray[0];
      
      followersArray.forEach((username, index) => {
        this.followerDatabase.followers[username] = {
          username,
          addedAt: new Date().toISOString(),
          position: index
        };
      });

      this.followerDatabase.totalCount = scannedFollowers.size;
      this.followerDatabase.firstFollowerId = firstFollower;
      this.followerDatabase.lastScanDate = new Date().toISOString();
      this.followerDatabase.isInitialized = true;

      await this.saveFollowerDatabase();

      // Fermer la modal
      const closeButton = modal.querySelector('button[aria-label="Close"], button[aria-label="Fermer"]');
      if (closeButton) {
        (closeButton as HTMLButtonElement).click();
      }

      await this.updateBadge('✅');
      this.scanOverlay.showSuccess(`${scannedFollowers.size} followers scanned!`);
      console.log('✅ Initial scan completed successfully');

    } catch (error) {
      console.error('Error during initial scan:', error);
      this.scanOverlay.showError('Error during scan');
    } finally {
      this.isScanning = false;
      setTimeout(() => this.updateBadge(''), 3000);
    }
  }

  /**
   * SCAN INITIAL AVEC SMART SCROLLER (Nouvelle version optimisée)
   * Utilise InstagramModalScroller et FollowerExtractor
   */
  async performInitialScanWithSmartScroller() {
    if (this.isScanning) {
      console.log('⏳ Scan already in progress');
      return;
    }

    this.isScanning = true;
    console.log('🎬 Starting initial scan with Smart Scroller...');
    await this.updateBadge('⏳');
    this.scanOverlay.show('Smart scan in progress...');

    try {
      // 1. Ouvrir le modal followers automatiquement (helper robuste partagé) :
      //    déjà ouvert → réutilisé ; sinon navigation profil + recherche du lien
      //    avec stratégies/retries + clic. Plus de logique dupliquée ici.
      const modal = await this.ensureFollowersModalOpen();
      if (!modal) {
        this.scanOverlay.showError('Please open the followers modal manually and restart the scan');
        throw new Error('Followers modal could not be opened automatically.');
      }
      // Laisser le contenu du modal se charger avant de scroller.
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Couche sécurité : démarrer/reprendre le baseline sous budget.
      //    La cible = compteur réel d'Instagram ; permet au budget de savoir
      //    quand le baseline est complet et de reprendre s'il est interrompu.
      const targetCount =
        this.lastFollowerCount > 0
          ? this.lastFollowerCount
          : (await this.fetchRealFollowerCount()) || 0;
      await startBaseline(targetCount);
      console.log(`🎯 Baseline sous budget démarré (cible: ${targetCount || 'inconnue'})`);

      // Un rate-limit intercepté (429) déclenche le backoff ; le scroller
      // s'arrêtera à la prochaine porte budget et reprendra plus tard.
      this.apiInterceptor.onRateLimit(() => {
        void triggerBackoff();
      });

      // Fin de liste AUTHENTIQUE via l'API interceptée (100 % passif) : dès
      // qu'une réponse followers indique has_next_page=false, on sait qu'on a
      // tout — plus fiable que la détection "stuck" du scroller.
      let apiReachedEnd = false;
      this.apiInterceptor.onPageInfo((info) => {
        if (info.hasNextPage === false) apiReachedEnd = true;
      });

      // 5. Créer l'extracteur de données
      const extractor = new FollowerExtractor();

      // 6. Créer le scroller intelligent (mode budget) avec callback de progression
      const scroller = new InstagramModalScroller({
        enforceBudget: true, // budget/jour + backoff + reprise (scan-budget.ts)
        shouldStop: () => apiReachedEnd, // fin authentique via page_info intercepté
        maxScrollAttempts: 6, // 6 tentatives avant d'arrêter (équilibre entre patience et discrétion)
        scrollDelay: 400, // 400ms entre chaque scroll (plus lent = plus sûr)
        waitForLoadTimeout: 8000, // 8 secondes pour attendre le chargement (Instagram peut être lent)
        onProgress: (progress) => {
          console.log(`📊 Progress: ${progress.totalFollowers} followers scannés`);

          // Extraire les données au fur et à mesure du scroll
          extractor.extractAllVisible();

          this.scanOverlay.updateProgress(
            progress.totalFollowers,
            targetCount > 0 ? targetCount : progress.totalFollowers + 100,
            `${progress.totalFollowers}${targetCount > 0 ? `/${targetCount}` : ''} followers scannés`
          );
        }
      });

      // 7. Scroller jusqu'à la fin (ou jusqu'à la limite budget/backoff)
      console.log('🚀 Starting intelligent scroll to capture ALL followers...');
      const allUsernames = await scroller.scrollToEnd();
      const stopReason = scroller.lastStopReason;

      console.log(`✅ Scroll stopped (${stopReason}): ${allUsernames.length} followers found`);

      // 8. Vérifier qu'on a bien des usernames
      if (allUsernames.length === 0) {
        throw new Error('No followers found during scroll. Please try again.');
      }

      // Le baseline est-il COMPLET ? Seuls la fin de liste ou la cible atteinte
      // le garantissent. Une pause budget/rate-limit → baseline PARTIEL : on
      // persiste ce qu'on a mais on NE marque PAS isInitialized (reprise plus tard).
      const baselineComplete = stopReason === 'end-of-list' || stopReason === 'target-reached';

      // 9. Sauvegarder dans la base de données (usernames cumulés, reprise incluse)
      this.followerDatabase.followers = {};
      const firstFollower = allUsernames[0];

      console.log(`💾 Saving ${allUsernames.length} followers to database (complete=${baselineComplete})...`);

      allUsernames.forEach((username, index) => {
        this.followerDatabase.followers[username] = {
          username: username,
          avatarUrl: '', // Pas d'avatar pour l'instant (extraction simple)
          addedAt: new Date().toISOString(),
          position: index
        };
      });

      this.followerDatabase.totalCount = baselineComplete
        ? allUsernames.length
        : (targetCount > 0 ? targetCount : allUsernames.length);
      this.followerDatabase.firstFollowerId = firstFollower;
      this.followerDatabase.lastScanDate = new Date().toISOString();
      // Ne considérer la base « initialisée » que si le baseline est complet,
      // sinon la reprise du lendemain repart proprement.
      this.followerDatabase.isInitialized = baselineComplete;

      await this.saveFollowerDatabase();
      console.log(`✅ Database saved: ${allUsernames.length} followers (complete=${baselineComplete})`);

      // 10. Fermer le modal
      scroller.closeModal();

      // 11. Afficher le résultat selon la raison d'arrêt
      if (baselineComplete) {
        await completeBaseline();
        await this.updateBadge('✅');
        this.scanOverlay.showSuccess(
          `${allUsernames.length} followers scannés avec succès !`
        );
        console.log('✅ Smart scan completed successfully');
      } else if (stopReason === 'rate-limited') {
        await this.updateBadge('⏸️');
        this.scanOverlay.showSuccess(
          `${allUsernames.length} followers scannés. Instagram a temporairement limité l'accès — ` +
          `le scan reprendra automatiquement plus tard pour protéger le compte.`
        );
        console.log('⏸️ Smart scan paused (rate-limited), will resume');
      } else if (stopReason === 'stuck-incomplete') {
        // Chargement bloqué loin de la cible (page initiale réduite sur
        // réouverture, lazy-load stalled) — PAS une vraie fin, à retenter.
        await this.updateBadge('⏸️');
        this.scanOverlay.showSuccess(
          `${allUsernames.length}${targetCount > 0 ? `/${targetCount}` : ''} followers scannés. ` +
          `Instagram a ralenti le chargement — relance le scan pour continuer.`
        );
        console.log('⏸️ Smart scan paused (stuck, incomplete), retry needed');
      } else {
        // budget-exhausted / safety-cap
        await this.updateBadge('⏸️');
        this.scanOverlay.showSuccess(
          `${allUsernames.length}${targetCount > 0 ? `/${targetCount}` : ''} followers scannés. ` +
          `Limite quotidienne atteinte — le scan reprendra demain pour rester sûr.`
        );
        console.log('⏸️ Smart scan paused (daily budget), will resume tomorrow');
      }

    } catch (error) {
      console.error('Error during smart scan:', error);
      this.scanOverlay.showError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isScanning = false;
      setTimeout(() => this.updateBadge(''), 3000);
    }
  }

  /**
   * Réconcilie le total de la base après l'ajout de nouveaux followers.
   *
   * Le compteur AUTORITAIRE est le nombre réel affiché par Instagram
   * (this.lastFollowerCount), PAS la taille de la base. L'API/la modale des
   * followers « récents » révèle les nouveaux arrivants mais pas ceux qui sont
   * partis : si, après ajout, la base contient PLUS d'entrées que le compteur
   * réel, la différence = des unfollowers cachés. Ex. observé : 6 nouveaux
   * collectés mais hausse nette de seulement +2 (213→215) ⇒ la base monte à 220
   * alors que le réel est 215 ⇒ 5 départs cachés. On cale alors totalCount sur le
   * réel et on signale ces unfollowers pour l'analyse manuelle.
   *
   * Renvoie le nombre d'unfollowers cachés détectés (0 si aucun).
   */
  private async reconcileTotalAfterNewFollowers(): Promise<number> {
    const dbSize = Object.keys(this.followerDatabase.followers).length;
    const realCount = this.lastFollowerCount > 0 ? this.lastFollowerCount : dbSize;
    this.followerDatabase.totalCount = realCount;
    await this.saveFollowerDatabase();

    const hidden = dbSize - realCount;
    if (hidden > 0) {
      console.warn(
        `⚠️ Incohérence: base=${dbSize} > compteur réel=${realCount} → ${hidden} unfollower(s) caché(s). ` +
        `totalCount calé sur ${realCount}, détection d'unfollowers signalée.`
      );
      await this.handleUnfollowers(hidden);
      return hidden;
    }
    return 0;
  }

  /**
   * SCAN INTELLIGENT NOUVEAUX FOLLOWERS (Estimation)
   */
  private async scanNewFollowersIntelligent(expectedNew: number) {
    if (this.isScanning) return;
    
    this.isScanning = true;
    console.log(`🔍 Starting smart scan for ${expectedNew} new followers...`);
    this.scanOverlay.show(`Detecting ${expectedNew} new follower(s)...`);

    try {
      // 0. VOIE PRIORITAIRE — API Instagram : récupère les followers les plus
      //    récents directement, sans ouvrir la modale ni être sur le profil.
      //    Fonctionne partout (feed, autre profil, etc.).
      const apiFollowers = await this.fetchRecentFollowersFromAPI(expectedNew + 10);
      if (apiFollowers && apiFollowers.length > 0) {
        const newFromApi = apiFollowers.filter(u => !this.followerDatabase.followers[u]);
        console.log(`🆕 [API] ${newFromApi.length} nouveau(x) follower(s) collecté(s):`, newFromApi);

        for (const username of newFromApi) {
          this.followerDatabase.followers[username] = {
            username,
            addedAt: new Date().toISOString()
          };
          await chrome.runtime.sendMessage({
            type: 'TRACK_FOLLOWER',
            data: { username, metadata: { detectedAt: new Date().toISOString(), source: 'api' } }
          });
        }

        if (newFromApi.length > 0) {
          this.followerDatabase.firstFollowerId = apiFollowers[0];
          const hidden = await this.reconcileTotalAfterNewFollowers();
          this.scanOverlay.showSuccess(
            hidden > 0
              ? `${newFromApi.length} new · ${hidden} hidden unfollower(s) detected`
              : `${newFromApi.length} new follower(s) collected!`
          );
        } else {
          // Aucun NOUVEAU follower réel via l'API — mais la hausse du compteur
          // était bien réelle (ex. +2). Si la base contient malgré tout plus
          // d'entrées que le compteur réel, c'est qu'il y a eu des départs cachés
          // (de nouveaux sont entrés ET d'anciens sont partis, l'API des récents
          // ne montrant que les arrivées). On réconcilie pour caler totalCount et
          // signaler ces unfollowers cachés.
          const hidden = await this.reconcileTotalAfterNewFollowers();
          if (hidden > 0) {
            this.scanOverlay.showSuccess(`${hidden} hidden unfollower(s) detected`);
          } else {
            this.scanOverlay.hide();
          }
        }

        await accountRemove('pendingNewFollowerScan');
        this.isScanning = false;
        await this.updateBadge('');
        return;
      }

      console.log('ℹ️ API followers indisponible, repli sur la modale...');

      // 1. Ouvrir la modale followers EN PLACE, SANS naviguer (un
      //    window.location.href tuerait ce scan en cours). Hors du profil, le
      //    helper renvoie null → on mémorise la collecte pour plus tard.
      const modal = await this.ensureFollowersModalOpen({ navigate: false });
      if (!modal) {
        console.log('⚠️ Modale followers indisponible ici, collecte du nouveau follower reportée');
        await accountSet({ pendingNewFollowerScan: expectedNew });
        this.scanOverlay.hide();
        this.isScanning = false;
        return;
      }

      // 2. Scanner les premiers followers (les plus récents sont en haut).
      const scanLimit = expectedNew + 5;
      const links = modal.querySelectorAll('a[href^="/"]');
      const currentFollowers: string[] = [];

      for (const link of Array.from(links).slice(0, scanLimit * 3)) {
        const href = link.getAttribute('href');
        if (href) {
          const usernameMatch = href.match(/^\/([a-zA-Z0-9._]+)\/?(\?.*)?$/);
          if (usernameMatch) {
            const username = usernameMatch[1];
            const systemPages = ['explore', 'reels', 'direct', 'p', 'stories', 'tv', 'accounts'];
            if (!systemPages.includes(username) && !currentFollowers.includes(username)) {
              currentFollowers.push(username);

              // Arrêter dès qu'on retrouve le 1er ID connu de la base.
              if (username === this.followerDatabase.firstFollowerId) {
                break;
              }
            }
          }
        }
      }

      // 3. Nouveaux = ceux du haut qui ne sont pas déjà dans la DB (comparaison
      //    avec la DB plus fiable que le seul firstFollowerId).
      const newFollowers: string[] = [];
      for (const username of currentFollowers) {
        if (username === this.followerDatabase.firstFollowerId) {
          break;
        }
        if (!this.followerDatabase.followers[username]) {
          newFollowers.push(username);
        }
      }

      console.log(`🆕 Found ${newFollowers.length} new followers:`, newFollowers);

      // 4. Ajouter à la base + TRACK_FOLLOWER (incrémente sessionStats.followers
      //    ET synchronise immédiatement avec le dashboard).
      for (const username of newFollowers) {
        this.followerDatabase.followers[username] = {
          username,
          addedAt: new Date().toISOString()
        };

        await chrome.runtime.sendMessage({
          type: 'TRACK_FOLLOWER',
          data: {
            username,
            metadata: { detectedAt: new Date().toISOString() }
          }
        });
      }

      // 5. Mettre à jour le 1er ID et réconcilier le total avec le compteur réel
      //    (cale totalCount sur le réel + signale d'éventuels unfollowers cachés).
      let hiddenUnfollowers = 0;
      if (newFollowers.length > 0) {
        this.followerDatabase.firstFollowerId = newFollowers[0];
        hiddenUnfollowers = await this.reconcileTotalAfterNewFollowers();
      }

      // Collecte effectuée → effacer l'éventuel scan en attente.
      await accountRemove('pendingNewFollowerScan');

      // 6. Fermer la modale.
      const closeButton = modal.querySelector('button[aria-label="Close"], button[aria-label="Fermer"]');
      if (closeButton) {
        (closeButton as HTMLButtonElement).click();
      }

      if (newFollowers.length > 0) {
        this.scanOverlay.showSuccess(
          hiddenUnfollowers > 0
            ? `${newFollowers.length} new · ${hiddenUnfollowers} hidden unfollower(s) detected`
            : `${newFollowers.length} new follower(s) collected!`
        );
      } else {
        this.scanOverlay.hide();
      }
      console.log('✅ Smart scan completed');

    } catch (error) {
      console.error('Error during smart scan:', error);
      this.scanOverlay.showError('Error during detection');
    } finally {
      this.isScanning = false;
      await this.updateBadge('');
    }
  }

  /**
   * DÉTECTION UNFOLLOWERS AVEC SMART SCROLLER
   * Utilise InstagramModalScroller et FollowerExtractor pour détecter les unfollowers
   */
  async detectUnfollowersWithSmartScroller() {
    if (this.isScanning) {
      console.log('⏳ Scan already in progress');
      return;
    }

    this.isScanning = true;
    console.log('🔍 Starting unfollower detection with Smart Scroller...');
    await this.updateBadge('🔍');
    this.scanOverlay.show('Detecting unfollowers...');

    try {
      // 1. Ouvrir le modal followers (helper robuste, comme le scan basique)
      const modal = await this.ensureFollowersModalOpen();
      if (!modal) {
        throw new Error('Followers modal not found');
      }

      // 3. Créer le scroller et l'extracteur
      const scroller = new InstagramModalScroller({
        maxScrollAttempts: 3,
        scrollDelay: 300,
        onProgress: (progress) => {
          this.scanOverlay.updateProgress(
            progress.totalFollowers,
            Object.keys(this.followerDatabase.followers).length,
            `${progress.totalFollowers} followers vérifiés`
          );
        }
      });

      const extractor = new FollowerExtractor();

      // 4. Scroller et extraire tous les followers actuels
      console.log('🚀 Scanning current followers...');
      const currentUsernames = await scroller.scrollToEnd();
      
      console.log(`✅ Found ${currentUsernames.length} current followers`);

      // 5. Comparer avec la base de données pour trouver les unfollowers
      const previousUsernames = Object.keys(this.followerDatabase.followers);
      console.log(`📊 Previous followers in DB: ${previousUsernames.length}`);
      console.log(`📊 Current followers scanned: ${currentUsernames.length}`);
      
      // Comparer directement les listes de usernames
      const currentSet = new Set(currentUsernames);
      const previousSet = new Set(previousUsernames);
      const unfollowers = previousUsernames.filter(username => !currentSet.has(username));
      const newFollowers = currentUsernames.filter(username => !previousSet.has(username));

      console.log(`🚫 Detected ${unfollowers.length} unfollowers:`, unfollowers);
      console.log(`🆕 Detected ${newFollowers.length} new followers:`, newFollowers);

      // 6. Envoyer les nouveaux followers au backend
      for (const username of newFollowers) {
        try {
          this.followerDatabase.followers[username] = {
            username,
            addedAt: new Date().toISOString()
          };
          
          await chrome.runtime.sendMessage({
            type: 'TRACK_FOLLOWER',
            data: {
              username,
              metadata: { detectedAt: new Date().toISOString() }
            }
          });
        } catch (error) {
          console.error(`Error tracking new follower ${username}:`, error);
        }
      }

      // 7. Envoyer les unfollowers au backend et retirer de la base
      for (const username of unfollowers) {
        try {
          await chrome.runtime.sendMessage({
            type: 'TRACK_UNFOLLOWER',
            data: {
              username,
              metadata: { detectedAt: new Date().toISOString() }
            }
          });

          delete this.followerDatabase.followers[username];
        } catch (error) {
          console.error(`Error tracking unfollower ${username}:`, error);
        }
      }

      // Synchroniser totalCount avec le nombre réel de followers dans la base
      this.followerDatabase.totalCount = Object.keys(this.followerDatabase.followers).length;
      this.followerDatabase.lastScanDate = new Date().toISOString();
      await this.saveFollowerDatabase();

      // 7. Fermer le modal
      scroller.closeModal();

      // 8. Afficher le résultat
      await this.updateBadge(unfollowers.length > 0 ? `-${unfollowers.length}` : '✅');
      this.scanOverlay.showSuccess(
        unfollowers.length > 0
          ? `${unfollowers.length} unfollower(s) détecté(s) !`
          : 'Aucun unfollower détecté'
      );
      console.log('✅ Unfollower detection completed');

    } catch (error) {
      console.error('Error during unfollower detection:', error);
      this.scanOverlay.showError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isScanning = false;
      setTimeout(() => this.updateBadge(''), 3000);
    }
  }

  /**
   * SCAN PROGRESSIF UNFOLLOWERS (Par portions intelligent)
   */
  private async scanUnfollowersProgressive(expectedUnfollowers: number) {
    if (this.isScanning) return;
    
    this.isScanning = true;
    console.log(`🔍 Starting progressive scan for ${expectedUnfollowers} unfollowers...`);
    this.scanOverlay.show(`Searching for ${expectedUnfollowers} unfollower(s)...`);

    try {
      // Ouvrir la modal (helper robuste, comme le scan basique)
      const modal = await this.ensureFollowersModalOpen();
      if (!modal) {
        this.isScanning = false;
        return;
      }

      const scrollContainer = modal.querySelector('div[style*="overflow"]');
      if (!scrollContainer) {
        this.isScanning = false;
        return;
      }

      const portionSize = 50;
      const maxPortions = 10;
      let portion = 0;
      let unfollowersFound: string[] = [];
      let scannedFollowers = new Set<string>();

      while (portion < maxPortions && unfollowersFound.length < expectedUnfollowers) {
        portion++;

        // Scanner la portion actuelle
        const links = modal.querySelectorAll('a[href^="/"]');
        
        for (const link of Array.from(links)) {
          const href = link.getAttribute('href');
          if (href) {
            const usernameMatch = href.match(/^\/([a-zA-Z0-9._]+)\/?(\?.*)?$/);
            if (usernameMatch) {
              const username = usernameMatch[1];
              const systemPages = ['explore', 'reels', 'direct', 'p', 'stories', 'tv', 'accounts'];
              if (!systemPages.includes(username)) {
                scannedFollowers.add(username);
              }
            }
          }
        }

        // Comparer avec la base pour trouver les manquants
        const dbFollowers = Object.keys(this.followerDatabase.followers);
        for (const dbFollower of dbFollowers) {
          if (!scannedFollowers.has(dbFollower) && !unfollowersFound.includes(dbFollower)) {
            unfollowersFound.push(dbFollower);
          }
        }

        console.log(`📊 Portion ${portion}: ${unfollowersFound.length}/${expectedUnfollowers} unfollowers found`);
        await this.updateScanProgress(unfollowersFound.length, expectedUnfollowers);
        this.scanOverlay.updateProgress(unfollowersFound.length, expectedUnfollowers, `Portion ${portion}`);

        // Conditions d'arrêt intelligent
        if (unfollowersFound.length === expectedUnfollowers) {
          console.log('✅ All unfollowers found, stopping scan');
          break;
        }

        if (unfollowersFound.length === 0 && portion > 2) {
          console.log('⚠️ No unfollowers in recent portions, stopping');
          break;
        }

        // Scroll pour charger plus
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        const delay = 800 + Math.random() * 400;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      console.log(`🚫 Found ${unfollowersFound.length} unfollowers:`, unfollowersFound);

      // Envoyer au backend et retirer de la base
      for (const username of unfollowersFound) {
        await chrome.runtime.sendMessage({
          type: 'TRACK_UNFOLLOWER',
          data: {
            username,
            metadata: { detectedAt: new Date().toISOString() }
          }
        });

        delete this.followerDatabase.followers[username];
      }

      this.followerDatabase.totalCount -= unfollowersFound.length;
      await this.saveFollowerDatabase();

      // Fermer la modal
      const closeButton = modal.querySelector('button[aria-label="Close"], button[aria-label="Fermer"]');
      if (closeButton) {
        (closeButton as HTMLButtonElement).click();
      }

      this.scanOverlay.showSuccess(`${unfollowersFound.length} unfollower(s) detected!`);
      console.log('✅ Progressive scan completed');

    } catch (error) {
      console.error('Error during progressive scan:', error);
      this.scanOverlay.showError('Error during detection');
    } finally {
      this.isScanning = false;
      await this.updateBadge('');
    }
  }

  /**
   * Vérification rapide des nouveaux followers (seulement les 10 premiers visibles)
   */
  private async quickCheckForNewFollowers() {
    try {
      // Ouvre le modal lui-même si besoin (helper robuste, comme le scan basique).
      const modal = await this.ensureFollowersModalOpen();
      if (!modal) {
        console.log('❌ Modal not found');
        return;
      }

      // Extraire les premiers followers visibles
      const extractor = new FollowerExtractor();
      const visibleFollowers = extractor.extractAllVisible();
      
      if (visibleFollowers.length === 0) {
        console.log('⚠️ No followers found in modal');
        return;
      }

      console.log(`📊 Found ${visibleFollowers.length} visible followers`);

      // Vérifier si le premier follower est nouveau
      const firstFollower = visibleFollowers[0];
      const isNew = !this.followerDatabase.followers[firstFollower.username];

      if (isNew) {
        console.log(`🆕 New follower detected: @${firstFollower.username}`);
        
        // Ajouter à la base
        this.followerDatabase.followers[firstFollower.username] = {
          username: firstFollower.username,
          avatarUrl: firstFollower.avatarUrl,
          addedAt: new Date().toISOString()
        };
        
        this.followerDatabase.totalCount++;
        this.followerDatabase.firstFollowerId = firstFollower.username;
        await this.saveFollowerDatabase();

        // Envoyer au backend pour synchronisation
        await chrome.runtime.sendMessage({
          type: 'TRACK_FOLLOWER',
          data: {
            username: firstFollower.username,
            avatarUrl: firstFollower.avatarUrl,
            metadata: { detectedAt: new Date().toISOString() }
          }
        });

        console.log('✅ New follower tracked and synced!');
      } else {
        console.log(`✓ First follower @${firstFollower.username} already in database`);
      }
    } catch (error) {
      console.error('Error during quick check:', error);
    }
  }

  /**
   * Observer automatique pour détecter l'ouverture du modal followers
   * et lancer la vérification des nouveaux followers
   */
  private setupFollowersModalObserver() {
    console.log('👁️ Setting up followers modal observer...');
    
    let lastModalCheck = 0;
    const CHECK_INTERVAL = 2000; // Vérifier toutes les 2 secondes
    
    const checkForFollowersModal = () => {
      const now = Date.now();
      if (now - lastModalCheck < CHECK_INTERVAL) return;
      lastModalCheck = now;
      
      // Chercher le modal followers
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return;
      
      // Vérifier si c'est bien le modal followers (contient "followers" ou "abonnés")
      const modalText = modal.textContent?.toLowerCase() || '';
      const isFollowersModal = modalText.includes('follower') || modalText.includes('abonné');
      
      if (!isFollowersModal) return;
      
      // Vérifier si on a déjà une base initialisée
      if (!this.followerDatabase.isInitialized) {
        console.log('⚠️ Database not initialized, skipping auto-check');
        return;
      }
      
      // Vérifier si un scan est déjà en cours
      if (this.isScanning) {
        console.log('⏳ Scan already in progress, skipping auto-check');
        return;
      }
      
      console.log('✅ Followers modal detected! Checking for new followers...');
      
      // Lancer la vérification rapide après un petit délai
      setTimeout(() => {
        this.quickCheckForNewFollowers();
      }, 1500);
    };
    
    // Observer les changements du DOM pour détecter l'ouverture du modal
    const observer = new MutationObserver(() => {
      checkForFollowersModal();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('✅ Followers modal observer active');
  }
}

// Initialize tracker
const tracker = new InstagramTracker();
tracker.init();

// Chien de garde « contexte invalidé » : après un rechargement/màj de l'extension,
// CE content script devient orphelin (chrome.runtime.id → undefined) et tout appel
// chrome.* échoue (« Extension context invalidated ») — typiquement en pleine
// analyse. Un contexte mort ne peut plus rien faire d'utile : on recharge alors la
// page (location.reload() reste dispo, c'est une API de page) pour charger le
// nouveau content script. Auto-récupération → plus besoin de F5 manuel.
(() => {
  let strikes = 0;
  const id = setInterval(() => {
    let valid = false;
    try {
      valid = !!chrome.runtime?.id;
    } catch {
      valid = false;
    }
    if (valid) {
      strikes = 0;
      return;
    }
    // Deux échecs consécutifs (≈4 s) avant de recharger → évite tout faux positif.
    if (++strikes >= 2) {
      clearInterval(id);
      console.warn('♻️ [Waler] Contexte d\'extension invalidé → rechargement de la page.');
      location.reload();
    }
  }, 2000);
})();

// Fonction de debug globale pour corriger le compteur
(window as any).fixFollowerCount = async (targetCount?: number) => {
  console.log('🔧 Fix Follower Count - Debug Tool\n');
  
  try {
    // Lire le compteur Instagram si targetCount n'est pas fourni
    if (!targetCount) {
      const followerEl = document.querySelector('a[href*="/followers/"] span');
      if (followerEl) {
        const parseCount = (text: string) => {
          const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
          if (cleaned.includes('K')) return Math.floor(parseFloat(cleaned) * 1000);
          if (cleaned.includes('M')) return Math.floor(parseFloat(cleaned) * 1000000);
          return parseInt(cleaned) || 0;
        };
        targetCount = parseCount(followerEl.textContent?.trim() || '0');
        console.log(`📊 Compteur Instagram détecté: ${targetCount}`);
      } else {
        console.error('❌ Compteur Instagram non trouvé et aucune valeur fournie');
        console.log('💡 Usage: fixFollowerCount(213)');
        return;
      }
    }
    
    // Lire la base de données
    const stored = await accountGet('followerDatabase');
    if (!stored.followerDatabase) {
      console.error('❌ Base de données non trouvée');
      return;
    }
    
    const db = stored.followerDatabase;
    const actualCount = Object.keys(db.followers).length;
    
    console.log(`\n📂 État actuel:`);
    console.log(`   totalCount: ${db.totalCount}`);
    console.log(`   Followers réels: ${actualCount}`);
    console.log(`   Cible: ${targetCount}`);
    
    // Appliquer la correction
    const oldCount = db.totalCount;
    db.totalCount = targetCount;
    
    await accountSet({ 
      followerDatabase: db,
      lastFollowerCount: targetCount
    });
    
    console.log(`\n✅ CORRECTION APPLIQUÉE!`);
    console.log(`   ${oldCount} → ${targetCount}`);
    console.log(`\n🔄 Recharge l'extension (chrome://extensions/) pour voir le changement`);
    
    // Analyser la différence
    const diff = targetCount - actualCount;
    if (diff !== 0) {
      console.log(`\n⚠️ Note: Différence de ${Math.abs(diff)} entre cible (${targetCount}) et DB (${actualCount})`);
      if (diff > 0) {
        console.log(`   → ${diff} follower(s) manquant(s) dans la base`);
        console.log(`   💡 Lance un scan pour les capturer`);
      } else {
        console.log(`   → ${Math.abs(diff)} entrée(s) obsolète(s) dans la base`);
        console.log(`   💡 Lance une détection d'unfollowers`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
};

// Fonction de debug globale pour vérifier l'état de la détection
(window as any).debugFollowerDetection = async function() {
  console.log('='.repeat(60));
  console.log('DEBUG - État de la Détection des Followers');
  console.log('='.repeat(60));
  console.log('');

  // 1. Vérifier le DOM
  console.log('� [1/4] DOM...');
  const followerCountElement = 
    document.querySelector('a[href*="/followers/"] span') ||
    document.querySelector('a[href$="/followers/"] span');
  
  if (followerCountElement) {
    const countText = followerCountElement.textContent?.trim();
    const parseCount = (text: string) => {
      const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
      if (cleaned.includes('K')) return Math.floor(parseFloat(cleaned) * 1000);
      if (cleaned.includes('M')) return Math.floor(parseFloat(cleaned) * 1000000);
      return parseInt(cleaned) || 0;
    };
    const domCount = parseCount(countText || '0');
    console.log(`   ✅ Followers (DOM): ${domCount}`);
  } else {
    console.log('   ❌ Élément non trouvé');
  }

  // 2. Vérifier le storage
  console.log('📦 [2/4] Storage...');
  const stored = await accountGet(['lastFollowerCount', 'followerDatabase']);
  console.log(`   lastFollowerCount: ${stored.lastFollowerCount || 'non défini'}`);
  if (stored.followerDatabase) {
    const dbCount = Object.keys(stored.followerDatabase.followers || {}).length;
    console.log(`   Database count: ${dbCount}`);
    console.log(`   Database.totalCount: ${stored.followerDatabase.totalCount}`);
  }

  // 3. Vérifier l'API Interceptor
  console.log('🔌 [3/4] API Interceptor...');
  console.log('   ℹ️ L\'interception fetch/XHR s\'exécute dans le monde MAIN (page-interceptor.js)');
  console.log('   ℹ️ Cherchez le log "[MAIN] Waler page interceptor installed" au chargement de la page');
  console.log('   ℹ️ et "User info detected in API response" lors de la navigation');

  // 4. Vérifier la synchronisation
  console.log('🔍 [4/4] Synchronisation...');
  const domCount = followerCountElement ? 
    parseInt(followerCountElement.textContent?.replace(/[^0-9]/g, '') || '0') : null;
  const lastCount = stored.lastFollowerCount;
  const dbCount = stored.followerDatabase ? 
    Object.keys(stored.followerDatabase.followers || {}).length : null;

  if (domCount === lastCount && domCount === dbCount) {
    console.log('   ✅ Tout est synchronisé!');
  } else {
    console.log('   ⚠️ DÉSYNCHRONISATION:');
    console.log(`      DOM: ${domCount}`);
    console.log(`      lastFollowerCount: ${lastCount}`);
    console.log(`      Database: ${dbCount}`);
  }

  console.log('');
  console.log('='.repeat(60));
};

console.log('💡 Debug tools available:');
console.log('   - debugFollowerDetection() : Vérifier l\'état de la détection');
console.log('   - fixFollowerCount() : Corriger le compteur');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    // Permet au popup de vérifier que le content script est bien injecté
    // avant d'envoyer une commande d'analyse.
    sendResponse({ success: true, ready: true });
    return true;
  } else if (message.type === 'START_INITIAL_SCAN') {
    console.log('📨 Received START_INITIAL_SCAN message from popup');
    // Utiliser la nouvelle méthode avec Smart Scroller
    tracker['performInitialScanWithSmartScroller']();
    sendResponse({ success: true });
  } else if (message.type === 'START_UNFOLLOWER_ANALYSIS') {
    console.log('📨 Received START_UNFOLLOWER_ANALYSIS message from popup');
    tracker['startUnfollowerAnalysis']();
    sendResponse({ success: true });
  } else if (message.type === 'START_PRO_CONVERSATION_ANALYSIS') {
    console.log('📨 Received START_PRO_CONVERSATION_ANALYSIS message from popup');
    tracker['proCollector'].start(message.username, message.fullName);
    sendResponse({ success: true });
  } else if (message.type === 'START_PRO_ENGAGEMENT_ANALYSIS') {
    console.log('📨 Received START_PRO_ENGAGEMENT_ANALYSIS message from popup');
    // Récupère la liste des People puis lance l'analyse d'engagement (likes +
    // commentaires) sur les posts du compte connecté, en un seul passage.
    (async () => {
      const ownUsername = tracker['currentUsername'] as string | null;
      const resp = (await chrome.runtime.sendMessage({ type: 'GET_PEOPLE' })) as any;
      const people = resp && resp.success && Array.isArray(resp.people) ? resp.people : [];
      const targets = people.map((p: any) => p.memberUsername).filter(Boolean);
      // Mots-clés de campagne du compte actif → matchés EN LOCAL sur les commentaires.
      const kwResp = (await chrome.runtime.sendMessage({ type: 'GET_PRO_KEYWORDS' })) as any;
      const keywords = kwResp && kwResp.success && Array.isArray(kwResp.keywords) ? kwResp.keywords : [];
      tracker['proEngagementCollector'].start(ownUsername || '', targets, keywords);
    })();
    sendResponse({ success: true });
  } else if (message.type === 'START_NOTIFICATION_CHECK') {
    console.log('📨 Received START_NOTIFICATION_CHECK message from popup');
    if (localStorage.getItem('unfollowerCheckState')) {
      console.log('🔕 Analyse unfollower en cours — START_NOTIFICATION_CHECK ignoré');
      sendResponse({ success: false, reason: 'analysis_in_progress' });
      return true;
    }
    tracker['notificationChecker'].startAutoCheck(tracker['followerDatabase']);
    sendResponse({ success: true });
  } else if (message.type === 'RESTORE_FROM_BACKEND') {
    console.log('📨 Received RESTORE_FROM_BACKEND message from popup');
    (async () => {
      const ok = await tracker.tryRestoreFromBackend();
      sendResponse({ success: ok, count: Object.keys(tracker['followerDatabase'].followers).length });
    })();
    return true;
  } else if (message.type === 'FOLLOWER_COUNT_CHANGED') {
    // Synchroniser lastFollowerCount quand l'API détecte un changement
    console.log('📨 Received FOLLOWER_COUNT_CHANGED from API interceptor');
    const { newCount, diff } = message.data;
    tracker['lastFollowerCount'] = newCount;
    console.log(`🔄 Synchronized lastFollowerCount to ${newCount} (${diff > 0 ? '+' : ''}${diff})`);
    
    // Déclencher handleNewFollowers ou handleUnfollowers si nécessaire
    if (diff > 0) {
      tracker['handleNewFollowers'](diff);
    } else if (diff < 0) {
      tracker['handleUnfollowers'](Math.abs(diff));
    }
    sendResponse({ success: true });
  } else if (message.type === 'STOP_ALL') {
    // Arrêt GLOBAL : stoppe toute tâche longue en cours sur cet onglet.
    console.log('⏹ Received STOP_ALL from popup');
    try { tracker['proCollector'].requestStop(); } catch (e) { console.warn('STOP_ALL proCollector:', e); }
    try { tracker['proEngagementCollector'].requestStop(); } catch (e) { console.warn('STOP_ALL engagement:', e); }
    try { tracker['unfollowerDetector'].stopAnalysis(); } catch (e) { console.warn('STOP_ALL unfollower:', e); }
    void chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', text: '' }).catch(() => {});
    sendResponse({ success: true });
  }
  return true;
});

export default tracker;
