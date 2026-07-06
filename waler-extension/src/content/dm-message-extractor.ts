/**
 * DM Message Extractor
 *
 * Extrait les messages d'un thread de conversation Instagram (/direct/t/...).
 * Instagram virtualise la liste : les messages hors-écran sont retirés du DOM
 * pendant le scroll. On extrait donc au fil du scroll et on déduplique via une
 * clé de contenu (timestamp + direction + texte).
 *
 * Direction (envoyé / reçu) : Instagram aligne les messages envoyés à droite et
 * les messages reçus à gauche. On la déduit de la position horizontale de la
 * bulle par rapport au centre du conteneur.
 */

/** Placeholder d'un vocal détecté mais pas encore transcrit (transcription
 *  POSSIBLE — bouton « Voir la transcription » présent — sera complété au scroll). */
export const VOICE_PLACEHOLDER = '[voice message]';

/** Placeholder d'un vocal NON transcriptible : Instagram n'offre plus de
 *  transcription pour les messages anciens (aucun bouton « Voir la
 *  transcription »). On l'indique explicitement à l'utilisateur. */
export const VOICE_NO_TRANSCRIPT = '[voice message — transcription unavailable (too old)]';

/**
 * Nature de la bulle. Au-delà du texte/vocal, Instagram affiche un LABEL de
 * contexte quand un message est une RÉPONSE à une story ou à un reel (« A répondu
 * à votre story » / « Replied to your reel »…). On les distingue car ce sont deux
 * signaux d'engagement entrant forts (cf. ConversationDynamics). Absent = texte.
 */
export type MessageKind = 'text' | 'voice' | 'story-reply' | 'reel-reply';

// Labels de contexte « a répondu à une story / un reel » (FR/EN, accents retirés
// par normSep). On exige un verbe de réponse/partage PROCHE du mot story/reel
// pour ne pas déclencher sur un message qui contiendrait juste « story ».
const STORY_REPLY_RE = /(repondu|replied|reply)\b.{0,24}\b(story|stories|storie)\b/;
const REEL_REPLY_RE = /(repondu|replied|reply|envoye|partage|sent|shared)\b.{0,24}\b(reel|reels)\b/;

export interface ExtractedMessage {
  messageId: string;
  text: string;
  isSent: boolean;
  timestamp: number | null;
  reactions: string[];
  /**
   * Nature de la bulle (texte par défaut). `story-reply` / `reel-reply` marquent
   * une réponse à une story / un reel — comptée comme signal d'engagement.
   */
  kind?: MessageKind;
  /**
   * Rang chronologique dérivé du DOM (plus petit = plus ancien). Fiable même
   * sans horodatage exact : voir `extractVisible`. Interne au tri.
   */
  order: number;
}

export class DMMessageExtractor {
  private cache = new Map<string, ExtractedMessage>();

  /** Vide le cache (nouveau thread). */
  reset(): void {
    this.cache.clear();
  }

  /** Nombre de messages uniques collectés jusqu'ici. */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Vrai si au moins une des clés fournies a déjà été collectée. Sert au scroll
   * incrémental : ces clés sont les `messageId` de l'historique déjà enregistré
   * (identiques aux clés de dédup) ; en recroiser une signifie qu'on a rejoint
   * la frontière de l'historique → inutile de remonter plus haut.
   */
  hasAny(keys: Set<string>): boolean {
    for (const k of this.cache.keys()) {
      if (keys.has(k)) return true;
    }
    return false;
  }

  /**
   * Extrait les messages actuellement visibles et les ajoute au cache (dédup par
   * clé de contenu). Renvoie le nombre de NOUVEAUX messages ajoutés.
   *
   * Ordre chronologique robuste par **position verticale absolue** dans le contenu
   * scrollable : `order = scrollTop + (haut de la bulle − haut du conteneur)`. Le
   * haut du contenu = le plus ancien → `order` croissant = ancien → récent. Stable
   * quel que soit le moment de capture et robuste au lazy-load (les anciens
   * messages chargés en haut obtiennent toujours un `order` plus petit). Vaut pour
   * l'auto-scroll comme pour le scroll manuel.
   *
   * On n'extrait QUE les bulles réellement à l'écran : hors-écran, la géométrie
   * (donc le sens MOI/LUI et la position) n'est pas fiable. Comme l'utilisateur
   * scrolle sur toute la conversation, chaque bulle est captée quand elle passe à
   * l'écran. `centerX` = centre de la colonne du thread pour le sens MOI/LUI.
   */
  extractVisible(container: HTMLElement, centerX?: number): number {
    const rows = this.findMessageRows(container);
    if (rows.length === 0) return 0;

    const containerRect = container.getBoundingClientRect();
    const containerCenterX = centerX ?? containerRect.left + containerRect.width / 2;
    const scrollTop = container.scrollTop; // 0 si non scrollable (snapshot unique)

    // Séparateurs de date/heure affichés dans le thread (« Sam 23:34 », « 13:48 »…).
    const separators = this.collectTimeSeparators(container);

    let added = 0;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      // Ignorer uniquement les bulles SANS dimension (non mises en page → géométrie
      // et sens MOI/LUI non fiables). Une bulle hors-écran mais mesurée reste
      // valable : son rect (gauche/largeur/haut) est correct.
      if (rect.width === 0 || rect.height === 0) continue;

      const isSent = this.isSentMessage(row, containerCenterX);
      const realTs = this.extractTimestamp(row);
      const timestamp = realTs ?? this.timestampFromSeparators(row, separators);
      const reactions = this.extractReactions(row);
      // Position verticale absolue dans le contenu = rang chronologique stable.
      const order = scrollTop + (rect.top - containerRect.top);

      // ---- Message VOCAL : identité stable par DURÉE (« 0:03 »), indépendante de
      // l'état de transcription → on garde un placeholder en secours PUIS on le
      // remplace par la transcription dès qu'elle apparaît (jamais de doublon ni
      // de disparition ; une transcription partielle est complétée plus tard).
      if (this.isVoiceMessage(row)) {
        // Vocal COUPÉ par le bord haut du cadre → géométrie (position) et durée non
        // fiables (on lit alors une durée transitoire → clé différente → doublon
        // fantôme). On attend qu'il soit pleinement entré par le haut. (Les textes,
        // eux, ont une clé = leur texte, stable même coupés.)
        if (rect.top < containerRect.top - 1) continue;

        // Clé d'identité = durée (« 0:03 »). Tant qu'elle n'est pas rendue, on SKIP
        // (on attend) : un repli sur la position créerait un doublon du même vocal.
        const duration = this.extractVoiceDuration(row);
        if (!duration) continue;
        const transcript = this.extractText(row); // '' tant que pas transcrit
        const key = `voice|${isSent ? 1 : 0}|${duration}`;
        const existing = this.cache.get(key);
        if (existing) {
          if (existing.timestamp == null && timestamp != null) existing.timestamp = timestamp;
          // Mise à niveau : remplacer un placeholder (en attente OU non
          // transcriptible) / compléter une transcription partielle dès qu'une
          // version plus longue apparaît.
          if (transcript && (this.isVoicePlaceholder(existing.text) || transcript.length > existing.text.length)) {
            existing.text = transcript;
          }
          continue;
        }
        // Pas de transcription : distinguer « en attente » (bouton « Voir la
        // transcription » présent → sera complété) de « impossible » (aucun
        // bouton → IG ne transcrit plus ce vocal, trop ancien) pour l'indiquer.
        const placeholder = this.hasTranscriptControl(row) ? VOICE_PLACEHOLDER : VOICE_NO_TRANSCRIPT;
        this.cache.set(key, {
          messageId: key,
          text: transcript || placeholder,
          isSent,
          timestamp,
          reactions,
          kind: 'voice',
          order,
        });
        added++;
        continue;
      }

      // ---- Message TEXTE.
      const text = this.extractText(row);
      if (!text) continue;

      // Réponse à une story / un reel ? Le label de contexte (« A répondu à votre
      // story »…) vit dans la même bulle que le texte de la réponse : on le
      // détecte au niveau de la ligne pour taguer le message (signal d'engagement).
      const kind = this.detectReplyKind(row) ?? 'text';

      // Clé de dédup basée sur l'heure EXACTE uniquement (pas celle déduite d'un
      // séparateur, qui peut être absent selon le scroll) → dédup stable.
      const key = `${realTs ?? 'na'}|${isSent ? 1 : 0}|${text.slice(0, 60)}`;
      const existing = this.cache.get(key);
      if (existing) {
        if (existing.timestamp == null && timestamp != null) existing.timestamp = timestamp;
        // Le kind peut se révéler après coup (label rendu au scroll suivant).
        if ((!existing.kind || existing.kind === 'text') && kind !== 'text') existing.kind = kind;
        continue;
      }

      this.cache.set(key, {
        messageId: key,
        text,
        isSent,
        timestamp,
        reactions,
        kind,
        order,
      });
      added++;
    }
    return added;
  }

  /**
   * Durée TOTALE d'un message vocal — sert de clé d'identité stable. IG l'écrit
   * avec un ESPACE avant les deux-points (« 0 :03 ») et affiche DEUX temps : la
   * position de lecture (« 0:00 », qui bouge) ET la durée totale. On prend donc le
   * MAXIMUM (= durée totale, constante) pour une clé stable. Renvoie '' si aucun.
   */
  private extractVoiceDuration(row: HTMLElement): string {
    const nodes = Array.from(row.querySelectorAll('span, div')) as HTMLElement[];
    let bestSec = -1;
    let best = '';
    for (const el of nodes) {
      if (el.children.length > 0) continue; // feuilles uniquement
      const t = (el.textContent || '').trim();
      const m = t.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
      if (!m) continue;
      const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      if (sec > bestSec) {
        bestSec = sec;
        best = `${m[1]}:${m[2]}`;
      }
    }
    return best;
  }

  /**
   * Renvoie tous les messages collectés, dans l'ordre chronologique réel
   * (ancien → récent) dérivé du DOM via `order`. On NE trie PAS par timestamp :
   * la plupart des bulles n'ont pas d'heure exacte et héritent d'un séparateur
   * grossier partagé par tout un bloc, ce qui mélangeait l'ordre au sein des blocs.
   */
  getAll(): ExtractedMessage[] {
    const all = Array.from(this.cache.values());
    all.sort((a, b) => a.order - b.order);
    return all;
  }

  /**
   * Détecte un reçu de lecture (« Vu » / « Seen » / « Vu à … ») affiché sous le
   * dernier message envoyé. Ce marqueur n'est visible qu'en bas du thread (le
   * message le plus récent), donc à appeler quand le bas est à l'écran.
   */
  detectSeenReceipt(container: HTMLElement): boolean {
    const nodes = Array.from(container.querySelectorAll('span, div')) as HTMLElement[];
    for (const el of nodes) {
      // Élément feuille uniquement (pas un conteneur englobant tout le thread).
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 30) continue;
      if (/^(vu|seen)\b/.test(t) || /^vu(e)?\s+(à|le|hier|aujourd)/.test(t) || /^seen\s/.test(t)) {
        return true;
      }
    }
    return false;
  }

  // ==================== Transcriptions des messages vocaux ====================

  /**
   * Déplie les transcriptions des messages vocaux VISIBLES : clique les boutons
   * « Voir la transcription » / « View transcript » pas encore ouverts, attend
   * le rendu du texte, puis renvoie le nombre de transcriptions dépliées.
   *
   * À appeler AVANT extractVisible() : une fois la transcription affichée, le
   * texte vocal devient une bulle texte standard captée par l'extraction.
   */
  async expandVoiceTranscripts(container: HTMLElement): Promise<number> {
    const triggers = this.findTranscriptTriggers(container);
    let opened = 0;
    for (const btn of triggers) {
      try {
        btn.click();
        opened++;
        await this.sleep(300); // laisser la transcription se charger/afficher
      } catch {
        /* élément détaché entre-temps */
      }
    }
    // Rendu de la transcription parfois lent (IG la calcule à la volée) : on laisse
    // un délai franc. Le ré-échantillonnage suivant complètera de toute façon via
    // la clé « durée » du vocal (mise à niveau du placeholder).
    if (opened > 0) await this.sleep(700);
    return opened;
  }

  /** Boutons/éléments cliquables « Voir la transcription » non encore ouverts. */
  private findTranscriptTriggers(container: HTMLElement): HTMLElement[] {
    const showRe = /voir la transcription|afficher la transcription|view transcript|transcription|transcript/i;
    const hideRe = /masquer|cacher|hide/i;
    const seen = new Set<HTMLElement>();
    const out: HTMLElement[] = [];

    const candidates = Array.from(
      container.querySelectorAll('[role="button"], button, span, div')
    ) as HTMLElement[];

    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const txt = (el.textContent || '').trim().toLowerCase();
      const probe = `${label} ${txt}`;
      // Évoque la transcription, version « afficher » (pas « masquer »).
      if (!showRe.test(label) && !(txt.length <= 30 && showRe.test(txt))) continue;
      if (hideRe.test(probe)) continue;
      // Ignorer ce qui n'est pas réellement à l'écran.
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;

      const clickable = (el.closest('[role="button"], button') as HTMLElement | null) || el;
      if (seen.has(clickable)) continue;
      seen.add(clickable);
      out.push(clickable);
    }
    return out;
  }

  /** Vrai si le texte est l'un des placeholders de vocal (en attente OU non transcriptible). */
  private isVoicePlaceholder(text: string): boolean {
    return text === VOICE_PLACEHOLDER || text === VOICE_NO_TRANSCRIPT;
  }

  /**
   * Vrai si la bulle vocale propose une transcription (bouton « Voir la
   * transcription » présent, ou transcription déjà affichée). Son ABSENCE
   * signifie qu'Instagram ne transcrit pas ce vocal (message trop ancien).
   */
  private hasTranscriptControl(row: HTMLElement): boolean {
    const showRe = /voir la transcription|afficher la transcription|view transcript|transcription|transcript/i;
    const candidates = Array.from(
      row.querySelectorAll('[role="button"], button, span, div')
    ) as HTMLElement[];
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const txt = (el.textContent || '').trim().toLowerCase();
      if (showRe.test(label) || (txt.length <= 30 && showRe.test(txt))) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) return true;
      }
    }
    return false;
  }

  /**
   * Détecte si la bulle est une RÉPONSE à une story ou à un reel, via le label de
   * contexte qu'IG rend au-dessus du message (« A répondu à votre story »,
   * « Replied to your reel »…). Deux signaux d'engagement distincts. Best-effort
   * FR/EN : on agrège les aria-labels + les textes de feuilles COURTS de la bulle
   * (le label est un petit texte gris), puis on matche les formes attendues.
   */
  private detectReplyKind(row: HTMLElement): 'story-reply' | 'reel-reply' | null {
    const probe = this.collectReplyContext(row);
    if (!probe) return null;
    if (STORY_REPLY_RE.test(probe)) return 'story-reply';
    if (REEL_REPLY_RE.test(probe)) return 'reel-reply';
    return null;
  }

  /** Agrège aria-labels + textes de feuilles courts d'une bulle (normalisés) pour
   *  y chercher un label de contexte « répondu à … story/reel ». */
  private collectReplyContext(row: HTMLElement): string {
    const parts: string[] = [];
    row.querySelectorAll('[aria-label]').forEach((el) => {
      const v = el.getAttribute('aria-label');
      if (v && v.length <= 60) parts.push(v);
    });
    const nodes = Array.from(row.querySelectorAll('span, div')) as HTMLElement[];
    for (const el of nodes) {
      if (el.children.length > 0) continue; // feuilles uniquement
      const t = (el.textContent || '').trim();
      if (t && t.length <= 40) parts.push(t);
    }
    return this.normSep(parts.join(' '));
  }

  /**
   * Vrai si le texte est UNIQUEMENT le label de contexte « a répondu à … story/
   * reel » (et non un vrai message) — évite un message fantôme si IG le rend dans
   * sa propre ligne, sans texte de réponse.
   */
  private isReplyContextLabel(raw: string): boolean {
    const s = this.normSep(raw);
    if (!s || s.length > 40) return false;
    return (
      /^(vous avez |you |tu as |il a |elle a |a )?(repondu|replied|reply)\b.*\b(story|stories|storie|reel|reels)$/.test(s) ||
      /^(a )?(envoye|partage|sent|shared)\b.*\b(reel|reels|story|stories)$/.test(s)
    );
  }

  /** Détecte un message vocal (lecteur audio / bouton lecture / forme d'onde). */
  private isVoiceMessage(row: HTMLElement): boolean {
    if (row.querySelector('audio')) return true;
    const audioLabel = row.querySelector(
      '[aria-label*="Audio" i], [aria-label*="vocal" i], [aria-label*="voice" i], [aria-label*="Lire" i], [aria-label*="Play" i], [aria-label*="Pause" i]'
    );
    return !!audioLabel;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== Heures affichées (séparateurs) ====================

  // Jours de la semaine (FR/EN, abrégés ou complets) → index getDay() (0 = dim).
  private static readonly DAY_NAMES: Record<string, number> = {
    dim: 0, dimanche: 0, sun: 0, sunday: 0,
    lun: 1, lundi: 1, mon: 1, monday: 1,
    mar: 2, mardi: 2, tue: 2, tues: 2, tuesday: 2,
    mer: 3, mercredi: 3, wed: 3, wednesday: 3,
    jeu: 4, jeudi: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
    ven: 5, vendredi: 5, fri: 5, friday: 5,
    sam: 6, samedi: 6, sat: 6, saturday: 6,
  };

  // Mois (FR/EN, abrégés ou complets, accents déjà retirés) → index getMonth().
  private static readonly MONTHS: Record<string, number> = {
    janvier: 0, janv: 0, jan: 0, january: 0,
    fevrier: 1, fev: 1, fevr: 1, feb: 1, february: 1,
    mars: 2, march: 2,
    avril: 3, avr: 3, apr: 3, april: 3,
    mai: 4, may: 4,
    juin: 5, jun: 5, june: 5,
    juillet: 6, juil: 6, jul: 6, july: 6,
    aout: 7, aug: 7, august: 7,
    septembre: 8, sept: 8, sep: 8, september: 8,
    octobre: 9, oct: 9, october: 9,
    novembre: 10, nov: 10, november: 10,
    decembre: 11, dec: 11, december: 11,
  };

  /** Normalise pour le parsing : minuscules, sans accents/apostrophes, espaces compactés. */
  private normSep(s: string): string {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .replace(/[,]/g, ' ')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Vrai si le texte est un séparateur de date/heure du thread (et non une bulle
   * de message). On exige une forme ANCRÉE (le texte entier = l'horaire) pour ne
   * pas confondre avec un message contenant une heure (« rdv à 14:30 »).
   */
  private looksLikeSeparator(raw: string): boolean {
    const s = this.normSep(raw);
    if (!s || s.length > 40) return false;

    // a) [jour] [relatif] HH:MM[am|pm]
    if (
      /^(?:(?:lun|mar|mer|jeu|ven|sam|dim|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\.? )?(?:(?:hier|aujourdhui|today|yesterday) )?\d{1,2} ?: ?\d{2}(?: ?[ap]m)?$/.test(
        s
      )
    ) {
      return true;
    }

    // b) <jour-num> <mois> [année] [HH:MM]  (ex. « 12 juin 2024 14:00 »)
    const dm = s.match(/^\d{1,2} ([a-z]+)\.?(?: \d{4})?(?: \d{1,2} ?: ?\d{2}(?: ?[ap]m)?)?$/);
    if (dm && dm[1] in DMMessageExtractor.MONTHS) return true;

    return false;
  }

  /**
   * Convertit une heure AFFICHÉE en timestamp (ms), en prenant l'heure locale
   * actuelle (`now`) comme référence (jour le plus récent cohérent dans le passé).
   * Best-effort FR/EN. Renvoie null si non interprétable.
   */
  parseDisplayedTime(raw: string, now = Date.now()): number | null {
    const s = this.normSep(raw);
    if (!s) return null;

    // Heure HH:MM (+am/pm).
    let hh = 12;
    let mm = 0;
    let hasTime = false;
    const tm = s.match(/(\d{1,2}) ?: ?(\d{2}) ?([ap]m)?/);
    if (tm) {
      hh = parseInt(tm[1], 10);
      mm = parseInt(tm[2], 10);
      if (tm[3] === 'pm' && hh < 12) hh += 12;
      if (tm[3] === 'am' && hh === 12) hh = 0;
      hasTime = true;
    }
    if (hh > 23 || mm > 59) return null;

    const apply = (d: Date): number => {
      d.setHours(hh, mm, 0, 0);
      return d.getTime();
    };
    const tokens = s.split(' ');

    // Hier / aujourd'hui.
    if (/\bhier\b|\byesterday\b/.test(s)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return apply(d);
    }
    if (/aujourdhui|\btoday\b/.test(s)) {
      return apply(new Date(now));
    }

    // Date avec nom de mois (ex. « 12 juin 2024 »).
    let monthIdx = -1;
    for (const t of tokens) {
      const mi = DMMessageExtractor.MONTHS[t.replace('.', '')];
      if (mi !== undefined) {
        monthIdx = mi;
        break;
      }
    }
    if (monthIdx >= 0) {
      let day = NaN;
      let year = NaN;
      for (const t of tokens) {
        if (/^\d{1,2}$/.test(t) && isNaN(day)) day = parseInt(t, 10);
        else if (/^\d{4}$/.test(t)) year = parseInt(t, 10);
      }
      if (!isNaN(day)) {
        const d = new Date(now);
        d.setMonth(monthIdx, day);
        if (!isNaN(year)) d.setFullYear(year);
        apply(d);
        if (isNaN(year) && d.getTime() > now + 60_000) d.setFullYear(d.getFullYear() - 1);
        return d.getTime();
      }
    }

    // Jour de la semaine → occurrence passée la plus récente.
    for (const t of tokens) {
      const dow = DMMessageExtractor.DAY_NAMES[t.replace('.', '')];
      if (dow !== undefined) {
        const d = new Date(now);
        const diff = (d.getDay() - dow + 7) % 7;
        d.setDate(d.getDate() - diff);
        apply(d);
        if (d.getTime() > now + 60_000) d.setDate(d.getDate() - 7);
        return d.getTime();
      }
    }

    // Heure seule → aujourd'hui (ou hier si l'heure est dans le futur).
    if (hasTime) {
      const d = new Date(now);
      apply(d);
      if (d.getTime() > now + 60_000) d.setDate(d.getDate() - 1);
      return d.getTime();
    }

    return null;
  }

  /**
   * Recense les séparateurs de date/heure visibles, avec leur position verticale,
   * pour pouvoir attribuer une heure aux bulles situées en dessous.
   */
  private collectTimeSeparators(container: HTMLElement): Array<{ top: number; ts: number }> {
    const now = Date.now();
    const out: Array<{ top: number; ts: number }> = [];
    const seen = new Set<string>();
    const nodes = Array.from(container.querySelectorAll('span, div, time, h5, h6')) as HTMLElement[];
    for (const el of nodes) {
      if (el.children.length > 0) continue; // feuilles uniquement
      const raw = (el.textContent || '').trim();
      if (!this.looksLikeSeparator(raw)) continue;
      const ts = this.parseDisplayedTime(raw, now);
      if (ts == null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const k = `${Math.round(rect.top)}|${ts}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ top: rect.top, ts });
    }
    out.sort((a, b) => a.top - b.top);
    return out;
  }

  /** Heure du séparateur le plus proche AU-DESSUS de la bulle (ou le 1er sinon). */
  private timestampFromSeparators(
    row: HTMLElement,
    separators: Array<{ top: number; ts: number }>
  ): number | null {
    if (separators.length === 0) return null;
    const top = row.getBoundingClientRect().top;
    let best: number | null = null;
    for (const s of separators) {
      if (s.top <= top + 4) best = s.ts;
      else break;
    }
    return best ?? separators[0].ts;
  }

  // ==================== DOM ====================

  private findMessageRows(container: HTMLElement): HTMLElement[] {
    // Les messages sont généralement des éléments role="row" dans la grille du
    // thread ; fallback sur les bulles contenant du texte dir="auto".
    let rows = (Array.from(container.querySelectorAll('div[role="row"]')) as HTMLElement[]).filter(
      (r) => !this.isSidebarItem(r)
    );
    if (rows.length === 0) {
      // Fallback : remonter depuis les spans de texte vers un conteneur de bulle.
      const textNodes = Array.from(
        container.querySelectorAll('span[dir="auto"], div[dir="auto"]')
      ) as HTMLElement[];
      const set = new Set<HTMLElement>();
      for (const t of textNodes) {
        if (this.isSidebarItem(t)) continue;
        const bubble =
          (t.closest('div[role="row"]') as HTMLElement) ||
          (t.parentElement?.parentElement as HTMLElement) ||
          t;
        if (bubble && !this.isSidebarItem(bubble)) set.add(bubble);
      }
      rows = Array.from(set);
    }
    return rows;
  }

  /**
   * Vrai si l'élément appartient à la LISTE des conversations (barre latérale) et
   * non au thread ouvert. Ces lignes sont des liens `/direct/t/<id>/` : une bulle
   * de message du thread n'en contient jamais. Sans ce filtre, quand le conteneur
   * de repli est le <main> entier, les aperçus de la barre latérale sont comptés
   * comme des « messages reçus » fantômes (ils sont à gauche → reçus).
   */
  private isSidebarItem(el: HTMLElement): boolean {
    return !!el.closest('a[href^="/direct/t/"]') || !!el.querySelector('a[href^="/direct/t/"]');
  }

  private extractText(row: HTMLElement): string {
    // Préférer le span de texte explicite.
    const textEl = row.querySelector('span[dir="auto"], div[dir="auto"]');
    let raw = (textEl?.textContent ?? row.textContent ?? '').trim();

    // Message vocal : on ne capte QUE sa transcription (texte). Tant qu'elle n'est
    // pas dépliée/rendue, on renvoie '' (on SKIP) : `expandVoiceTranscripts` la
    // déplie et le ré-échantillonnage la captera ensuite. On ne stocke JAMAIS de
    // placeholder « [voice message] » — sinon le même vocal apparaît en double
    // (placeholder AVANT transcription + texte APRÈS, à deux positions, car
    // déplier une transcription décale la mise en page).
    if (this.isVoiceMessage(row)) {
      // Retirer une éventuelle durée en tête (« 0:12 … ») et le libellé de contrôle
      // « Voir/Masquer la transcription / Voir moins ».
      let transcript = raw.replace(/^\d{1,2}:\d{2}\s*/, '').trim();
      transcript = transcript
        .replace(/(voir|afficher|masquer|hide|view|see)\s+(la\s+|the\s+)?transcription?\s*$/i, '')
        .replace(/(voir|see|show)\s+(moins|plus|more|less)\s*$/i, '')
        .trim();
      if (transcript.length > 0 && !/^\d{1,2}:\d{2}$/.test(transcript) && !this.isNoiseLabel(transcript)) {
        return transcript;
      }
      return ''; // pas encore transcrit → on attend (pas de placeholder)
    }

    // Ignorer les lignes système (séparateurs de date/heure « Sam 23:34 »,
    // « 13:48 », reçus de lecture « Vu / Seen »).
    if (raw.length === 0) return '';
    if (this.looksLikeSeparator(raw)) return '';
    if (/^(vu|seen)\b/i.test(raw) || /^vu(e)?\s+(à|le|hier|aujourd)/i.test(raw)) return '';
    // Label de contexte « a répondu à … story/reel » seul (pas de texte de réponse)
    // → ligne système, ignorée (le kind est détecté au niveau de la bulle réponse).
    if (this.isReplyContextLabel(raw)) return '';
    // Bruit d'interface du panneau du thread (carte profil, boutons) capté quand
    // on extrait depuis un périmètre large : « pseudo · Instagram », « Voir le
    // profil », libellés de transcription, etc.
    if (this.isNoiseLabel(raw)) return '';
    return raw;
  }

  /**
   * Vrai si le texte est du « bruit » d'interface du thread (et non un message) :
   * sous-titre de la carte profil (« pseudo · Instagram »), boutons « Voir le
   * profil » / libellés de transcription. On exige le texte EXACT d'un libellé
   * court pour ne jamais écarter un vrai message qui contiendrait ces mots.
   */
  private isNoiseLabel(raw: string): boolean {
    const t = raw.trim();
    // Sous-titre de la carte profil de début de conversation.
    if (/^[a-z0-9._]{1,40}\s*·\s*instagram$/i.test(t)) return true;
    if (t.length > 30) return false;
    const s = t
      .toLowerCase()
      .replace(/[…·]+$/g, '')
      .replace(/\.\.\.$/g, '')
      .trim();
    const labels = new Set([
      'voir le profil', 'voir profil', 'view profile',
      'voir la transcription', 'afficher la transcription', 'masquer la transcription',
      'view transcript', 'see transcript', 'hide transcript', 'transcription',
      'voir moins', 'voir plus', 'see more', 'see less', 'show more', 'show less',
    ]);
    return labels.has(s);
  }

  private isSentMessage(row: HTMLElement, containerCenterX: number): boolean {
    const rect = row.getBoundingClientRect();
    if (rect.width === 0) {
      // Pas mesurable : se rabattre sur l'absence d'avatar (les messages reçus
      // ont souvent une image d'avatar à gauche).
      return !row.querySelector('img');
    }
    const center = rect.left + rect.width / 2;
    return center > containerCenterX;
  }

  /**
   * Heure EXACTE de la bulle (à la seconde), au-delà du séparateur de bloc :
   *   1. `<time datetime>` / tout `[datetime]` ISO (le plus fiable) ;
   *   2. l'heure complète qu'IG expose dans le `title` / `aria-label` de la bulle
   *      (le « tooltip » au survol, présent dans le DOM même sans survol).
   * Permet de calculer de vrais temps de réponse des DEUX côtés (les réponses
   * rapides d'un même bloc ne sont plus écrasées à delta=0).
   */
  private extractTimestamp(row: HTMLElement): number | null {
    // 1) datetime ISO sur <time> ou tout élément qui le porte.
    const dtEl = row.querySelector('time[datetime], [datetime]');
    const dt = dtEl?.getAttribute('datetime');
    if (dt) {
      const t = new Date(dt).getTime();
      if (!isNaN(t)) return t;
    }

    // 2) Heure exacte dans title / aria-label (la bulle elle-même puis ses enfants).
    const carriers: Element[] = [row, ...Array.from(row.querySelectorAll('[title], [aria-label]'))];
    for (const el of carriers) {
      for (const attr of ['title', 'aria-label']) {
        const v = el.getAttribute?.(attr);
        if (!v) continue;
        const ts = this.parseAttributeTime(v);
        if (ts != null) return ts;
      }
    }
    return null;
  }

  // Contexte de DATE exigé pour interpréter une heure d'attribut (évite de
  // confondre un « 14:30 » figurant dans un message avec un horodatage).
  private static readonly DATE_CONTEXT_RE =
    /\b\d{4}\b|janv|fevr|mars|avril|\bmai\b|juin|juil|aout|sept|octo|nove|dece|jan|feb|mar|apr|jun|jul|aug|oct|nov|dec|lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun|hier|aujourd|today|yesterday|\bat\b|\bà\b|\bam\b|\bpm\b/i;

  /**
   * Parse l'heure portée par un attribut (title/aria-label). Tente d'abord un
   * format ISO ; sinon réutilise le parseur d'heures affichées FR/EN, mais
   * uniquement si l'attribut contient un vrai contexte de date (sécurité).
   */
  private parseAttributeTime(v: string): number | null {
    const s = v.trim();
    if (!s || s.length > 80) return null;

    // ISO (« 2024-06-12T14:32:00.000Z », « 2024-06-12 14:32 »…).
    if (/\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}/i.test(s)) {
      const t = Date.parse(s);
      if (!isNaN(t)) return t;
    }

    // Texte daté FR/EN — uniquement avec un contexte de date explicite.
    if (DMMessageExtractor.DATE_CONTEXT_RE.test(s) && /\d{1,2} ?: ?\d{2}/.test(s)) {
      return this.parseDisplayedTime(s);
    }
    return null;
  }

  private extractReactions(row: HTMLElement): string[] {
    // Les réactions emoji apparaissent dans un petit conteneur ; best-effort.
    const reactionEls = row.querySelectorAll('[aria-label*="reaction" i], [aria-label*="réaction" i]');
    const out: string[] = [];
    reactionEls.forEach((el) => {
      const label = el.getAttribute('aria-label') || el.textContent || '';
      if (label) out.push(label.trim());
    });
    return out;
  }
}
