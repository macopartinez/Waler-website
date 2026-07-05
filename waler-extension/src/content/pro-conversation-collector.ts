/**
 * Pro Conversation Collector
 *
 * Orchestre l'analyse d'une conversation DM pour la section Pro :
 *   inbox → recherche → détection non-lu (+ permission) → scroll → extraction
 *   → analyse → mise à jour des stats.
 *
 * Machine à états persistée dans chrome.storage.local (`proAnalysisState`) :
 * la navigation VERS /direct/inbox/ recharge le content script, donc l'état
 * doit survivre à ce reload (même principe que notification-checker.ts). Une
 * fois DANS /direct/ (SPA), recherche/clic/scroll s'enchaînent sans reload.
 */

import type ScanOverlay from './scan-overlay.js';
import { showConfirmDialog } from './confirm-dialog.js';
import { DMThreadScroller } from './dm-thread-scroller.js';
import { DMMessageExtractor, type ExtractedMessage, VOICE_NO_TRANSCRIPT } from './dm-message-extractor.js';
import { ScoringEngine, type Contact } from './scoring-engine.js';
import { DMAnalyzer, type Conversation, type ConversationMessage } from './dm-analyzer.js';
import { ConversationDynamicsAnalyzer } from './conversation-dynamics.js';
import { SettingCoach } from './setting-coach.js';

export interface ProRefusal {
  username: string;
  refusedAt: number;
  unreadReceivedAt: number | null;
}

export type ProPhase =
  | 'goto_inbox'
  | 'search'
  | 'await_permission'
  | 'scroll'
  | 'analyze'
  | 'done';

export interface ProAnalysisState {
  phase: ProPhase;
  targetUsername: string;
  /** Nom de profil affiché (« Paco Martinez ») — sert à matcher la ligne de
   *  l'inbox, qui affiche le nom et non le @username. */
  targetFullName?: string;
  startedAt: number;
  unreadDetected?: boolean;
  unreadReceivedAt?: number | null;
}

const STATE_KEY = 'proAnalysisState';

/**
 * Sélecteur des LIGNES de conversation de l'inbox.
 *
 * Instagram (2024+) ne rend plus les lignes comme `<a href="/direct/t/<id>">` :
 * il n'y a plus aucun lien ni href de thread (diagnostic terrain : 0 lien
 * `/direct/t/`). Chaque ligne est désormais un `div[role="button"]` cliquable
 * avec `aria-haspopup="dialog"` (la conversation s'ouvre en superposition) et
 * `tabindex="0"`. On accepte les deux marqueurs pour la robustesse.
 */
const INBOX_ROW_SELECTOR =
  'div[role="button"][aria-haspopup="dialog"], div[role="button"][tabindex="0"]';

export class ProConversationCollector {
  private overlay: ScanOverlay;
  private running = false;
  private scoring = new ScoringEngine();
  private analyzer = new DMAnalyzer();
  private dynamics = new ConversationDynamicsAnalyzer();
  private settingCoach = new SettingCoach();

  constructor(overlay: ScanOverlay) {
    this.overlay = overlay;
  }

  // ==================== Cycle de vie / état ====================

  private async getState(): Promise<ProAnalysisState | null> {
    const stored = await chrome.storage.local.get(STATE_KEY);
    return (stored[STATE_KEY] as ProAnalysisState) || null;
  }

  private async setState(patch: Partial<ProAnalysisState>): Promise<ProAnalysisState> {
    const current = (await this.getState()) || ({} as ProAnalysisState);
    const next = { ...current, ...patch } as ProAnalysisState;
    await chrome.storage.local.set({ [STATE_KEY]: next });
    return next;
  }

  private async clearState(): Promise<void> {
    await chrome.storage.local.remove(STATE_KEY);
  }

  /**
   * Démarre l'analyse (appelé depuis le popup via le content script).
   * Sauvegarde l'état puis navigue vers l'inbox (reload du content script).
   */
  async start(targetUsername: string, targetFullName = ''): Promise<void> {
    console.log(`✨ [Pro] Démarrage analyse conversation @${targetUsername} (${targetFullName || 'sans nom'})`);
    await this.setState({
      phase: 'search',
      targetUsername,
      targetFullName,
      startedAt: Date.now(),
      unreadDetected: false,
      unreadReceivedAt: null,
    });

    // Fast path : on est DÉJÀ dans la conversation du contact ciblé → analyser
    // directement le thread ouvert, sans repasser par l'inbox. Évite un reload
    // de la page + le re-scroll inutile de tout l'historique des conversations.
    if (this.isOnThread()) {
      console.log(
        `🔎 [Pro] Sur un thread — contact détecté: @${this.getThreadContactUsername() || '?'} ` +
          `(cible: @${targetUsername}, match: ${this.threadMatchesTarget(targetUsername)})`
      );
    }
    if (this.isOnThread() && this.threadMatchesTarget(targetUsername)) {
      console.log(`✨ [Pro] Déjà dans la conversation de @${targetUsername} — analyse directe du thread ouvert.`);
      if (this.running) return;
      this.running = true;
      try {
        await this.scrollExtractAndAnalyze(targetUsername);
      } catch (error) {
        console.error('❌ [Pro] Erreur durant l\'analyse directe:', error);
        this.overlay.showError('Error while analyzing the conversation');
        await this.clearState();
      } finally {
        this.running = false;
      }
      return;
    }

    this.overlay.show('Opening messages…');

    if (this.isOnInbox()) {
      // Déjà sur l'inbox : pas de reload, on enchaîne directement.
      await this.resume();
    } else {
      window.location.href = 'https://www.instagram.com/direct/inbox/';
    }
  }

  /** Vrai si le thread actuellement ouvert est bien celui du contact ciblé. */
  private threadMatchesTarget(username: string): boolean {
    const target = username.toLowerCase();
    const current = this.getThreadContactUsername();
    if (current && current.toLowerCase() === target) return true;

    // Repli : si la résolution générique a échoué, on confirme la présence d'un
    // lien de profil de la cible dans l'en-tête (haut de page, hors sidebar).
    const link = (Array.from(document.querySelectorAll('a[href^="/"]')) as HTMLAnchorElement[]).find((a) => {
      const m = (a.getAttribute('href') || '').match(/^\/([a-zA-Z0-9._]{1,40})\/?$/);
      if (!m || m[1].toLowerCase() !== target) return false;
      if (a.closest('a[href^="/direct/t/"]')) return false; // ligne de la sidebar
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.top < 220;
    });
    return !!link;
  }

  /**
   * Reprend l'analyse au (re)chargement du content script selon la phase.
   */
  async resume(): Promise<void> {
    const state = await this.getState();
    if (!state) return;
    if (this.running) return;
    this.running = true;

    try {
      console.log(`✨ [Pro] Reprise phase="${state.phase}" pour @${state.targetUsername}`);

      switch (state.phase) {
        case 'goto_inbox':
        case 'search':
          await this.runFromInbox(state);
          break;
        case 'await_permission':
        case 'scroll':
        case 'analyze':
          // Ces phases s'exécutent dans le flux continu de runFromInbox (SPA,
          // pas de reload). Si on y arrive après un reload imprévu, on relance
          // proprement depuis l'inbox.
          await this.runFromInbox(state);
          break;
        case 'done':
          await this.clearState();
          break;
      }
    } catch (error) {
      console.error('❌ [Pro] Erreur durant l\'analyse:', error);
      this.overlay.showError('Error while analyzing the conversation');
      await this.clearState();
    } finally {
      this.running = false;
    }
  }

  // ==================== Flux principal (sur /direct, SPA) ====================

  private async runFromInbox(state: ProAnalysisState): Promise<void> {
    // 1. S'assurer d'être sur l'inbox (sinon naviguer — provoquera un reload
    //    et resume() reprendra).
    if (!this.isOnInbox() && !this.isOnThread()) {
      this.overlay.show('Opening messages…');
      window.location.href = 'https://www.instagram.com/direct/inbox/';
      return;
    }

    const username = state.targetUsername;
    let fullName = state.targetFullName || '';

    // 2bis. « people » ne stocke pas toujours le nom de profil (souvent null si
    //   on a juste tapé l'id). Or la ligne de l'inbox affiche ce nom, pas le
    //   @username : on le résout donc à la volée depuis l'id. Si le compte n'a
    //   réellement pas de nom, l'inbox affichera l'id et le match par username
    //   prendra le relais.
    if (!fullName) {
      fullName = await this.resolveProfileName(username);
      if (fullName) {
        console.log(`👤 [Pro] Nom de profil résolu pour @${username} : « ${fullName} »`);
        // Persister pour le dashboard et éviter de re-résoudre (best-effort).
        chrome.runtime
          .sendMessage({ type: 'UPDATE_CONTACT_NAME', username, fullName })
          .catch(() => {});
      } else {
        console.log(`👤 [Pro] Pas de nom de profil pour @${username} (match par id)`);
      }
    }

    // 2. Localisation de la conversation en scrollant l'historique de l'inbox.
    this.overlay.show(`Searching for @${username} in your history…`);
    const row = await this.scrollAndLocateRow(username, fullName);
    if (!row) {
      this.overlay.showError(`Conversation with @${username} not found`);
      await this.clearState();
      return;
    }

    // 3. Détection non-lu + permission (Phase 3).
    const allowed = await this.checkUnreadAndAskPermission(row, username);
    if (!allowed) {
      // L'utilisateur a refusé : message + signal déjà gérés dans le hook.
      await this.clearState();
      return;
    }

    // 4. Ouvrir le thread.
    this.overlay.show(`Opening the conversation with @${username}…`);
    await this.openThread(row);

    // 5-7. Scroll + extraction + analyse + sauvegarde (Phases 4-5).
    await this.scrollExtractAndAnalyze(username);
  }

  /**
   * Scrolle le thread OUVERT, extrait tout l'historique, lance l'analyse et
   * persiste les stats. Partagé par le flux inbox et le fast path « déjà dans la
   * conversation ». Suppose qu'on est déjà sur le thread du contact.
   */
  private async scrollExtractAndAnalyze(username: string): Promise<void> {
    // 4bis. Historique déjà enregistré (source de vérité : serveur). Sert à la
    //   fois de FRONTIÈRE pour le scroll incrémental (on s'arrête en le rejoignant)
    //   et de base à FUSIONNER pour que l'analyse porte sur toute la conversation.
    //   Absent (1re analyse, ou stockage nettoyé) → scroll complet, rien perdu.
    const history = await this.fetchStoredHistory(username);
    const knownKeys = new Set(history.map((m) => m.messageId));

    // 5. Capture + extraction (Phase 4). AUTONOME : l'extension scrolle elle-même
    //    le thread jusqu'au début (aucune action utilisateur). Les conversations
    //    courtes restent instantanées.
    await this.setState({ phase: 'scroll' });
    this.overlay.show('Reading the conversation…');

    const scroller = new DMThreadScroller({
      knownKeys,
      onProgress: (n) =>
        this.overlay.updateProgress(n, n + 1, `Lecture automatique de la conversation… (${n} messages)`),
    });
    const collected = await scroller.collect({ manual: false });

    // 6-7. Fusion + dump + analyse + sauvegarde.
    await this.setState({ phase: 'analyze' });
    await this.mergeDumpAndAnalyze(username, history, collected, scroller);
    await this.setState({ phase: 'done' });
    await this.clearState();
  }

  /**
   * Fusionne l'historique avec les messages collectés, journalise un dump ordonné
   * (diagnostic), puis lance l'analyse + sauvegarde. Partagé par le flux popup et
   * le flux « boutons sur la page ». Renvoie le nombre de messages analysés.
   */
  private async mergeDumpAndAnalyze(
    username: string,
    history: ExtractedMessage[],
    collected: ExtractedMessage[],
    scroller: DMThreadScroller
  ): Promise<number> {
    // Fusion historique + nouveaux messages (dédup par messageId, ordre chrono).
    const messages = this.mergeHistory(history, collected);

    if (messages.length === 0) {
      this.overlay.showError('No readable messages in this conversation');
      return 0;
    }

    console.log(
      `📥 [Pro] @${username} — historique ${history.length} + nouveaux ${collected.length} ` +
        `→ ${messages.length} messages fusionnés${scroller.reachedKnownHistory ? ' (incrémental)' : ' (scroll complet)'}`
    );

    // Vocaux trop anciens : Instagram n'en propose plus la transcription. On le
    // signale explicitement à l'utilisateur (sinon ils ressemblent à des trous).
    const untranscribed = messages.filter((m) => m.text === VOICE_NO_TRANSCRIPT).length;
    if (untranscribed > 0) {
      console.warn(
        `🎙️ [Pro] ${untranscribed} message(s) vocal(aux) non transcrit(s) : trop anciens, ` +
          `Instagram n'en fournit plus la transcription.`
      );
    }

    this.overlay.show('Analyzing the conversation…');
    await this.analyzeAndUpdate(username, messages, scroller.lastSeenDetected);
    const voiceNote =
      untranscribed > 0
        ? ` — ${untranscribed} voice message(s) not transcribed (too old)`
        : '';
    this.overlay.showSuccess(`Analysis complete! (${messages.length} messages)${voiceNote}`);
    return messages.length;
  }

  /**
   * Récupère l'historique DM déjà enregistré côté serveur (chronologique). C'est
   * la source de vérité fiable (insensible à un nettoyage du navigateur). Renvoie
   * [] si rien n'est encore enregistré ou en cas d'erreur (→ scroll complet).
   */
  private async fetchStoredHistory(username: string): Promise<ExtractedMessage[]> {
    try {
      const resp = (await chrome.runtime.sendMessage({ type: 'GET_DM_HISTORY', username })) as any;
      const raw: any[] = resp?.messages || [];
      return raw.map((m, i) => ({
        messageId: String(m.messageId),
        text: String(m.text ?? ''),
        isSent: !!m.isSent,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : null,
        reactions: Array.isArray(m.reactions) ? m.reactions : [],
        order: i, // l'historique serveur est déjà trié chronologiquement
      }));
    } catch (e) {
      console.log(`⚠️ [Pro] Historique stocké de @${username} indisponible:`, e);
      return [];
    }
  }

  /**
   * Fusionne l'historique enregistré (préfixe chronologique) avec les messages
   * fraîchement collectés (dédup par messageId). Les nouveaux messages absents de
   * l'historique sont ajoutés à la suite, dans leur ordre de collecte (déjà
   * chronologique via l'ordre DOM).
   */
  private mergeHistory(history: ExtractedMessage[], collected: ExtractedMessage[]): ExtractedMessage[] {
    const map = new Map<string, ExtractedMessage>();
    history.forEach((m, i) => map.set(m.messageId, { ...m, order: i }));
    let next = history.length;
    for (const c of collected) {
      if (map.has(c.messageId)) continue; // frontière / chevauchement déjà présent
      map.set(c.messageId, { ...c, order: next++ });
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }

  // ==================== Capture pilotée par boutons (sur la page) ====================

  private captureControlBtn: HTMLButtonElement | null = null;
  private manualCaptureRunning = false;

  /**
   * Monte un bouton flottant sur les pages de conversation (/direct/t/). Un clic sur
   * « Analyser la conversation » lance l'analyse AUTONOME : l'extension scrolle
   * elle-même le thread jusqu'au début, sans aucune action de l'utilisateur.
   */
  mountCaptureControl(): void {
    return;
    if (this.captureControlBtn || !document.body) return;

    const btn = document.createElement('button');
    btn.id = 'waler-capture-control';
    btn.style.cssText = `
      position: fixed; bottom: 24px; left: 24px; z-index: 999999;
      padding: 11px 16px; border-radius: 10px; cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px; font-weight: 600; color: #02c950;
      background: #000; border: 1px solid rgba(2,201,80,0.35);
      box-shadow: 0 8px 32px rgba(0,0,0,0.6); transition: background 0.15s ease;
    `;
    btn.onmouseenter = () => (btn.style.background = '#0a0a0a');
    btn.onmouseleave = () => (btn.style.background = '#000');
    this.captureControlBtn = btn;
    this.setCaptureBtnIdle();

    btn.onclick = () => {
      if (this.manualCaptureRunning) return; // analyse autonome déjà en cours
      void this.runManualCapture();
    };

    document.body.appendChild(btn);

    // N'afficher que sur une page de conversation ouverte.
    const updateVisibility = () => {
      btn.style.display = this.isOnThread() ? 'block' : 'none';
    };
    updateVisibility();
    setInterval(updateVisibility, 1000);
  }

  private setCaptureBtnIdle(): void {
    if (!this.captureControlBtn) return;
    this.captureControlBtn.textContent = '▶ Analyser la conversation';
    this.captureControlBtn.disabled = false;
  }

  private setCaptureBtnRunning(): void {
    if (!this.captureControlBtn) return;
    this.captureControlBtn.textContent = '⏳ Analyse en cours…';
    this.captureControlBtn.disabled = true;
  }

  /**
   * Analyse AUTONOME du thread ouvert (déclenchée par le bouton de page) :
   * l'extension scrolle elle-même jusqu'au début, fusionne avec l'historique et
   * analyse. Aucune action utilisateur (plus de scroll manuel).
   */
  private async runManualCapture(): Promise<void> {
    if (this.manualCaptureRunning || this.running) return;

    // Garde-fou : si l'extension a été rechargée sans recharger la page, CE script
    // est périmé (chrome.runtime mort) → on le signale AVANT d'analyser.
    if (!this.isExtensionContextValid()) {
      this.overlay.show('Recharge la page Instagram (F5), puis réessaie.');
      this.overlay.showError('Extension mise à jour — recharge la page (F5)');
      return;
    }

    const username = this.getThreadContactUsername();
    if (!username) {
      this.overlay.show('Ouvre d\'abord une conversation, puis clique Analyser.');
      this.overlay.showError('Aucune conversation ouverte');
      return;
    }

    this.manualCaptureRunning = true;
    this.setCaptureBtnRunning();
    console.log(`🤖 [Pro] Analyse autonome démarrée pour @${username}`);

    try {
      const history = await this.fetchStoredHistory(username);
      const knownKeys = new Set(history.map((m) => m.messageId));

      this.overlay.show('Reading the conversation…');
      const scroller = new DMThreadScroller({
        knownKeys,
        onProgress: (n) =>
          this.overlay.updateProgress(n, n + 1, `Lecture automatique de la conversation… (${n} messages)`),
      });
      const collected = await scroller.collect({ manual: false });

      await this.mergeDumpAndAnalyze(username, history, collected, scroller);
    } catch (error) {
      console.error('❌ [Pro] Erreur analyse autonome:', error);
      this.overlay.showError('Erreur pendant l\'analyse');
    } finally {
      this.manualCaptureRunning = false;
      this.setCaptureBtnIdle();
    }
  }

  /**
   * Phase 5 : sauvegarde la conversation (sync-dms), récupère le score DM
   * quantitatif serveur (analyze-dms), combine avec l'analyse heuristique
   * mots-clés/ton (extension), calcule le score global et le persiste
   * (analyze-contact → contact_scores + circle_members.relationship_score).
   */
  private async analyzeAndUpdate(
    username: string,
    messages: ExtractedMessage[],
    seenReceipt = false
  ): Promise<void> {
    this.overlay.show('Updating stats…');
    await this.persistAnalysis(username, messages, seenReceipt);
  }

  /**
   * Coeur d'analyse + persistance (sans overlay) — réutilisé par le flux manuel
   * et par l'analyse live (Phase 6).
   */
  private async persistAnalysis(
    username: string,
    messages: ExtractedMessage[],
    seenReceipt = false
  ): Promise<void> {
    const convMessages: ConversationMessage[] = messages.map((m) => ({
      text: m.text,
      isSent: m.isSent,
      timestamp: m.timestamp,
    }));
    const conversation: Conversation = { id: username, participants: [username], messages: convMessages };

    // 1. Sauvegarde des messages + de la conversation (sync-dms).
    const lastMessageAt = Math.max(...messages.map((m) => m.timestamp ?? 0), Date.now());
    const syncMessages = messages.map((m) => ({
      conversationWith: username,
      messageId: m.messageId,
      text: m.text,
      mediaUrls: [] as string[],
      isSent: m.isSent,
      isRead: true,
      reactions: m.reactions || [],
      timestamp: m.timestamp ?? Date.now(),
    }));
    const syncConversations = [
      {
        username,
        fullName: '',
        avatarUrl: '',
        isVerified: false,
        messageCount: messages.length,
        unreadCount: 0,
        lastMessageAt,
      },
    ];
    await chrome.runtime.sendMessage({ type: 'SYNC_DMS', messages: syncMessages, conversations: syncConversations });

    // 2. Score DM quantitatif serveur (0-20).
    let serverDmScore = 0;
    try {
      const resp = (await chrome.runtime.sendMessage({ type: 'ANALYZE_DMS', username })) as any;
      serverDmScore = resp?.dmScore ?? 0;
    } catch {
      /* best-effort */
    }

    // 3. Part qualitative (mots-clés/ton) côté extension (0-10) + ton dominant.
    const keywordTone = this.analyzer.scoreKeywordsTone(conversation);
    const tone = this.analyzer.analyzeConversationTone(convMessages);

    // 4. Score global via ScoringEngine ; on remplace la composante DM par
    //    l'hybride serveur+extension (cap 30) puis on recalcule le total.
    const sent = convMessages.filter((m) => m.isSent).length;
    const received = convMessages.length - sent;
    const ts = convMessages.map((m) => m.timestamp).filter((t): t is number => !!t);
    const firstInteractionDate = ts.length ? Math.min(...ts) : Date.now();
    const lastInteractionDate = ts.length ? Math.max(...ts) : Date.now();

    const contact: Contact = {
      username,
      conversation,
      likesGiven: 0,
      commentsGiven: 0,
      storiesViewed: 0,
      sharesReceived: 0,
      profileVisits: 0,
      timeSpentMinutes: 0,
      linkClicks: 0,
      firstInteractionDate,
      lastInteractionDate,
      isFollowingBack: received > 0,
      mutualEngagementCount: Math.min(received, 5),
      mutualConnectionsCount: 0,
    };

    const breakdown = this.scoring.calculateTotalScore(contact);
    breakdown.dms = Math.min(30, serverDmScore + keywordTone);
    breakdown.total = Math.min(
      100,
      breakdown.dms + breakdown.engagement + breakdown.activity + breakdown.seniority + breakdown.reciprocity
    );

    const category = this.scoring.determineSuggestedCategory(breakdown.total, tone.category);

    // 5. Axe « température » : dynamique de conversation (temps de réponse, taux,
    //    réponses brèves, vu sans réponse…) → chaud/tiède/froid + conseils.
    const dyn = this.dynamics.analyze(messages, seenReceipt);

    // 6. Coaching « setting » : phase de qualification (Connexion → Situation →
    //    Problème → Transition) + synthèse structurée (révélé / manquant / faits).
    //    Les deux axes sont désormais DISTINCTS :
    //      - `settingSummary` = qualification (prochaine question, faits, manques) ;
    //      - `advice`         = dynamique relationnelle (comportement) uniquement.
    const coaching = this.settingCoach.analyze(messages, dyn);
    const storedLang = await chrome.storage.local.get('walerLanguage');
    const lang: 'en' | 'fr' = storedLang.walerLanguage === 'fr' ? 'fr' : 'en';
    const advice = this.dynamics.buildAdvice(dyn, lang);

    console.log(
      `📊 [Pro] @${username} — dms=${breakdown.dms} (serveur ${serverDmScore} + mots-clés ${keywordTone}), ` +
        `total=${breakdown.total}, catégorie=${category}, température=${dyn.temperature} (${dyn.temperatureScore}), ` +
        `phase=${coaching.phase}`
    );

    // 7. Persistance du score + température + phase/synthèse setting (contact_scores + circle_members).
    await chrome.runtime.sendMessage({
      type: 'UPDATE_CONTACT_SCORE',
      username,
      scoreBreakdown: breakdown,
      category,
      temperature: dyn.temperature,
      dynamics: dyn,
      advice,
      settingPhase: coaching.phase,
      settingSummary: coaching.summary,
    });
  }

  // ==================== Recherche dans l'inbox ====================

  /**
   * Localise la ligne de conversation d'un contact dans l'inbox.
   *
   * On ne connaît que le @username (ID Instagram), or les lignes de l'inbox
   * affichent le NOM de profil (« Paco Martinez »), pas le username. Comme le
   * contact a été ajouté depuis « people », on dispose aussi de son nom de
   * profil (`fullName`) : c'est lui qui permet de matcher la ligne.
   *
   * L'inbox répartit en outre les conversations entre onglets (Primary /
   * General) : on cherche dans l'onglet actif (Primary) puis, si rien, on
   * bascule sur « General » et on réessaie.
   */
  private async scrollAndLocateRow(username: string, fullName = ''): Promise<HTMLElement | null> {
    // S'assurer d'être sur l'inbox (la liste des conversations y est affichée).
    if (this.isOnThread()) {
      window.location.href = 'https://www.instagram.com/direct/inbox/';
      await this.sleep(2500);
    }

    // 1. Recherche dans l'onglet courant (Primary par défaut).
    let row = await this.scrollAndLocateRowInTab(username, fullName);
    if (row) return row;

    // 2. Pas trouvé : basculer sur l'onglet « General » et réessayer.
    if (await this.switchInboxTab(['General', 'Général', 'Generale'])) {
      this.overlay.show(`Searching for @${username} in "General"…`);
      row = await this.scrollAndLocateRowInTab(username, fullName);
      if (row) return row;
    }

    return null;
  }

  /**
   * Localise la ligne de conversation dans l'onglet actuellement affiché en
   * scrollant l'historique de la liste. La liste est virtualisée : on extrait
   * au fil du scroll et on s'arrête dès qu'on trouve la ligne correspondante ou
   * qu'on atteint le bas.
   */
  private async scrollAndLocateRowInTab(username: string, fullName = ''): Promise<HTMLElement | null> {
    // Vérifier d'abord ce qui est déjà visible (conversations récentes en haut).
    let row = this.findConversationRow(username, fullName);
    if (row) return row;

    const list = await this.findInboxListContainer();
    if (!list) {
      console.warn('⚠️ [Pro] Liste des conversations inbox introuvable');
      // Dernier recours : ce qui est visible sans conteneur scrollable identifié.
      return this.findConversationRow(username, fullName);
    }

    let stuck = 0;
    let attempts = 0;
    const maxStuck = 6;

    while (stuck < maxStuck && attempts < 200) {
      attempts++;
      const beforeTop = list.scrollTop;
      const beforeHeight = list.scrollHeight;
      const beforeRows = this.visibleRowSignature();

      const atBottom = await this.humanScrollListDown(list);
      await this.waitForListLoad(list, beforeHeight);

      row = this.findConversationRow(username, fullName);
      if (row) return row;

      // Détection de progression robuste à la virtualisation : sous scroll au
      // `wheel`, `scrollTop`/`scrollHeight` peuvent rester figés alors que les
      // lignes se renouvellent. On considère donc aussi le changement de la
      // SIGNATURE des lignes visibles (1re/dernière conversation rendue).
      const scrollMoved = list.scrollTop > beforeTop + 2 || list.scrollHeight > beforeHeight + 2;
      const rowsChanged = this.visibleRowSignature() !== beforeRows;
      if (atBottom || (!scrollMoved && !rowsChanged)) {
        stuck++;
      } else {
        stuck = 0;
      }
    }

    return null;
  }

  /**
   * Signature des conversations actuellement rendues (nb de lignes + nom de la
   * 1re et de la dernière). Sert à détecter le renouvellement des lignes quand
   * le scroll est virtualisé et que `scrollTop` ne bouge pas.
   */
  private visibleRowSignature(): string {
    const rows = this.conversationRows();
    if (rows.length === 0) return '';
    const txt = (el: HTMLElement) => (el.textContent || '').trim().slice(0, 40);
    return `${rows.length}|${txt(rows[0])}|${txt(rows[rows.length - 1])}`;
  }

  /**
   * Trouve le conteneur scrollable de la liste des conversations de l'inbox.
   *
   * Instagram place souvent le VRAI viewport scrollable sur un ancêtre dont
   * `overflowY` n'est ni `auto` ni `scroll` (scroll piloté au `wheel` / DOM
   * imbriqué). Se fier au seul `overflowY` (`isScrollable`) renvoyait alors
   * `null` alors que la liste défile bel et bien. On teste donc le déplacement
   * RÉEL du `scrollTop` (`respondsToScroll`), avec replis successifs :
   *  1. ancêtre d'une ligne de conversation qui répond au scroll ;
   *  2. plus grand div du panneau qui répond au scroll ;
   *  3. à défaut, on garde le 1er ancêtre `overflowY:auto/scroll` (le scroll
   *     se fera par événements `wheel`, cf. `humanScrollListDown`).
   */
  private async findInboxListContainer(): Promise<HTMLElement | null> {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const rows = this.conversationRows();
      if (rows.length > 0) {
        // 1. Remonter depuis une ligne vers l'ancêtre qui RÉPOND au scroll.
        let fallback: HTMLElement | null = null;
        let el: HTMLElement | null = rows[0];
        while (el && el !== document.body) {
          if (this.respondsToScroll(el)) {
            console.log(`🧭 [Pro] Scroller inbox trouvé (ancêtre d'une ligne) : ${this.describe(el)}`);
            return el;
          }
          if (!fallback && this.isScrollable(el)) fallback = el;
          el = el.parentElement;
        }

        // 2. Repli : le plus grand div scrollable qui CONTIENT des lignes.
        const scrollers = (Array.from(document.querySelectorAll('div')) as HTMLElement[])
          .filter((d) => this.respondsToScroll(d))
          .sort((a, b) => b.scrollHeight - a.scrollHeight);
        const withRows = scrollers.find((d) => this.conversationRows(d).length > 0);
        if (withRows) {
          console.log(`🧭 [Pro] Scroller inbox trouvé (div scrollable avec lignes) : ${this.describe(withRows)}`);
          return withRows;
        }
        if (scrollers[0]) {
          console.log(`🧭 [Pro] Scroller inbox = plus grand scrollable : ${this.describe(scrollers[0])}`);
          return scrollers[0];
        }
        // 3. Dernier repli : overflow déclaré, piloté ensuite au wheel.
        if (fallback) {
          console.log(`🧭 [Pro] Scroller inbox (overflow déclaré, wheel) : ${this.describe(fallback)}`);
          return fallback;
        }
      }
      await this.sleep(300);
    }
    return null;
  }

  /** Lignes de conversation actuellement rendues dans l'inbox (cf. INBOX_ROW_SELECTOR). */
  private conversationRows(scope: ParentNode = document): HTMLElement[] {
    return Array.from(scope.querySelectorAll(INBOX_ROW_SELECTOR)) as HTMLElement[];
  }

  /** Description courte d'un élément pour les logs de diagnostic. */
  private describe(el: HTMLElement): string {
    return `<${el.tagName.toLowerCase()}> sh=${el.scrollHeight} ch=${el.clientHeight} rows=${this.conversationRows(el).length}`;
  }

  /**
   * Teste si un élément RÉPOND réellement à une modification de `scrollTop`.
   * On déplace de quelques pixels puis on restaure. Évite de retenir un
   * conteneur qui « a un overflow » mais ne défile pas (DOM imbriqué d'IG).
   */
  private respondsToScroll(el: HTMLElement): boolean {
    if (el.scrollHeight <= el.clientHeight + 4) return false;
    const before = el.scrollTop;
    for (const delta of [10, -10]) {
      el.scrollTop = before + delta;
      if (Math.abs(el.scrollTop - before) >= 1) {
        el.scrollTop = before;
        return true;
      }
    }
    el.scrollTop = before;
    return false;
  }

  /**
   * Bascule sur l'onglet de l'inbox dont le libellé correspond (Primary /
   * General / Demandes). Renvoie true si l'onglet a été trouvé et cliqué.
   * Les onglets sont des éléments cliquables en haut de la liste contenant
   * exactement le libellé recherché.
   */
  private async switchInboxTab(labels: string[]): Promise<boolean> {
    const wanted = labels.map((l) => l.toLowerCase());

    // Les onglets ne sont pas toujours des role="tab"/button : ce sont souvent
    // de simples <span>/<div> dont le texte EXACT est le libellé. On cible donc
    // l'élément feuille dont le texte correspond, puis on clique l'ancêtre
    // réellement cliquable (role="tab"/"button", <a>, <button>) le plus proche.
    const all = Array.from(document.querySelectorAll('span, div, a, button')) as HTMLElement[];
    const leaf = all.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      return wanted.includes(text); // texte EXACT → évite les gros conteneurs
    });

    if (!leaf) {
      console.warn(`⚠️ [Pro] Onglet inbox introuvable (${labels.join('/')})`);
      return false;
    }

    const clickable =
      (leaf.closest('[role="tab"], [role="button"], a, button') as HTMLElement | null) || leaf;

    console.log(`🗂️ [Pro] Bascule sur l'onglet « ${leaf.textContent?.trim()} »`);
    clickable.click();
    await this.sleep(1800); // laisser la liste de l'onglet se charger
    return true;
  }

  private isScrollable(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 10;
  }

  /** Scrolle la liste vers le BAS de façon progressive/humaine. Renvoie true si en bas. */
  private async humanScrollListDown(container: HTMLElement): Promise<boolean> {
    const maxTop = container.scrollHeight - container.clientHeight;
    const current = container.scrollTop;
    if (current >= maxTop - 5) {
      // Déjà en bas : petit nudge pour déclencher un éventuel chargement.
      container.scrollTop = maxTop;
      await this.sleep(400);
      return true;
    }

    const baseScroll = 300 + Math.random() * 200; // 300-500px
    const variation = Math.random() * 200 - 100; // ±100px
    const amount = Math.min(baseScroll + variation, maxTop - current);

    const steps = 5 + Math.floor(Math.random() * 5);
    const stepSize = amount / steps;
    const stepDelay = 16 + Math.floor(Math.random() * 20);

    const before = container.scrollTop;
    for (let i = 0; i < steps; i++) {
      container.scrollTop += stepSize;
      await this.sleep(stepDelay);
    }

    // Repli : si `scrollTop` n'a pas bougé, la liste est pilotée au `wheel`
    // (virtualisation IG) → on émet la molette vers le bas comme un humain.
    if (Math.abs(container.scrollTop - before) < 2) {
      this.wheelDown(container, amount);
    }

    await this.sleep(300 + Math.random() * 400);
    return container.scrollTop >= maxTop - 5;
  }

  /** Émet des événements `wheel` vers le bas (repli quand `scrollTop` n'agit pas). */
  private wheelDown(container: HTMLElement, amount: number): void {
    const opts: WheelEventInit = {
      deltaY: Math.abs(amount),
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    container.dispatchEvent(new WheelEvent('wheel', opts));
    const target = container.querySelector(INBOX_ROW_SELECTOR);
    target?.dispatchEvent(new WheelEvent('wheel', opts));
  }

  private async waitForListLoad(container: HTMLElement, initialHeight: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 4000) {
      await this.sleep(120);
      if (container.scrollHeight > initialHeight) {
        await this.sleep(200);
        return;
      }
    }
  }

  /**
   * Cherche, parmi les lignes affichées, la conversation du contact.
   *
   * Les lignes de l'inbox affichent généralement le NOM de profil et non le
   * @username : le `fullName` (connu via « people ») est donc le critère
   * principal. On retombe sur le username quand il est disponible (lien profil
   * ou texte de la ligne), pour les comptes dont le nom = le username.
   */
  private findConversationRow(username: string, fullName = ''): HTMLElement | null {
    const target = username.toLowerCase();
    const name = fullName.trim().toLowerCase();

    // Stratégie 1 : un lien direct vers le profil du contact dans une ligne.
    const profileLink = Array.from(document.querySelectorAll('a[href^="/"]')).find((a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      return m && m[1].toLowerCase() === target;
    });
    if (profileLink) {
      const row = profileLink.closest('[role="button"], li, div[role="listitem"]') as HTMLElement | null;
      if (row) return row;
    }

    // Stratégie 2 : une ligne dont le texte contient le nom de profil OU le
    //   username. Le nom de profil est prioritaire car c'est ce qu'affiche
    //   l'inbox ; on se limite aux conteneurs de taille raisonnable (une ligne).
    const candidates = Array.from(
      document.querySelectorAll('[role="button"], li, div[role="listitem"]')
    ) as HTMLElement[];
    for (const el of candidates) {
      const text = (el.textContent || '').toLowerCase();
      if (text.length === 0 || text.length >= 200) continue; // éviter les gros conteneurs
      if (name && text.includes(name)) return el;
      if (text.includes(target)) return el;
    }
    return null;
  }

  private async openThread(row: HTMLElement): Promise<void> {
    row.click();
    // Attendre la transition SPA vers /direct/t/<id>/
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (this.isOnThread()) break;
      await this.sleep(300);
    }
    await this.sleep(1500); // laisser les messages se charger
  }

  // ==================== Phase 3 (hook — implémenté ensuite) ====================

  /**
   * Détecte si la conversation est non lue (point bleu) et, le cas échéant,
   * demande la permission d'entrer. Renvoie true si on peut continuer.
   */
  private async checkUnreadAndAskPermission(row: HTMLElement, username: string): Promise<boolean> {
    const isUnread = this.isRowUnread(row);

    if (!isUnread) {
      // Conversation déjà lue → pas de demande de permission.
      return true;
    }

    const unreadReceivedAt = this.readRowTimestamp(row);
    await this.setState({ phase: 'await_permission', unreadDetected: true, unreadReceivedAt });

    const heure = unreadReceivedAt
      ? new Date(unreadReceivedAt).toLocaleString()
      : 'recently';

    this.overlay.show('Waiting for your authorization…');

    const allowed = await showConfirmDialog(
      `@${username}'s message hasn't been read yet (received ${heure}).\n\n` +
        `Opening the conversation will mark it as read. Do you authorize the analysis?`,
      { title: 'Unread message', okLabel: 'Allow', cancelLabel: 'Decline' }
    );

    if (!allowed) {
      // Noter le pattern de refus localement (sans envoi serveur).
      await this.recordRefusal({ username, refusedAt: Date.now(), unreadReceivedAt });
      this.overlay.showError('You declined opening the conversation. Process stopped');
      return false;
    }

    return true;
  }

  /** Détecte un indicateur "non lu" (point bleu / aria-label / texte en gras). */
  private isRowUnread(row: HTMLElement): boolean {
    // 1. aria-label explicite (FR/EN).
    if (row.querySelector('[aria-label*="Unread" i], [aria-label*="Non lu" i], [aria-label*="non lu" i]')) {
      return true;
    }

    // 2. Point bleu : petit élément circulaire au fond bleu Instagram (~rgb(0,149,246)).
    const dots = row.querySelectorAll('div, span');
    for (const el of Array.from(dots)) {
      const style = window.getComputedStyle(el as Element);
      const bg = style.backgroundColor || '';
      const radius = style.borderRadius || '';
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m && (radius.includes('50%') || radius.includes('9999'))) {
        const r = +m[1], g = +m[2], b = +m[3];
        // Bleu dominant et assez vif (point de notification).
        if (b > 180 && b > r + 60 && g > 100 && r < 120) {
          return true;
        }
      }
    }

    // 3. Nom/aperçu en gras : les conversations non lues sont en gras.
    const strongish = Array.from(row.querySelectorAll('span, div')).some((el) => {
      const fw = window.getComputedStyle(el as Element).fontWeight;
      const n = parseInt(fw, 10);
      return !isNaN(n) && n >= 700;
    });
    return strongish;
  }

  /** Lit l'horodatage du dernier message de la ligne (en ms) si disponible. */
  private readRowTimestamp(row: HTMLElement): number | null {
    const timeEl = row.querySelector('time');
    const dt = timeEl?.getAttribute('datetime');
    if (dt) {
      const t = new Date(dt).getTime();
      if (!isNaN(t)) return t;
    }
    return null;
  }

  private async recordRefusal(refusal: ProRefusal): Promise<void> {
    const stored = await chrome.storage.local.get('proRefusals');
    const list: ProRefusal[] = Array.isArray(stored.proRefusals) ? stored.proRefusals : [];
    list.push(refusal);
    await chrome.storage.local.set({ proRefusals: list });
    console.log(`🚫 [Pro] Refus enregistré pour @${refusal.username}`, refusal);
  }

  // ==================== Phase 6 — détection live ====================

  private liveWatchStarted = false;
  private livePeople = new Set<string>();
  private liveLastAnalyzed = new Map<string, number>();
  /** Signature du dernier état analysé par thread (détection de nouveau message). */
  private liveLastSignature = new Map<string, string>();
  /** Rafraîchissement périodique de secours, même sans nouveau message. */
  private readonly LIVE_THROTTLE_MS = 30 * 1000; // 30 s
  /** Garde-fou anti-rafale : délai mini entre 2 analyses d'un même thread. */
  private readonly LIVE_MIN_GAP_MS = 8 * 1000; // 8 s
  /** Id de l'intervalle live (pour l'arrêter si le contexte est invalidé). */
  private liveIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Démarre la surveillance des conversations ouvertes par l'utilisateur.
   * Quand il ouvre la conversation d'un contact suivi (people), on analyse
   * silencieusement les messages visibles et on met à jour ses stats.
   */
  startLiveWatch(peopleUsernames: string[]): void {
    if (this.liveWatchStarted) return;
    this.liveWatchStarted = true;
    this.livePeople = new Set(peopleUsernames.map((u) => u.toLowerCase()));
    console.log(`✨ [Pro] Live watch démarré pour ${this.livePeople.size} contact(s)`);

    this.liveIntervalId = setInterval(() => {
      this.liveTick().catch((e) => {
        // Après un rechargement de l'extension, l'ANCIEN content script survit sur
        // la page mais son chrome.runtime devient invalide → « Extension context
        // invalidated ». Inutile de continuer : on arrête l'intervalle en silence
        // (recharger la page Instagram relance proprement un content script neuf).
        if (this.isContextInvalidated(e)) {
          if (this.liveIntervalId) clearInterval(this.liveIntervalId);
          this.liveIntervalId = null;
          console.warn('[Pro] Live watch arrêté : contexte d\'extension invalidé (recharge la page Instagram).');
          return;
        }
        console.error('[Pro] liveTick error', e);
      });
    }, 3000);
  }

  /** Vrai si l'erreur traduit un contexte d'extension invalidé (après reload). */
  private isContextInvalidated(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return /context invalidated|context\.|Extension context/i.test(msg);
  }

  /** Vrai si le contexte d'extension est encore valide (page pas périmée). */
  private isExtensionContextValid(): boolean {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  /** Met à jour la liste des contacts suivis (sans relancer l'intervalle). */
  updateLivePeople(peopleUsernames: string[]): void {
    this.livePeople = new Set(peopleUsernames.map((u) => u.toLowerCase()));
  }

  private async liveTick(): Promise<void> {
    // Ne pas interférer avec une analyse manuelle en cours.
    if (this.running) return;
    if (!this.isOnThread()) return;

    const username = this.getThreadContactUsername();
    if (!username) return;

    const key = username.toLowerCase();
    if (!this.livePeople.has(key)) return;

    const container = document.querySelector('div[role="grid"]') as HTMLElement | null;
    const scopeEl = container || (document.querySelector('main') as HTMLElement | null);
    if (!scopeEl) return;

    // Décider s'il faut (ré)analyser : soit le contenu a changé (nouveau
    // message → signature différente), soit le délai de rafraîchissement
    // périodique est écoulé. Un garde-fou anti-rafale évite de réanalyser en
    // boucle (re-render, indicateur de saisie…).
    const signature = this.computeThreadSignature(scopeEl);
    const last = this.liveLastAnalyzed.get(key) || 0;
    const sinceLast = Date.now() - last;
    const changed = this.liveLastSignature.get(key) !== signature;

    if (changed) {
      if (sinceLast < this.LIVE_MIN_GAP_MS) return; // trop tôt → on réessaiera au prochain tick
    } else if (sinceLast < this.LIVE_THROTTLE_MS) {
      return; // rien de neuf et rafraîchissement périodique pas encore dû
    }

    // Marquer tôt pour éviter les déclenchements concurrents.
    this.liveLastAnalyzed.set(key, Date.now());
    this.liveLastSignature.set(key, signature);

    console.log(`✨ [Pro] Analyse live de la conversation avec @${username}${changed ? ' (nouveau message détecté)' : ''}`);

    // Extraire les messages actuellement visibles (pas de scroll complet pour
    // ne pas gêner l'utilisateur), puis mettre à jour les stats silencieusement.
    const extractor = new DMMessageExtractor();
    await extractor.expandVoiceTranscripts(scopeEl);
    extractor.extractVisible(scopeEl);
    const messages = extractor.getAll();
    if (messages.length === 0) return;

    const seenReceipt = extractor.detectSeenReceipt(scopeEl);
    await this.persistAnalysis(username, messages, seenReceipt);
    console.log(`✅ [Pro] Stats live mises à jour pour @${username} (${messages.length} messages visibles)`);
  }

  /**
   * Signature légère du thread visible pour détecter un nouveau message SANS
   * cliquer/déplier (l'expansion des vocaux ne se fait qu'au moment d'analyser) :
   * nombre de bulles + texte de la dernière bulle.
   */
  private computeThreadSignature(scopeEl: HTMLElement): string {
    const rows = scopeEl.querySelectorAll('div[role="row"]');
    const lastText = (rows[rows.length - 1]?.textContent || '').slice(0, 80);
    return `${rows.length}|${lastText}`;
  }

  /**
   * Extrait le username du contact depuis l'en-tête du thread ouvert.
   *
   * IG ne met pas toujours de <header> sémantique : on tente plusieurs sources,
   * de la plus fiable à la plus permissive, en excluant la barre de navigation
   * gauche (son propre profil) et la liste des conversations (liens /direct/t/).
   */
  private getThreadContactUsername(): string | null {
    const profileRe = /^\/([a-zA-Z0-9._]{1,40})\/?$/;
    // Mots réservés : ce ne sont jamais des @username de contact.
    const reserved = new Set(['explore', 'reels', 'reel', 'direct', 'stories', 'accounts', 'p', 'tv', 'about']);

    const fromHref = (el: Element | null | undefined): string | null => {
      const m = (el?.getAttribute('href') || '').match(profileRe);
      return m && !reserved.has(m[1].toLowerCase()) ? m[1] : null;
    };

    // 1. Bouton/lien « Voir le profil » / « View profile » → href du contact.
    const labelRe = /voir le profil|voir profil|view profile/i;
    const labeled = (Array.from(document.querySelectorAll('a[href^="/"]')) as HTMLAnchorElement[]).find(
      (a) => labelRe.test((a.textContent || '') + ' ' + (a.getAttribute('aria-label') || '')) && fromHref(a)
    );
    if (labeled) return fromHref(labeled);

    // 2. En-tête sémantique (ancienne structure).
    const headerUser = fromHref(document.querySelector('header a[href^="/"]'));
    if (headerUser) return headerUser;

    // 3. Sous-titre « pako_mrtz · Instagram » affiché sous le nom dans l'en-tête.
    const subtitle = (Array.from(document.querySelectorAll('span, div')) as HTMLElement[]).find((el) => {
      if (el.children.length > 0) return false;
      return /^[a-zA-Z0-9._]{1,40}\s*·\s*Instagram$/i.test((el.textContent || '').trim());
    });
    if (subtitle) {
      const u = (subtitle.textContent || '').trim().split('·')[0].trim();
      if (u && !reserved.has(u.toLowerCase())) return u;
    }

    // 4. Repli : lien de profil le plus HAUT de la page (hors nav gauche et hors
    //    sidebar des conversations) — l'en-tête du thread est tout en haut.
    const candidate = (Array.from(document.querySelectorAll('a[href^="/"]')) as HTMLAnchorElement[])
      .filter((a) => {
        if (!fromHref(a)) return false;
        if (a.closest('nav, [role="navigation"]')) return false; // rail gauche (son propre profil)
        if (a.closest('a[href^="/direct/t/"]')) return false; // ligne de la sidebar
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.top < 220; // proche du haut = en-tête
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    return fromHref(candidate);
  }

  // ==================== Helpers ====================

  /**
   * Résout le nom de profil (full_name) d'un username via l'API web interne
   * d'Instagram. Sert de repli quand « people » n'a pas stocké le nom : la
   * ligne de l'inbox affiche ce nom et non le @username. Renvoie '' si le compte
   * n'a pas de nom (ou en cas d'erreur) — le match par username prendra le relais.
   */
  private async resolveProfileName(username: string): Promise<string> {
    try {
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
      const resp = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: { 'x-ig-app-id': '936619743392459', ...(csrf ? { 'x-csrftoken': csrf } : {}) },
          credentials: 'include',
        }
      );
      if (!resp.ok) {
        console.log(`⚠️ [Pro] web_profile_info @${username} → HTTP ${resp.status}`);
        return '';
      }
      const data: any = await resp.json();
      return (data?.data?.user?.full_name || '').trim();
    } catch (e) {
      console.log(`⚠️ [Pro] Résolution du nom de @${username} échouée:`, e);
      return '';
    }
  }

  private isOnInbox(): boolean {
    return window.location.pathname.startsWith('/direct/inbox');
  }

  private isOnThread(): boolean {
    return window.location.pathname.startsWith('/direct/t/');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
