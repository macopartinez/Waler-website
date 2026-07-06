/**
 * DM Thread Scroller
 *
 * Scrolle un thread de conversation Instagram VERS LE HAUT pour charger tout
 * l'historique, en extrayant les messages au fil du scroll (la liste est
 * virtualisée). Adapté de la logique "humaine" d'InstagramModalScroller.
 */

import { DMMessageExtractor, type ExtractedMessage } from './dm-message-extractor.js';

/**
 * Marqueur d'une LIGNE de conversation de la sidebar inbox (IG 2024+ :
 * `div[role="button"][aria-haspopup="dialog"]`, plus aucun lien `/direct/t/`).
 *
 * Sur desktop, `/direct/t/<id>` affiche DEUX colonnes : la sidebar inbox (à
 * gauche) ET le thread (à droite). Les lignes de la sidebar contiennent aussi
 * des `span[dir="auto"]` (l'aperçu du dernier message) : sans exclusion, le
 * scroller prend la sidebar pour le thread et « extrait » ces aperçus comme des
 * messages. On exclut donc tout conteneur qui renferme ce marqueur.
 */
const INBOX_ROW_MARKER = 'div[role="button"][aria-haspopup="dialog"]';

export interface ThreadScrollOptions {
  maxStuckAttempts?: number;
  scrollDelay?: number;
  onProgress?: (count: number) => void;
  /**
   * Clés (`messageId`) de l'historique déjà enregistré. Si fournies, le scroll
   * s'arrête dès qu'il recroise l'un de ces messages (frontière de l'historique)
   * au lieu de remonter jusqu'au tout début → analyse incrémentale. Vide/absent
   * = première analyse → scroll complet jusqu'au début de la conversation.
   */
  knownKeys?: Set<string>;
  /** Interruption coopérative : si fourni et renvoie true, le scroll s'arrête
   *  proprement (bouton d'arrêt global). Vérifié à chaque itération. */
  shouldStop?: () => boolean;
}

export class DMThreadScroller {
  private extractor = new DMMessageExtractor();
  private maxStuckAttempts: number;
  private scrollDelay: number;
  private onProgress?: (count: number) => void;
  private knownKeys?: Set<string>;
  private shouldStop?: () => boolean;

  /** Reçu de lecture (« Vu ») détecté sous le dernier message envoyé. */
  public lastSeenDetected = false;

  /** Vrai si le scroll s'est arrêté en rejoignant l'historique déjà enregistré. */
  public reachedKnownHistory = false;

  constructor(options: ThreadScrollOptions = {}) {
    this.maxStuckAttempts = options.maxStuckAttempts ?? 6;
    this.scrollDelay = options.scrollDelay ?? 300;
    this.onProgress = options.onProgress;
    this.knownKeys = options.knownKeys && options.knownKeys.size > 0 ? options.knownKeys : undefined;
    this.shouldStop = options.shouldStop;
  }

  /** Vrai si l'on a rejoint la frontière de l'historique déjà enregistré. */
  private reachedBoundary(): boolean {
    return !!this.knownKeys && this.extractor.hasAny(this.knownKeys);
  }

  /**
   * Collecte tous les messages du thread ouvert.
   *
   * - Conversation courte (non scrollable) : tout est rendu → extraction directe.
   * - Conversation longue : selon `opts.manual`, soit l'utilisateur scrolle et on
   *   capture en direct (`captureManually`), soit on auto-scrolle (`autoScroll`).
   */
  async collect(
    opts: {
      manual?: boolean;
      isFinishRequested?: () => boolean;
      onStatus?: (info: { count: number; atStart: boolean }) => void;
    } = {}
  ): Promise<ExtractedMessage[]> {
    // Juste après l'ouverture du thread, la grille de messages n'est pas encore
    // rendue : on attend (avec essais) qu'elle apparaisse avant d'abandonner.
    let container = await this.waitForThreadContainer();
    if (!container) {
      throw new Error('Conteneur du thread DM introuvable');
    }

    // VÉRIFICATION (inspirée du scroller du modal followers) : certains éléments
    // rapportent un overflow sans être le VRAI viewport qui défile. On teste que
    // toucher `scrollTop` déplace réellement le contenu ; sinon on cherche, parmi
    // les conteneurs du thread, celui qui RÉPOND vraiment au scroll.
    container = this.verifyOrFindScroller(container);
    const cr = container.getBoundingClientRect();
    console.log(
      `🧭 [Pro] Conteneur de scroll : scrollTop=${Math.round(container.scrollTop)} ` +
        `sh=${container.scrollHeight} ch=${container.clientHeight} répond=${this.respondsToScroll(container)} ` +
        `x=${Math.round(cr.left)} w=${Math.round(cr.width)} estInbox=${this.isInboxColumn(container)}`
    );

    // `container` = liste scrollable du thread = le bon périmètre de messages.
    // Les tout premiers messages ne sont pas « ailleurs » : ils ne sont simplement
    // PAS rendus quand on est en bas (virtualisation) → on les charge en scrollant.
    const dirCenterX = this.threadCenterX(container);

    this.extractor.reset();

    // Extraction initiale (messages les plus récents, en bas). Le reçu de lecture
    // (« Vu ») n'est visible qu'ici. On STABILISE : IG rend les bulles
    // progressivement → une extraction unique trop précoce en manque.
    await this.settleExtract(container, dirCenterX);
    this.lastSeenDetected = this.extractor.detectSeenReceipt(container);
    this.onProgress?.(this.extractor.size);

    // Incrémental : si dès le bas on retrouve un message déjà enregistré, rien de
    // neuf depuis la dernière analyse → inutile de remonter.
    if (this.reachedBoundary()) {
      this.reachedKnownHistory = true;
      const all = this.extractor.getAll();
      console.log(`🏁 [Pro] Historique déjà enregistré rejoint (sans scroll) : ${all.length} nouveaux messages visibles`);
      return all;
    }

    // Conversation courte NON scrollable : tout est rendu, rien à remonter.
    if (!this.isScrollable(container)) {
      const all = this.extractor.getAll();
      console.log(`✅ [Pro] Conversation extraite (sans scroll) : ${all.length} messages`);
      return all;
    }

    // Conversation longue : capture manuelle (l'utilisateur scrolle) ou auto-scroll.
    if (opts.manual) {
      return this.captureManually(container, dirCenterX, opts.isFinishRequested, opts.onStatus);
    }
    return this.autoScroll(container, dirCenterX);
  }

  /**
   * Capture pilotée par l'utilisateur : il fait défiler le thread vers le haut et
   * on extrait en direct à chaque scroll (+ rafraîchissement périodique). Robuste
   * face à la virtualisation : chaque bulle finit par être rendue sous ses yeux.
   * Se termine quand : la frontière de l'historique est rejointe, OU la carte de
   * début est visible et l'utilisateur s'arrête (~1,2 s), OU « Terminer » cliqué,
   * OU délai de sécurité (5 min).
   */
  private async captureManually(
    container: HTMLElement,
    dirCenterX: number,
    isFinishRequested?: () => boolean,
    onStatus?: (info: { count: number; atStart: boolean }) => void
  ): Promise<ExtractedMessage[]> {
    let sampling = false;
    let lastActivity = Date.now();

    const sample = async (): Promise<void> => {
      if (sampling) return;
      sampling = true;
      try {
        await this.extractor.expandVoiceTranscripts(container);
        this.extractor.extractVisible(container, dirCenterX);
        this.onProgress?.(this.extractor.size);
        if (this.reachedBoundary()) this.reachedKnownHistory = true;
      } finally {
        sampling = false;
      }
    };

    const onScroll = () => {
      lastActivity = Date.now();
      void sample();
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    console.log('🖐️ [Pro] Capture manuelle : en attente du scroll utilisateur…');

    const deadline = Date.now() + 5 * 60 * 1000; // sécurité 5 min
    try {
      while (Date.now() < deadline) {
        await this.sleep(400);
        await sample(); // capture périodique (les events de scroll peuvent manquer)

        // Informer l'UI : a-t-on atteint le début ? (guide l'utilisateur : ne pas
        // arrêter avant d'y être, sinon les premiers messages manquent).
        const atStart = this.isConversationStartVisible(container) && container.scrollTop <= 40;
        onStatus?.({ count: this.extractor.size, atStart });

        if (this.reachedKnownHistory) {
          console.log('🏁 [Pro] Historique déjà enregistré rejoint pendant la capture manuelle.');
          break;
        }
        if (isFinishRequested?.()) {
          console.log('🏁 [Pro] Capture manuelle terminée par l\'utilisateur.');
          break;
        }
        // Auto-fin : carte de début réellement visible, en haut, utilisateur idle.
        const idle = Date.now() - lastActivity > 1200;
        if (atStart && idle) {
          console.log('🏁 [Pro] Début de la conversation atteint (capture manuelle).');
          break;
        }
      }
    } finally {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    }

    // Capture finale : plusieurs passes sur la vue courante (haut du fil) pour
    // ramasser les tout premiers messages même si l'utilisateur s'arrête net.
    for (let i = 0; i < 4; i++) {
      await sample();
      await this.sleep(250);
    }

    const all = this.extractor.getAll();
    console.log(`✅ [Pro] Conversation extraite (manuel) : ${all.length} messages`);
    return all;
  }

  /**
   * Déplie les transcriptions vocales visibles puis extrait. Si des transcriptions
   * ont été ouvertes, on attend leur rendu (IG les calcule à la volée) et on
   * ré-extrait pour capter le texte du vocal — clé d'identité = durée, donc le
   * placeholder est mis à niveau sans doublon.
   */
  private async expandAndExtract(container: HTMLElement, dirCenterX: number): Promise<void> {
    const opened = await this.extractor.expandVoiceTranscripts(container);
    this.extractor.extractVisible(container, dirCenterX);
    // Si on a ouvert des transcriptions, leur rendu est différé (IG les calcule à
    // la volée) : on PATIENTE et on ré-extrait plusieurs fois pour capter le texte
    // du vocal (la clé « durée » met à niveau le placeholder, sans doublon).
    if (opened > 0) {
      for (let i = 0; i < 4; i++) {
        await this.sleep(450);
        await this.extractor.expandVoiceTranscripts(container); // déplier d'éventuels nouveaux
        this.extractor.extractVisible(container, dirCenterX);
      }
    }
    this.onProgress?.(this.extractor.size);
  }

  /** Auto-scroll AUTONOME vers le haut jusqu'au début (ou frontière de l'historique). */
  private async autoScroll(container: HTMLElement, dirCenterX: number): Promise<ExtractedMessage[]> {
    let stuck = 0;
    let attempts = 0;

    while (stuck < this.maxStuckAttempts) {
      // Arrêt global demandé → on rend ce qui a été collecté jusqu'ici.
      if (this.shouldStop?.()) {
        console.log('⏹ [Pro] Scroll interrompu (arrêt global).');
        break;
      }
      attempts++;
      const before = this.extractor.size;
      const beforeHeight = container.scrollHeight;

      await this.humanScrollUp(container);

      // Laisser charger les messages plus anciens (lazy loading).
      const grew = await this.waitForLoad(container, beforeHeight);

      await this.expandAndExtract(container, dirCenterX);

      // Arrêt incrémental : on vient de recroiser un message déjà enregistré.
      if (this.reachedBoundary()) {
        this.reachedKnownHistory = true;
        console.log('🏁 [Pro] Frontière de l\'historique enregistré atteinte — arrêt du scroll.');
        break;
      }

      // Arrêt fiable : la carte profil de début est réellement visible.
      if (this.isConversationStartVisible(container)) {
        console.log('🏁 [Pro] Début de la conversation atteint (carte profil visible).');
        break;
      }

      // Progrès = nouveaux messages OU nouveau contenu chargé. Sinon, on force le
      // saut au plus ancien (déclenche le lazy-load) et on confirme la fin sur
      // plusieurs paliers stuck. Terminaison INDÉPENDANTE de scrollTop (qui peut
      // être inopérant si la liste se pilote au wheel).
      if (this.extractor.size > before || grew) {
        stuck = 0;
      } else {
        const forcedGrew = await this.forceTopLoad(container, beforeHeight);
        await this.expandAndExtract(container, dirCenterX);
        if (forcedGrew || this.extractor.size > before) stuck = 0;
        else stuck++;
      }

      if (attempts > 300) {
        console.warn('⚠️ [Pro] Limite de 300 scrolls atteinte dans le thread.');
        break;
      }
    }

    // Capture finale au sommet : quelques passes pour ramasser les tout premiers
    // messages + déplier un dernier vocal éventuel.
    for (let i = 0; i < 3; i++) {
      await this.expandAndExtract(container, dirCenterX);
      await this.sleep(250);
    }

    const all = this.extractor.getAll();
    console.log(`✅ [Pro] Conversation extraite : ${all.length} messages`);
    return all;
  }

  /**
   * Ré-extrait en boucle courte jusqu'à stabilisation du nombre de messages.
   * Juste après l'ouverture/au chargement d'un palier, IG rend les bulles
   * progressivement : une extraction unique trop précoce en manque. On déplie les
   * transcriptions et on ré-extrait (à la passe donnée) tant que le total monte,
   * puis on s'arrête après 2 tours stables consécutifs (ou un plafond de tours).
   */
  private async settleExtract(scope: HTMLElement, centerX?: number): Promise<void> {
    let stableRounds = 0;
    for (let i = 0; i < 8 && stableRounds < 2; i++) {
      const before = this.extractor.size;
      await this.extractor.expandVoiceTranscripts(scope);
      this.extractor.extractVisible(scope, centerX);
      this.onProgress?.(this.extractor.size);
      if (this.extractor.size === before) stableRounds++;
      else stableRounds = 0;
      await this.sleep(250);
    }
  }

  /** Centre horizontal de la COLONNE du thread (réf. du sens MOI/LUI). */
  private threadCenterX(scrollContainer: HTMLElement): number {
    const r = scrollContainer.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  // ==================== Conteneur ====================

  /** Attend que la grille de messages du thread soit rendue (jusqu'à ~10 s). */
  private async waitForThreadContainer(): Promise<HTMLElement | null> {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const container = this.findThreadContainer();
      // On exige un conteneur contenant déjà au moins un message rendu, pour ne
      // pas démarrer sur une grille vide encore en cours de chargement.
      if (container && container.querySelector('div[role="row"], span[dir="auto"]')) {
        return container;
      }
      await this.sleep(400);
    }
    // Dernier recours : ce qu'on a, même imparfait (peut être null).
    return this.findThreadContainer();
  }

  private findThreadContainer(): HTMLElement | null {
    const main = (document.querySelector('main') || document.body) as HTMLElement;

    // Conteneurs scrollables porteurs de texte (messages OU aperçus inbox).
    const scrollables = (Array.from(main.querySelectorAll('div, ul')) as HTMLElement[]).filter(
      (d) => this.isScrollable(d) && !!d.querySelector('span[dir="auto"], div[role="row"]')
    );

    // Stratégie 1 (FIABLE) : le composer (champ de saisie) est unique au panneau
    // du thread. La liste des messages est dans la MÊME colonne horizontale que
    // lui. On prend donc le scrollable dont la bande horizontale contient le
    // centre du composer → impossible de retomber sur la sidebar inbox (autre
    // colonne). Diag terrain : composer x≈458 ⊂ thread [392..1521], pas inbox
    // [72..391]. (Le marqueur aria-haspopup s'est révélé non fiable : les lignes
    // d'inbox sont rendues hors du viewport scrollable de la sidebar.)
    const composer = this.findComposer();
    if (composer) {
      const cr = composer.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const sameCol = scrollables
        .filter((d) => {
          const r = d.getBoundingClientRect();
          return cx >= r.left && cx <= r.right;
        })
        .sort((a, b) => b.scrollHeight - a.scrollHeight);
      if (sameCol[0]) return sameCol[0];

      // 1b. Conversation courte (non scrollable) : pas de scrollable dans la
      // colonne du composer → renvoyer le plus petit ancêtre du composer qui
      // contient déjà des bulles de message (reste dans le panneau du thread).
      let node: HTMLElement | null = composer.parentElement;
      while (node && node !== document.body) {
        if (node.querySelector('span[dir="auto"]')) return node;
        node = node.parentElement;
      }
    }

    // Stratégie 2 (repli sans composer) : grille de messages explicite scrollable.
    const grid = (Array.from(document.querySelectorAll('div[role="grid"]')) as HTMLElement[]).find(
      (g) => this.isScrollable(g)
    );
    if (grid) return grid;

    // Stratégie 3 (repli géométrique) : le thread est la colonne LARGE, la sidebar
    // inbox est étroite (~320px). On prend le scrollable porteur de texte le plus
    // LARGE — jamais la colonne inbox étroite.
    const widest = [...scrollables].sort(
      (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width
    );
    if (widest[0]) return widest[0];

    return null;
  }

  /** Champ de saisie du message (unique au panneau du thread). */
  private findComposer(): HTMLElement | null {
    return document.querySelector(
      'div[role="textbox"], textarea, [contenteditable="true"]'
    ) as HTMLElement | null;
  }

  /**
   * Vrai si l'élément appartient à la colonne SIDEBAR inbox (≠ thread). Détection
   * fiable par GÉOMÉTRIE : la sidebar est la colonne qui ne contient PAS le
   * composer horizontalement et se trouve à sa gauche. (Le marqueur DOM
   * `aria-haspopup` s'est révélé non fiable — lignes rendues hors du viewport.)
   * Repli sans composer : présence du marqueur de ligne d'inbox.
   */
  private isInboxColumn(el: HTMLElement): boolean {
    const composer = this.findComposer();
    if (!composer) {
      return el.matches(INBOX_ROW_MARKER) || !!el.querySelector(INBOX_ROW_MARKER);
    }
    const cr = composer.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const r = el.getBoundingClientRect();
    const containsComposerX = cx >= r.left && cx <= r.right;
    return !containsComposerX && r.left < cx; // colonne à gauche, hors composer
  }

  private isScrollable(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 10;
  }

  /**
   * Teste si un élément RÉPOND réellement à une modification de `scrollTop` (= c'est
   * le vrai viewport qui défile). On déplace de quelques pixels dans une direction
   * possible puis on restaure. Évite de choisir un conteneur qui « a un overflow »
   * mais ne défile pas (cas fréquent dans le DOM imbriqué d'Instagram).
   */
  private respondsToScroll(el: HTMLElement): boolean {
    if (el.scrollHeight <= el.clientHeight + 4) return false;
    const before = el.scrollTop;
    // Tester LES DEUX sens : la liste DM est en `column-reverse` (scrollTop=0 = bas
    // = messages récents ; les anciens sont en scrollTop NÉGATIF). À scrollTop=0,
    // seul le sens négatif répond.
    for (const delta of [-10, 10]) {
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
   * Garantit un conteneur qui défile vraiment au `scrollTop`. Stratégie : partir
   * d'une BULLE de message et remonter ses ANCÊTRES — le vrai viewport est l'un
   * d'eux. Repli : tout div du main qui répond ; puis `document.scrollingElement`.
   * Si rien ne répond à `scrollTop`, on garde le conteneur initial (le scroll se
   * fera alors par événements `wheel`, cf. `humanScrollUp`).
   */
  private verifyOrFindScroller(container: HTMLElement): HTMLElement {
    if (this.respondsToScroll(container)) return container;

    const main = (document.querySelector('main') || document.body) as HTMLElement;

    // 1) Remonter depuis une bulle de message (hors lignes d'inbox), en
    //    s'arrêtant avant un ancêtre qui engloberait la sidebar inbox.
    const msg = (Array.from(main.querySelectorAll('span[dir="auto"], div[dir="auto"]')) as HTMLElement[]).find(
      (el) => !el.closest(INBOX_ROW_MARKER) && (el.textContent || '').trim()
    );
    let node: HTMLElement | null = msg || null;
    while (node && node !== document.body) {
      if (this.isInboxColumn(node)) break; // ne pas retenir la sidebar
      if (this.respondsToScroll(node)) {
        console.log('🧭 [Pro] Scroller trouvé en remontant depuis un message.');
        return node;
      }
      node = node.parentElement;
    }

    // 2) N'importe quel div du main qui répond (du plus grand au plus petit),
    //    en excluant la colonne inbox.
    const divs = (Array.from(main.querySelectorAll('div')) as HTMLElement[]).sort(
      (a, b) => b.scrollHeight - a.scrollHeight
    );
    for (const d of divs) {
      if (this.isInboxColumn(d)) continue;
      if (this.respondsToScroll(d)) {
        console.log('🧭 [Pro] Scroller trouvé parmi les divs du main.');
        return d;
      }
    }

    // 3) L'élément de défilement du document.
    const se = document.scrollingElement as HTMLElement | null;
    if (se && this.respondsToScroll(se)) return se;

    // Diagnostic : aucun élément ne répond à scrollTop → on logguera la chaîne
    // d'ancêtres et on passera par les événements wheel.
    this.logAncestorScrollChain(msg || container);
    return container;
  }

  /** Diagnostic une fois : overflow/scroll de la chaîne d'ancêtres d'un message. */
  private logAncestorScrollChain(start: HTMLElement): void {
    let node: HTMLElement | null = start;
    const lines: string[] = [];
    for (let i = 0; i < 10 && node && node !== document.body; i++) {
      const s = window.getComputedStyle(node);
      lines.push(
        `[${i}] <${node.tagName.toLowerCase()}> oy=${s.overflowY} flex=${s.flexDirection} ` +
          `sh=${node.scrollHeight} ch=${node.clientHeight} top=${Math.round(node.scrollTop)} resp=${this.respondsToScroll(node)}`
      );
      node = node.parentElement;
    }
    console.log('🔬 [Pro] Chaîne d\'ancêtres (scroll) :\n' + lines.join('\n'));
  }

  /**
   * Vrai si la carte profil de DÉBUT de conversation est visible dans le
   * conteneur. Tout en haut du thread, IG affiche un bloc « présentation du
   * contact » : avatar centré, nom, sous-titre « <username> · Instagram » et un
   * bouton « Voir le profil » / « View profile ». Ce bloc n'existe qu'au premier
   * message : sa présence à l'écran prouve qu'on a remonté toute la conversation.
   *
   * On distingue ce bloc de la barre d'en-tête (toujours visible) via deux
   * marqueurs qui n'apparaissent QUE dans la carte de début : le sous-titre
   * « · Instagram » et le bouton « Voir le profil ».
   */
  private isConversationStartVisible(container: HTMLElement): boolean {
    const labelRe = /voir le profil|voir profil|view profile/i;
    const subtitleRe = /^[a-z0-9._]{1,40}\s*·\s*instagram$/i;

    // IMPORTANT : la carte profil reste dans le DOM même quand on est tout en bas
    // (en-tête de liste persistant) → on exige qu'elle soit RÉELLEMENT dans le
    // viewport de la liste (son centre vertical entre le haut et le bas visibles),
    // sinon faux positif « on est au début » alors qu'on est en bas.
    const cRect = container.getBoundingClientRect();
    const nodes = Array.from(
      container.querySelectorAll('a, button, [role="button"], span, div')
    ) as HTMLElement[];
    for (const el of nodes) {
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 40) continue; // feuilles / libellés courts
      const label = el.getAttribute('aria-label') || '';
      if (labelRe.test(txt) || labelRe.test(label) || subtitleRe.test(txt.toLowerCase())) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const centerY = r.top + r.height / 2;
        if (centerY >= cRect.top && centerY <= cRect.bottom) return true;
      }
    }
    return false;
  }

  // ==================== Scroll ====================

  private scrollDiagLogged = 0;

  /**
   * Scrolle vers le HAUT (messages plus anciens) de façon progressive. « Vers le
   * haut » = décrémenter `scrollTop` (vrai en liste normale ET en `column-reverse`).
   * Si `scrollTop` est inopérant (liste pilotée au wheel), on dispatch des
   * événements `wheel` — ce que fait la molette de l'utilisateur.
   */
  private async humanScrollUp(container: HTMLElement): Promise<void> {
    const before = container.scrollTop;
    const amount = Math.round(300 + Math.random() * 200); // 300-500px
    const steps = 5 + Math.floor(Math.random() * 5);
    const stepSize = amount / steps;
    const stepDelay = 16 + Math.floor(Math.random() * 20);

    for (let i = 0; i < steps; i++) {
      container.scrollTop -= stepSize;
      await this.sleep(stepDelay);
    }
    await this.sleep(this.scrollDelay + Math.random() * 250);

    // `scrollTop` sans effet (React le re-pingle) → VRAI défilement via
    // `scrollIntoView` sur la bulle du haut. Un `WheelEvent` scripté ne défile
    // PAS un conteneur (non *trusted*) ; on le garde en complément au cas où un
    // handler JS d'Instagram y réagirait, mais c'est `scrollIntoView` qui bouge.
    if (Math.abs(container.scrollTop - before) < 2) {
      const moved = this.scrollUpViaIntoView(container);
      this.wheelUp(container, amount);
      await this.sleep(this.scrollDelay);
      if (this.scrollDiagLogged < 3) {
        this.scrollDiagLogged++;
        console.warn(
          `⚠️ [Pro] scrollTop inopérant → scrollIntoView (bulle du haut)` +
            `${moved ? '' : ' [aucune bulle trouvée]'} + wheel.`
        );
      }
    }
  }

  /**
   * Repli RÉEL de défilement vers le haut : amène la bulle la plus HAUTE encore
   * rendue au centre du viewport via `scrollIntoView`, ce qui fait physiquement
   * défiler le vrai conteneur (contrairement à un `WheelEvent` scripté) et force
   * la virtualisation d'Instagram à charger les messages plus anciens.
   * Renvoie false si aucune bulle n'a été trouvée.
   */
  private scrollUpViaIntoView(container: HTMLElement): boolean {
    const bubbles = Array.from(
      container.querySelectorAll('div[role="row"], span[dir="auto"], div[dir="auto"]')
    ) as HTMLElement[];
    let topMost: HTMLElement | null = null;
    let minTop = Infinity;
    for (const b of bubbles) {
      if (!(b.textContent || '').trim()) continue;
      const r = b.getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.top < minTop) {
        minTop = r.top;
        topMost = b;
      }
    }
    if (!topMost) return false;
    topMost.scrollIntoView({ block: 'center' });
    return true;
  }

  /** Émet des événements `wheel` vers le haut (repli quand `scrollTop` n'agit pas). */
  private wheelUp(container: HTMLElement, amount: number): void {
    const opts: WheelEventInit = {
      deltaY: -Math.abs(amount),
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    // Sur le conteneur ET sur une bulle visible (le handler peut être sur l'un ou
    // l'autre selon l'implémentation virtualisée d'Instagram).
    container.dispatchEvent(new WheelEvent('wheel', opts));
    const target = container.querySelector('span[dir="auto"], div[role="row"]') as HTMLElement | null;
    target?.dispatchEvent(new WheelEvent('wheel', opts));
  }

  /**
   * Attend le chargement des messages plus anciens après un scroll vers le haut.
   * Renvoie true si du contenu a été chargé (hauteur accrue). Stratégie :
   *  - tant qu'un spinner de chargement est présent, on patiente (jusqu'à 6 s) ;
   *  - sinon, on accorde un court délai de grâce (la hauteur peut grandir sans
   *    spinner visible) avant de conclure qu'il n'y a plus rien à charger.
   */
  private async waitForLoad(container: HTMLElement, beforeHeight: number): Promise<boolean> {
    const deadline = Date.now() + 6000;
    const graceUntil = Date.now() + 1200;
    while (Date.now() < deadline) {
      await this.sleep(120);
      if (container.scrollHeight > beforeHeight + 4) {
        await this.sleep(200); // laisser le rendu se stabiliser
        return true;
      }
      // Pas de spinner et délai de grâce écoulé sans croissance → rien à charger.
      if (!this.isLoadingOlder(container) && Date.now() > graceUntil) return false;
    }
    return container.scrollHeight > beforeHeight + 4;
  }

  /**
   * Force le conteneur tout en haut pour déclencher le chargement paresseux des
   * messages les plus anciens, puis attend ce chargement. Utilisé quand un palier
   * de scroll n'a rien ajouté alors qu'on n'est pas encore au sommet (lazy-load en
   * retard) — évite d'abandonner avant le tout début de la conversation.
   */
  private async forceTopLoad(container: HTMLElement, beforeHeight: number): Promise<boolean> {
    // Sauter au plus ANCIEN dans les deux modèles : en liste normale scrollTop se
    // cale à 0 (haut), en `column-reverse` à -(scrollHeight-clientHeight) (anciens).
    container.scrollTop = -container.scrollHeight;
    // Repli molette (forte poussée vers le haut) si scrollTop est inopérant.
    this.wheelUp(container, 1200);
    await this.sleep(this.scrollDelay);
    return this.waitForLoad(container, beforeHeight);
  }

  /** Détecte le spinner de chargement des anciens messages (haut du thread). */
  private isLoadingOlder(container: HTMLElement): boolean {
    const spinner = container.querySelector(
      '[role="progressbar"], [aria-label*="Loading" i], [aria-label*="Chargement" i], ' +
        'svg[aria-label*="Loading" i], svg[aria-label*="Chargement" i]'
    ) as HTMLElement | null;
    if (!spinner) return false;
    const r = spinner.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    // Spinner visible, situé dans la moitié haute du conteneur (chargement amont).
    return r.width > 0 && r.height > 0 && r.top < cr.top + cr.height / 2;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
