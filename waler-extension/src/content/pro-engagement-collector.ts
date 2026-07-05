/**
 * Pro Engagement Collector
 *
 * Remplace l'ancien agent Python Playwright (agent_pro_circle.py). Analyse en
 * page (pas de Playwright), avec la session du navigateur de l'utilisateur.
 *
 * Stratégie (sans rechargement) :
 *   profil → on CLIQUE chaque vignette de la grille pour ouvrir le post en
 *   MODAL (vue /p/… ou /reel/… avec "…", likes et commentaires accessibles —
 *   contrairement à une navigation directe par URL qui ouvre le lecteur reel
 *   plein écran /reels/… sans ces éléments). Pour chaque post :
 *     - commentaires : note les People qui ont commenté (+ date/heure)
 *     - likes : ouvre la liste des likers, note les People présentes (+ lien)
 *   On ferme la modale (Échap) et on passe à la vignette suivante. Le content
 *   script reste vivant pendant toute la boucle → aucun rechargement.
 *   → envoi au backend (SYNC_PRO_ENGAGEMENT) pour mettre à jour les stats.
 *
 * Seule la navigation INITIALE vers le profil recharge le content script ;
 * l'état (phase 'run') est persisté dans chrome.storage.local pour survivre à
 * ce reload, puis toute la boucle s'exécute d'un trait.
 */

import type ScanOverlay from './scan-overlay.js';
import { ProfileAnalyzer } from './profile-analyzer.js';

interface CollectedPerson {
  likedPosts: Array<{ postId: string; postUrl: string; likedAt: string }>;
  comments: Array<{ postId: string; postUrl: string; commentedAt: string }>;
}

export type ProEngPhase = 'run' | 'done';

export interface ProEngagementState {
  phase: ProEngPhase;
  ownUsername: string;
  targets: string[]; // usernames des People (minuscules)
  startedAt: number;
}

const STATE_KEY = 'proEngagementState';

// Plafond dynamique : proportionnel au nombre de posts du compte, borné.
const POSTS_RATIO = 0.5;
const POSTS_MIN = 20;
const POSTS_MAX = 150;

// Connexions mutuelles : bornes de coût (pagination abonnements + nb de People).
const MAX_FOLLOWING_PAGES = 20; // ~1000 abonnements lus max par compte
const MAX_MUTUAL_PEOPLE = 10; // nb de People analysés pour les mutuelles par run
const MAX_MUTUAL_MEMBERS = 50; // nb max de comptes en commun gardés par People

export class ProEngagementCollector {
  private overlay: ScanOverlay;
  private running = false;
  /** Arrêt global demandé (bouton d'arrêt du popup) — vérifié dans la boucle. */
  private stopRequested = false;

  constructor(overlay: ScanOverlay) {
    this.overlay = overlay;
  }

  /** Arrêt demandé par l'utilisateur (bouton d'arrêt global). La boucle d'analyse
   *  d'engagement s'arrête à la prochaine itération. */
  requestStop(): void {
    if (this.stopRequested) return;
    this.stopRequested = true;
    console.log('⏹ [ProEng] Arrêt demandé — interruption de l\'analyse d\'engagement.');
    this.overlay.showError('Analysis stopped');
    void this.clearState();
  }

  // ==================== État ====================

  private async getState(): Promise<ProEngagementState | null> {
    try {
      const stored = await chrome.storage.local.get(STATE_KEY);
      return (stored[STATE_KEY] as ProEngagementState) || null;
    } catch {
      // Contexte d'extension invalidé (extension rechargée) — ignorer.
      return null;
    }
  }

  private async setState(patch: Partial<ProEngagementState>): Promise<ProEngagementState> {
    const current = (await this.getState()) || ({} as ProEngagementState);
    const next = { ...current, ...patch } as ProEngagementState;
    try {
      await chrome.storage.local.set({ [STATE_KEY]: next });
    } catch {
      /* contexte invalidé */
    }
    return next;
  }

  private async clearState(): Promise<void> {
    try {
      await chrome.storage.local.remove(STATE_KEY);
    } catch {
      /* contexte invalidé */
    }
  }

  // ==================== Démarrage / reprise ====================

  /**
   * Démarre l'analyse (depuis le popup). `ownUsername` = compte connecté ;
   * `targets` = usernames des People à suivre.
   */
  async start(ownUsername: string, targets: string[]): Promise<void> {
    if (!ownUsername) {
      this.overlay.showError('Connected account not found — open Instagram while logged in');
      return;
    }
    if (!targets || targets.length === 0) {
      this.overlay.showError('No people in People to analyze');
      return;
    }

    console.log(`✨ [ProEng] Démarrage pour @${ownUsername} — ${targets.length} People`);
    this.stopRequested = false; // réarmer pour une nouvelle analyse
    await this.setState({
      phase: 'run',
      ownUsername,
      targets: targets.map((t) => t.toLowerCase()),
      startedAt: Date.now(),
    });

    this.overlay.show('Opening your profile…');

    if (this.isOnOwnProfile(ownUsername)) {
      await this.resume();
    } else {
      window.location.href = `https://www.instagram.com/${ownUsername}/`;
    }
  }

  /** Reprend l'analyse au (re)chargement du content script. */
  async resume(): Promise<void> {
    const state = await this.getState();
    if (!state || state.phase !== 'run') return;
    if (this.running) return;
    this.running = true;

    try {
      if (!this.isOnOwnProfile(state.ownUsername)) {
        // On arrive (peut-être) après la navigation initiale : si on n'est pas
        // sur le profil, y aller.
        this.overlay.show('Opening your profile…');
        window.location.href = `https://www.instagram.com/${state.ownUsername}/`;
        return;
      }
      await this.runAll(state);
    } catch (error) {
      console.error('❌ [ProEng] Erreur:', error);
      this.overlay.showError('Error while analyzing engagement');
      await this.clearState();
    } finally {
      this.running = false;
    }
  }

  // ==================== Boucle principale (sur le profil, SPA) ====================

  private async runAll(state: ProEngagementState): Promise<void> {
    await this.sleep(2000);

    // Plafond proportionnel au nombre total de posts du compte.
    let totalPosts = 0;
    try {
      totalPosts = new ProfileAnalyzer().extractProfileStats()?.posts || 0;
    } catch {
      /* best-effort */
    }
    const cap =
      totalPosts > 0
        ? Math.max(POSTS_MIN, Math.min(POSTS_MAX, Math.ceil(totalPosts * POSTS_RATIO)))
        : POSTS_MIN;
    console.log(`✨ [ProEng] Analyse jusqu'à ${cap} post(s) (total≈${totalPosts})`);

    const processed = new Set<string>();
    // Posts dont la liste des likers a été tronquée (plafond API/DOM) : une People
    // non détectée sur ces posts est incertaine, pas un "n'a pas liké" fiable.
    const partialLikePosts = new Set<string>();
    const collected: Record<string, CollectedPerson> = {};
    const ensure = (u: string): CollectedPerson => {
      if (!collected[u]) collected[u] = { likedPosts: [], comments: [] };
      return collected[u];
    };

    // Agrégat de TOUS les engageurs (likers + commentateurs), pour suggérer des
    // People présents sur plusieurs publications.
    const engagers = new Map<string, { posts: Set<string>; liked: boolean; commented: boolean }>();
    const own = (state.ownUsername || '').toLowerCase();
    const trackEngager = (username: string, postId: string, kind: 'like' | 'comment') => {
      if (!username || username === own) return;
      let e = engagers.get(username);
      if (!e) {
        e = { posts: new Set(), liked: false, commented: false };
        engagers.set(username, e);
      }
      e.posts.add(postId);
      if (kind === 'like') e.liked = true;
      else e.commented = true;
    };

    let stuckScrolls = 0;
    while (processed.size < cap && stuckScrolls < 6) {
      if (this.stopRequested) {
        console.log('⏹ [ProEng] Analyse interrompue (arrêt global).');
        return;
      }
      const next = this.findNextGridPost(processed);
      if (!next) {
        // Charger plus de vignettes.
        window.scrollBy(0, 1400 + Math.random() * 600);
        await this.sleep(1200 + Math.random() * 600);
        stuckScrolls++;
        continue;
      }
      stuckScrolls = 0;
      processed.add(next.postId);
      this.overlay.updateProgress(processed.size, cap, `Analyse du post ${processed.size}…`);

      const opened = await this.openPostModal(next.el, next.postId);
      if (!opened) {
        console.warn(`⚠️ [ProEng] Impossible d'ouvrir le post ${next.postId}, on saute`);
        await this.closeModal();
        continue;
      }

      const root = this.getModalRoot();
      console.log(`🔎 [ProEng] Post ${next.postId} ouvert (href=${window.location.href})`);

      // 1. Commentaires (tous) + date/heure. On charge d'abord plus de
      //    commentaires (scroll + "voir plus") puis on extrait.
      await this.loadComments(root);
      const nowIso = new Date().toISOString();
      let peopleComments = 0;
      for (const { username, commentedAt } of this.extractComments(root)) {
        trackEngager(username, next.postId, 'comment');
        if (state.targets.includes(username)) {
          ensure(username).comments.push({ postId: next.postId, postUrl: next.postUrl, commentedAt });
          console.log(`💬 [ProEng] @${username} a commenté ${next.postUrl} (${commentedAt})`);
          peopleComments++;
        }
      }

      // 2. Likes (tous les likers ; on retient les People + on alimente l'agrégat).
      const { users: likers, total: likeTotal, truncated: likersTruncated } =
        await this.openAndCollectLikers(root, next.postId);
      if (likersTruncated) partialLikePosts.add(next.postId);
      let peopleLikes = 0;
      for (const u of likers) {
        trackEngager(u, next.postId, 'like');
        if (state.targets.includes(u)) {
          ensure(u).likedPosts.push({ postId: next.postId, postUrl: next.postUrl, likedAt: nowIso });
          console.log(`❤️ [ProEng] @${u} a liké ${next.postUrl}`);
          peopleLikes++;
        }
      }

      // Résumé visible : confirme que la vérification a bien eu lieu (et signale
      // si la liste des likers était partielle).
      console.log(
        `🔍 [ProEng] Post ${next.postId} : ${likers.length} liker(s) lus` +
          (likersTruncated ? ` / ${likeTotal} affichés ⚠️ PARTIEL` : '') +
          ` → ${peopleLikes} People ; ${peopleComments} commentaire(s) People`
      );

      // 3. Fermer la modale et passer au suivant.
      await this.closeModal();
      await this.sleep(800 + Math.random() * 900);
    }

    // Engageurs récurrents (présents sur ≥ 2 posts) → suggestions de People.
    const engagersPayload = Array.from(engagers.entries())
      .filter(([, e]) => e.posts.size >= 2)
      .map(([username, e]) => ({ username, posts: e.posts.size, liked: e.liked, commented: e.commented }));

    // Connexions mutuelles des People présents (abonnements communs avec le Pro).
    const presentPeople = Object.keys(collected);
    const mutuals = await this.collectMutuals(presentPeople, state.ownUsername);

    // L'ordre d'analyse (du plus récent au plus ancien) sert au backend pour
    // calculer le "streak" de présence consécutive.
    await this.finish(
      collected,
      Array.from(processed),
      engagersPayload,
      mutuals,
      state.ownUsername,
      Array.from(partialLikePosts)
    );
  }

  /** Trouve la prochaine vignette de post non encore traitée dans la grille. */
  private findNextGridPost(
    processed: Set<string>
  ): { el: HTMLElement; postId: string; postUrl: string } | null {
    const main = (document.querySelector('main') as HTMLElement | null) || document.body;
    const anchors = Array.from(
      main.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]')
    ) as HTMLElement[];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/(p|reel|reels)\/([^/]+)/);
      if (!m) continue;
      const postId = m[2];
      if (processed.has(postId)) continue;
      return { el: a, postId, postUrl: `https://www.instagram.com${m[0]}/` };
    }
    return null;
  }

  /** Clique une vignette et attend l'ouverture de la modale du post. */
  private async openPostModal(el: HTMLElement, postId: string): Promise<boolean> {
    el.scrollIntoView({ block: 'center' });
    await this.sleep(500);
    el.click();

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const hasDialog = !!document.querySelector('div[role="dialog"]');
      const onPost = this.extractPostId(window.location.pathname) === postId;
      if (onPost && (hasDialog || this.isOnPostPage())) return true;
      await this.sleep(300);
    }
    return this.extractPostId(window.location.pathname) === postId;
  }

  /** Racine de la modale du post (pour scoper l'extraction). */
  private getModalRoot(): HTMLElement {
    return (document.querySelector('div[role="dialog"]') as HTMLElement | null) || document.body;
  }

  /** Ferme la/les modale(s) ouverte(s) et revient à la grille du profil. */
  private async closeModal(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      if (!document.querySelector('div[role="dialog"]') && !this.isOnPostPage()) return;
      const closeBtn =
        (document.querySelector(
          'svg[aria-label="Close"], svg[aria-label="Fermer"]'
        )?.closest('button, [role="button"]') as HTMLElement | null) || null;
      if (closeBtn) closeBtn.click();
      else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await this.sleep(700);
    }
  }

  /**
   * Charge davantage de commentaires dans la modale (scroll de la zone de
   * commentaires + clic sur les boutons "voir plus de commentaires" / "+").
   */
  private async loadComments(root: HTMLElement): Promise<void> {
    const scrollables = (Array.from(root.querySelectorAll('div, ul')) as HTMLElement[]).filter((el) => {
      const st = getComputedStyle(el);
      return (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20;
    });

    for (let i = 0; i < 5; i++) {
      for (const s of scrollables) s.scrollTop = s.scrollHeight;
      // Bouton "Voir plus de commentaires" / "Load more comments" / "+".
      const more = (Array.from(root.querySelectorAll('button, [role="button"], span')) as HTMLElement[]).find(
        (el) => {
          const t = (el.textContent || '').trim().toLowerCase();
          return (
            /load more|view (all|more).*comment|plus de comment|voir.*comment|charger plus|afficher.*comment/.test(t) ||
            t === '+'
          );
        }
      );
      more?.click();
      await this.sleep(700);
    }
  }

  /**
   * Extrait TOUS les commentateurs de la modale du post (un par username).
   * Le filtrage People (targets) se fait au point d'appel ; on renvoie tout afin
   * d'alimenter aussi les suggestions de People.
   */
  private extractComments(root: HTMLElement): Array<{ username: string; commentedAt: string }> {
    const out: Array<{ username: string; commentedAt: string }> = [];
    const seen = new Set<string>();

    for (const a of Array.from(root.querySelectorAll('a[href^="/"]'))) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (!m) continue;
      const username = m[1].toLowerCase();
      if (seen.has(username)) continue;

      // Un commentaire = lien auteur + <time> dans un conteneur proche. On
      // remonte quelques niveaux jusqu'à trouver un <time> dans un bloc de
      // taille raisonnable (évite les liens "Aimé par …" qui n'ont pas de <time>
      // et le conteneur global de la modale).
      const dt = this.findCommentTime(a);
      if (!dt) continue;

      seen.add(username);
      out.push({ username, commentedAt: dt });
    }
    return out;
  }

  /** Cherche l'horodatage (<time datetime>) associé au lien auteur d'un commentaire. */
  private findCommentTime(authorLink: Element): string | null {
    let node: Element | null = authorLink;
    for (let i = 0; i < 6 && node; i++) {
      const timeEl = node.querySelector?.('time') as HTMLTimeElement | null;
      const dt = timeEl?.getAttribute('datetime');
      // Conteneur de taille raisonnable → bloc d'un commentaire, pas la modale entière.
      if (dt && (node.textContent || '').length < 500) return dt;
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Récupère les likers d'un post.
   *  0) API interne Instagram (le plus fiable, aucun clic) ;
   *  A) clic direct sur le compteur de likes dans la modale (photos) ;
   *  B) "Voir les statistiques" → clic du compteur (reels, fallback DOM).
   */
  private async openAndCollectLikers(
    root: HTMLElement,
    shortcode: string
  ): Promise<{ users: string[]; total: number | null; truncated: boolean }> {
    // Compteur affiché du post (lu tant que la modale est ouverte) → sert à
    // détecter une liste de likers tronquée (voir finalizeLikers).
    const total = this.extractLikeCount(root);

    // 0. API interne : likers via media_id calculé depuis le shortcode. Pas de
    //    clic → contourne le blocage des événements non "trusted" par IG.
    const apiUsers = await this.fetchLikersViaApi(shortcode);
    if (apiUsers) {
      console.log(`📋 [ProEng] (API) Liste des likers : ${apiUsers.length} username(s)`);
      return this.finalizeLikers(apiUsers, total, shortcode);
    }

    // Post sans like ?
    if (/be the first to like|première personne|premier à aimer|soyez la première/i.test(root.textContent || '')) {
      console.log('ℹ️ [ProEng] Post sans like (0)');
      return this.finalizeLikers([], total, shortcode);
    }

    // Chemin A : compteur directement cliquable dans la modale.
    const trigger = this.findLikesTrigger(root);
    if (trigger) {
      console.log(`👆 [ProEng] Compteur de likes ("${(trigger.textContent || '').trim().slice(0, 20)}") → ouverture…`);
      const usersA = await this.clickAndReadLikers(trigger);
      if (usersA) return this.finalizeLikers(usersA, total, shortcode);
      console.log('↪️ [ProEng] La liste des likers ne s\'est pas ouverte → tentative via "Voir les statistiques"');
    } else {
      console.log('↪️ [ProEng] Compteur introuvable dans la modale → tentative via "Voir les statistiques"');
    }

    // Chemin B (posts dont on est propriétaire) : "Voir les statistiques /
    // View insights" ouvre le panneau d'engagement où le compteur de likes est
    // accessible. (Le menu "…" du propriétaire ne propose pas "Go to post".)
    const went = await this.openInsights();
    if (!went) {
      console.log('⚠️ [ProEng] "Voir les statistiques" indisponible — likes non récupérés');
      return this.finalizeLikers([], total, shortcode);
    }
    await this.sleep(1500);
    // La vue statistiques (/insights/media/…) est une page (pas une modale) :
    // plusieurs "4" existent (barre d'action à gauche = cliquable, panneau de
    // droite = simple stat). On essaie chaque candidat jusqu'à ce qu'une liste
    // de likers s'ouvre.
    let users: string[] = [];
    const candidates = this.findLikesCounters(document.body);
    console.log(`🔢 [ProEng] ${candidates.length} compteur(s) ❤️ candidat(s) sur la page stats`);
    if (candidates.length === 0) this.dumpInsightsCandidates();
    for (const c of candidates) {
      console.log(`👆 [ProEng] (statistiques) essai compteur ("${(c.textContent || '').trim().slice(0, 12)}") → ouverture…`);
      const u = await this.clickAndReadLikers(c);
      if (u) {
        users = u;
        break;
      }
    }
    if (users.length === 0 && candidates.length > 0) {
      console.log('⚠️ [ProEng] Aucun candidat n\'a ouvert la liste des likers');
    }

    // Quitter la vue statistiques (X en haut à gauche) pour revenir à la grille.
    await this.closeInsightsView();
    return this.finalizeLikers(users, total, shortcode);
  }

  /**
   * Compare la liste de likers réellement collectée au compteur affiché du post
   * et marque la liste comme PARTIELLE si on en a lu nettement moins.
   *
   * Pourquoi : l'endpoint API `/likers/` d'Instagram est plafonné (~1000) et ne
   * pagine pas ; le fallback DOM est borné (~500-700). Sur un post à plusieurs
   * milliers de likes, un People réellement présent peut être absent de la liste
   * tronquée → un "pas détecté" ne veut PAS dire "n'a pas liké". Ce flag permet
   * au backend/à l'UI de ne pas transformer cette absence en certitude.
   */
  private finalizeLikers(
    users: string[],
    total: number | null,
    postId: string
  ): { users: string[]; total: number | null; truncated: boolean } {
    // Tolérance : les compteurs abrégés (ex "1.2K") et les petits décalages
    // (comptes désactivés entre le compteur et la lecture) rendent l'égalité
    // stricte trop bruyante. On ne signale que les écarts nets.
    const truncated =
      total != null && total > 0 && users.length < total * 0.9 && total - users.length > 5;
    if (truncated) {
      console.warn(
        `✂️ [ProEng] Post ${postId} : liste des likers PARTIELLE — ${users.length} lus / ${total} affichés. ` +
          'Un People absent de cette liste peut être un faux négatif.'
      );
    }
    return { users, total, truncated };
  }

  /**
   * Lit le nombre de likes AFFICHÉ sur le post (compteur de la modale), en
   * gérant les formats EN/FR et abrégés : "1,234", "1 234", "1.2K", "1,2 M".
   * Renvoie null si illisible (on ne peut alors pas juger de la troncature).
   */
  private extractLikeCount(root: HTMLElement): number | null {
    const trigger = this.findLikesTrigger(root);
    if (!trigger) return null;
    // Premier motif numérique du texte (ex: "1,234 likes", "1.2K", "1 234 j'aime").
    const m = (trigger.textContent || '').trim().match(/\d[\d.,\s]*[KkMm]?/);
    return m ? this.parseCountText(m[0]) : null;
  }

  /** Parse un compteur textuel ("1,234", "1 234", "1.2K", "1,2M") en entier. */
  private parseCountText(text: string): number | null {
    const t = text.trim().replace(/\s/g, '');
    const m = t.match(/^([\d.,]+)([KkMm])?$/);
    if (!m) return null;
    const suffix = m[2]?.toLowerCase();
    if (suffix) {
      // Abrégé : le séparateur est décimal ("1,2K" = "1.2K" = 1200).
      const val = parseFloat(m[1].replace(',', '.'));
      if (isNaN(val)) return null;
      return Math.round(val * (suffix === 'k' ? 1000 : 1_000_000));
    }
    // Exact : les séparateurs sont des milliers ("1,234" / "1.234" / "1 234").
    const digits = m[1].replace(/[.,]/g, '');
    const val = parseInt(digits, 10);
    return isNaN(val) ? null : val;
  }

  /**
   * Renvoie tous les compteurs ❤️ candidats (nombre seul près d'une icône cœur),
   * en priorisant la barre d'action ("J'aime") sur le panneau stats ("Icône J'aime").
   */
  private findLikesCounters(root: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    const icons = (Array.from(root.querySelectorAll('svg[aria-label]')) as SVGElement[]).filter((s) =>
      /like|j['’]?aime|aimer/i.test(s.getAttribute('aria-label') || '')
    );
    // "J'aime" (barre d'action, cliquable) avant "Icône J'aime" (stat).
    icons.sort((a, b) => {
      const la = (a.getAttribute('aria-label') || '').toLowerCase();
      const lb = (b.getAttribute('aria-label') || '').toLowerCase();
      const sa = /^j['’]?aime$/.test(la) ? 0 : 1;
      const sb = /^j['’]?aime$/.test(lb) ? 0 : 1;
      return sa - sb;
    });
    for (const icon of icons) {
      let node: Element | null = icon.parentElement;
      for (let lvl = 0; lvl < 4 && node; lvl++) {
        const numEl = (Array.from(
          node.querySelectorAll('span, div[role="button"], button, [role="button"], div')
        ) as HTMLElement[]).find((e) => {
          if (e.querySelector('svg')) return false;
          if (e.closest('a')) return false;
          const t = (e.textContent || '').trim();
          return /^\d[\d.,\sKkMm]*$/.test(t) && t.length > 0 && t.length <= 10;
        });
        if (numEl && !seen.has(numEl)) {
          seen.add(numEl);
          out.push(numEl);
          break;
        }
        node = node.parentElement;
      }
    }
    return out;
  }

  /**
   * Active un élément : focus + séquence pointer/mouse + click + touche Entrée.
   * (Certains handlers React ignorent .click() ; les boutons `tabindex=0`
   * réagissent souvent au clavier.)
   */
  private realClick(el: HTMLElement): void {
    const opts: any = { bubbles: true, cancelable: true, view: window };
    try {
      el.focus();
    } catch {
      /* noop */
    }
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch {
      /* PointerEvent indispo : on se rabat sur click() */
    }
    el.click();
    const key: any = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
    el.dispatchEvent(new KeyboardEvent('keydown', key));
    el.dispatchEvent(new KeyboardEvent('keyup', key));
  }

  /**
   * Diagnostic : liste dans la console les icônes (aria-label) et les nombres
   * cliquables de la page stats, pour repérer l'élément du compteur de likes.
   */
  private dumpInsightsCandidates(): void {
    const svgLabels = (Array.from(document.querySelectorAll('svg[aria-label]')) as SVGElement[])
      .map((s) => s.getAttribute('aria-label'))
      .filter(Boolean);
    console.log('🧪 [ProEng] aria-labels des icônes:', svgLabels);

    const nums = (Array.from(document.querySelectorAll('span, div, button, a')) as HTMLElement[])
      .filter((e) => /^\d{1,9}$/.test((e.textContent || '').trim()))
      .slice(0, 25)
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        text: (e.textContent || '').trim(),
        role: e.getAttribute('role'),
        cls: (e.getAttribute('class') || '').slice(0, 40),
        parentSvg: e.parentElement?.querySelector('svg[aria-label]')?.getAttribute('aria-label') || null,
      }));
    console.log('🧪 [ProEng] nombres cliquables candidats:', nums);
  }

  /** Ferme la vue statistiques (/insights/media/…) via le bouton X (ou Échap). */
  private async closeInsightsView(): Promise<void> {
    for (let i = 0; i < 4 && /\/insights\//.test(window.location.pathname); i++) {
      const x =
        (document.querySelector(
          'svg[aria-label="Close"], svg[aria-label="Fermer"]'
        )?.closest('button, [role="button"], a') as HTMLElement | null) || null;
      if (x) x.click();
      else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await this.sleep(900);
    }
  }

  /**
   * Clique le déclencheur des likes et lit la liste si une vraie modale de likers
   * s'ouvre. Renvoie les usernames, ou `null` si aucune liste ne s'est ouverte
   * (afin de tenter un autre chemin).
   */
  private async clickAndReadLikers(trigger: HTMLElement): Promise<string[] | null> {
    const before = document.querySelectorAll('div[role="dialog"]').length;

    // Le compteur "4" est souvent <span><span>4</span></span> dans un
    // <div role="button" tabindex="0">. On essaie le leaf, l'élément, son
    // bouton parent, puis les parents sans icône. Activation = clic réel +
    // touche Entrée (les boutons tabindex=0 répondent souvent au clavier).
    for (const target of this.clickTargetsFor(trigger)) {
      console.log(
        `   ↳ essai clic [${target.tagName.toLowerCase()}${target.getAttribute('role') ? ' role=' + target.getAttribute('role') : ''} tabindex=${target.getAttribute('tabindex')}] "${(target.textContent || '').trim().slice(0, 10)}"`
      );
      this.realClick(target);
      await this.sleep(1500);

      const dialog = this.findLikersDialog();
      const after = document.querySelectorAll('div[role="dialog"]').length;
      const headerOk = !!dialog && /likes|j['’]aime|mentions/i.test((dialog.textContent || '').slice(0, 120));
      console.log(`     dialogs: ${before} → ${after}, headerOk=${headerOk}`);
      if (dialog && (after > before || headerOk)) {
        const usernames = await this.scrollDialogAndCollectUsernames(dialog);
        console.log(`📋 [ProEng] Liste des likers : ${usernames.length} username(s) lus`);
        // Refermer la modale des likers.
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await this.sleep(700);
        return usernames;
      }
    }
    return null; // aucune liste de likers ne s'est ouverte
  }

  /**
   * Cibles de clic à essayer pour ouvrir la liste des likers : le span le plus
   * profond, l'élément lui-même, son lien `liked_by`/bouton, puis ses parents
   * qui NE contiennent PAS d'icône (pour éviter de cliquer le cœur = liker).
   */
  private clickTargetsFor(trigger: HTMLElement): HTMLElement[] {
    const targets: HTMLElement[] = [];
    const add = (el: HTMLElement | null | undefined) => {
      if (el && !targets.includes(el)) targets.push(el);
    };

    // Leaf : descendre tant qu'il y a un seul enfant élément de même texte.
    let leaf = trigger;
    while (
      leaf.children.length === 1 &&
      (leaf.children[0] as HTMLElement).textContent?.trim() === leaf.textContent?.trim()
    ) {
      leaf = leaf.children[0] as HTMLElement;
    }
    add(leaf);
    add(trigger);
    add(trigger.closest('a[href$="/liked_by/"], [role="button"], button') as HTMLElement | null);

    // Parents sans icône (max 3 niveaux).
    let node: HTMLElement | null = trigger.parentElement;
    for (let i = 0; i < 3 && node; i++) {
      if (!node.querySelector('svg')) add(node);
      node = node.parentElement;
    }
    return targets;
  }

  /** Parmi les modales ouvertes, choisit celle qui ressemble à la liste des likers. */
  private findLikersDialog(): HTMLElement | null {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')) as HTMLElement[];
    if (dialogs.length === 0) return null;
    let best = dialogs[dialogs.length - 1];
    let bestScore = -1;
    for (const d of dialogs) {
      const links = d.querySelectorAll('a[href^="/"]').length;
      const header = /likes|j['’]aime|mentions/i.test((d.textContent || '').slice(0, 120)) ? 100 : 0;
      const score = links + header;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  /**
   * Récupère les likers via l'API web interne d'Instagram (même origine, avec
   * la session). Aucun clic → fiable. `shortcode` = id court du post/reel
   * (ex: "DZtF4j6Sfjy"), converti en media_id numérique.
   * Renvoie les usernames (minuscules) ou null si l'API a échoué.
   */
  private async fetchLikersViaApi(shortcode: string): Promise<string[] | null> {
    try {
      const mediaId = this.shortcodeToMediaId(shortcode);
      if (!mediaId) return null;
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
      const resp = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/likers/`, {
        headers: {
          'x-ig-app-id': '936619743392459',
          ...(csrf ? { 'x-csrftoken': csrf } : {}),
        },
        credentials: 'include',
      });
      if (!resp.ok) {
        console.log(`⚠️ [ProEng] API likers HTTP ${resp.status} (fallback DOM)`);
        return null;
      }
      const data: any = await resp.json();
      if (!Array.isArray(data?.users)) return null;
      return data.users.map((u: any) => String(u.username || '').toLowerCase()).filter(Boolean);
    } catch (e) {
      console.log('⚠️ [ProEng] API likers échec (fallback DOM):', e);
      return null;
    }
  }

  /** Convertit un shortcode Instagram en media_id numérique (base64 custom). */
  private shortcodeToMediaId(shortcode: string): string | null {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    try {
      let id = 0n;
      for (const ch of shortcode) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) return null;
        id = id * 64n + BigInt(v);
      }
      return id.toString();
    } catch {
      return null;
    }
  }

  // ==================== Connexions mutuelles (API) ====================

  /** En-têtes communs pour l'API web interne. */
  private igApiHeaders(): Record<string, string> {
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
    return { 'x-ig-app-id': '936619743392459', ...(csrf ? { 'x-csrftoken': csrf } : {}) };
  }

  /** Récupère l'id numérique d'un compte depuis son username. */
  private async fetchUserId(username: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        { headers: this.igApiHeaders(), credentials: 'include' }
      );
      if (!resp.ok) return null;
      const data: any = await resp.json();
      return data?.data?.user?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Récupère les abonnements (following) d'un compte via l'API, paginé, en
   * minuscules. Plafonné par MAX_FOLLOWING_PAGES pour borner le coût.
   */
  private async fetchFollowing(userId: string): Promise<string[]> {
    const out = new Set<string>();
    let maxId = '';
    for (let page = 0; page < MAX_FOLLOWING_PAGES; page++) {
      const url =
        `https://www.instagram.com/api/v1/friendships/${userId}/following/?count=50` +
        (maxId ? `&max_id=${encodeURIComponent(maxId)}` : '');
      let data: any;
      try {
        const resp = await fetch(url, { headers: this.igApiHeaders(), credentials: 'include' });
        if (!resp.ok) {
          console.log(`⚠️ [ProEng] API following HTTP ${resp.status}`);
          break;
        }
        data = await resp.json();
      } catch (e) {
        console.log('⚠️ [ProEng] API following échec:', e);
        break;
      }
      const users = Array.isArray(data?.users) ? data.users : [];
      for (const u of users) {
        const name = String(u?.username || '').toLowerCase();
        if (name) out.add(name);
      }
      maxId = data?.next_max_id || '';
      if (!maxId || users.length === 0) break;
      await this.sleep(700 + Math.random() * 600); // délai humain entre pages
    }
    return Array.from(out);
  }

  /**
   * Pour chaque People présent (qui a interagi), calcule les connexions mutuelles
   * par rapport à l'utilisateur Pro = abonnements(personne) ∩ abonnements(Pro).
   */
  private async collectMutuals(
    presentUsernames: string[],
    ownUsername: string
  ): Promise<Array<{ username: string; count: number; members: string[] }>> {
    if (presentUsernames.length === 0) return [];

    this.overlay.show('Analyzing mutual connections…');

    // Abonnements de l'utilisateur Pro (référence), une seule fois.
    const ownId = await this.fetchUserId(ownUsername);
    if (!ownId) {
      console.log('⚠️ [ProEng] Impossible de résoudre l\'id du compte Pro — connexions mutuelles ignorées');
      return [];
    }
    const myFollowing = new Set(await this.fetchFollowing(ownId));
    console.log(`🔗 [ProEng] Abonnements du compte Pro: ${myFollowing.size}`);

    const targets = presentUsernames.slice(0, MAX_MUTUAL_PEOPLE);
    const mutuals: Array<{ username: string; count: number; members: string[] }> = [];
    for (const username of targets) {
      const id = await this.fetchUserId(username);
      if (!id) continue;
      const theirFollowing = await this.fetchFollowing(id);
      // On garde la LISTE des comptes en commun (et plus seulement le nombre),
      // bornée pour limiter la taille du payload.
      const members = theirFollowing.filter((u) => myFollowing.has(u)).slice(0, MAX_MUTUAL_MEMBERS);
      const count = theirFollowing.reduce((n, u) => (myFollowing.has(u) ? n + 1 : n), 0);
      mutuals.push({ username, count, members });
      console.log(`🔗 [ProEng] @${username} : ${count} connexion(s) mutuelle(s) (sur ${theirFollowing.length} abonnements lus)`);
      await this.sleep(800 + Math.random() * 700);
    }
    return mutuals;
  }

  /**
   * Trouve le déclencheur des likes dans `root` : lien `liked_by`, texte
   * "X likes/j'aime", ou (reels) nombre seul près de l'icône cœur.
   */
  private findLikesTrigger(root: HTMLElement): HTMLElement | null {
    // 1. Lien direct "liked_by" (posts photo).
    const likedBy = root.querySelector('a[href$="/liked_by/"]') as HTMLElement | null;
    if (likedBy) return likedBy;

    // 2. Compteur "X likes" / "X j'aime" / "X mentions J'aime" (EN/FR, toutes apostrophes).
    const likeWord = /\d[\d.,\s]*(?:likes?|j['’]?aime|mentions?|me gusta)/i;
    const candidates = Array.from(
      root.querySelectorAll('span, div[role="button"], button, [role="button"]')
    ) as HTMLElement[];
    for (const el of candidates) {
      if (el.closest('a')) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 40) continue;
      if (likeWord.test(text)) return el;
    }

    // 3. Compteur = nombre seul à côté d'une icône cœur ("J'aime" / "Icône
    //    J'aime"). On remonte depuis chaque icône cœur et on prend le premier
    //    élément dont le texte est un nombre seul (en excluant les éléments qui
    //    contiennent une icône — ce sont les boutons d'action, pas le compteur).
    const likeIcons = (Array.from(root.querySelectorAll('svg[aria-label]')) as SVGElement[]).filter((s) =>
      /like|j['’]?aime|aimer/i.test(s.getAttribute('aria-label') || '')
    );
    for (const icon of likeIcons) {
      let node: Element | null = icon.parentElement;
      for (let lvl = 0; lvl < 4 && node; lvl++) {
        const numEl = (Array.from(
          node.querySelectorAll('span, div[role="button"], button, [role="button"], div')
        ) as HTMLElement[]).find((e) => {
          if (e.querySelector('svg')) return false; // pas le bouton d'action lui-même
          if (e.closest('a')) return false;
          const t = (e.textContent || '').trim();
          return /^\d[\d.,\sKkMm]*$/.test(t) && t.length > 0 && t.length <= 10;
        });
        if (numEl) return numEl;
        node = node.parentElement;
      }
    }
    return null;
  }

  /**
   * Posts dont on est propriétaire : clique "Voir les statistiques" / "View
   * insights" pour ouvrir le panneau d'engagement (où le compteur de likes est
   * accessible). Renvoie true si l'élément a été cliqué.
   */
  private async openInsights(): Promise<boolean> {
    const candidates = Array.from(
      document.querySelectorAll('a, button, span, div[role="button"], [role="button"]')
    ) as HTMLElement[];
    const insights = candidates.find((el) => {
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 40) return false;
      return /view insights|voir les statistiques|voir les stats|view all insights/.test(t);
    });
    if (!insights) {
      console.log('⚠️ [ProEng] "Voir les statistiques / View insights" introuvable');
      return false;
    }
    const clickable = (insights.closest('a, [role="button"], button') as HTMLElement | null) || insights;
    console.log('👆 [ProEng] "Voir les statistiques" → ouverture…');
    clickable.click();
    await this.sleep(2000);
    return true;
  }

  /** Scrolle la modale des likers et collecte les usernames (profil) visibles. */
  private async scrollDialogAndCollectUsernames(dialog: HTMLElement): Promise<string[]> {
    const found = new Set<string>();
    const ignored = new Set(['explore', 'p', 'reel', 'reels', 'stories', 'direct', 'accounts']);
    const scroller =
      (dialog.querySelector('div._aano, div[style*="overflow"]') as HTMLElement | null) || dialog;

    let stuck = 0;
    let prev = -1;
    for (let i = 0; i < 60 && stuck < 5; i++) {
      for (const a of Array.from(dialog.querySelectorAll('a[href^="/"]'))) {
        const m = (a.getAttribute('href') || '').match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (m && !ignored.has(m[1].toLowerCase())) found.add(m[1].toLowerCase());
      }
      stuck = found.size === prev ? stuck + 1 : 0;
      prev = found.size;

      scroller.scrollTop = scroller.scrollHeight;
      await this.sleep(500 + Math.random() * 400);
    }
    return Array.from(found);
  }

  // ==================== Envoi backend ====================

  private async finish(
    collected: Record<string, CollectedPerson>,
    analyzedPosts: string[],
    engagers: Array<{ username: string; posts: number; liked: boolean; commented: boolean }>,
    mutuals: Array<{ username: string; count: number; members: string[] }>,
    ownUsername: string,
    partialLikePosts: string[]
  ): Promise<void> {
    this.overlay.show('Updating stats…');
    const postsAnalyzed = analyzedPosts.length;

    const engagements = Object.entries(collected).map(([username, data]) => ({
      username,
      likedPosts: data.likedPosts,
      comments: data.comments,
    }));

    await this.setState({ phase: 'done' });

    if (engagements.length === 0 && engagers.length === 0 && mutuals.length === 0) {
      this.overlay.showSuccess(`Analysis complete — no interaction detected across ${postsAnalyzed} posts`);
      await this.clearState();
      return;
    }

    try {
      const resp = (await chrome.runtime.sendMessage({
        type: 'SYNC_PRO_ENGAGEMENT',
        engagements,
        analyzedPosts,
        engagers,
        mutuals,
        // Posts dont la liste des likers était tronquée (plafond IG) : le backend
        // ne doit pas en déduire qu'une People "n'a pas liké" avec certitude.
        partialLikePosts,
        // Compte RÉELLEMENT analysé (profil scanné) → le backend attribue
        // l'engagement à ce compte, pas au compte actif de la session.
        ownUsername,
      })) as any;
      if (resp?.success) {
        const totalLikes = engagements.reduce((s, e) => s + e.likedPosts.length, 0);
        const totalComments = engagements.reduce((s, e) => s + e.comments.length, 0);
        const partialNote =
          partialLikePosts.length > 0 ? ` (${partialLikePosts.length} post(s) à liste partielle)` : '';
        this.overlay.showSuccess(
          `Analysis complete! ${totalLikes} like(s) + ${totalComments} comment(s) across ${postsAnalyzed} posts · ${engagers.length} suggestion(s)${partialNote}`
        );
      } else {
        this.overlay.showError(`Save failed: ${resp?.error || 'unknown'}`);
      }
    } catch (e) {
      console.error('❌ [ProEng] Envoi backend échoué:', e);
      this.overlay.showError('Failed to send data to the server');
    }

    await this.clearState();
  }

  // ==================== Helpers ====================

  private isOnOwnProfile(ownUsername: string): boolean {
    const p = window.location.pathname.replace(/\/$/, '');
    return p === `/${ownUsername}`;
  }

  private isOnPostPage(): boolean {
    // Instagram redirige /reel/{id}/ vers /reels/{id}/ (pluriel) → accepter les deux.
    return /\/(p|reel|reels)\/[^/]+/.test(window.location.pathname);
  }

  private extractPostId(url: string): string {
    const m = url.match(/\/(?:p|reel|reels)\/([^/]+)/);
    return m ? m[1] : url;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
