/**
 * Coach Panel
 *
 * Panneau de coaching PERSISTANT injecté dans la page Instagram, affiché à côté
 * de la conversation pendant que l'utilisateur (et son prospect) échangent en
 * direct. Alimenté par le `liveTick` passif (aucune action IG, lecture pure) via
 * `SettingCoach` — cf. la note « live-conversation-analysis-passive ».
 *
 * Règle de design (anti-HUD, cf. positionnement « apprenti qui apprend ») :
 *   1 headline lisible en une seconde  = phase + momentum (deux signaux
 *     orthogonaux : OÙ on est dans le setting × DANS QUEL SENS ça va).
 *   1 nudge de coaching                = la prochaine question à POSER
 *     (`nextStep`) — jamais une réponse pré-rédigée à copier-coller.
 *   closeProbability                   = progressive disclosure : barre fine
 *     discrète, promue en gros SEULEMENT quand on bascule en phase de closing.
 *
 * Distinct de ScanOverlay (toast de statut transitoire) : ici c'est persistant,
 * ciblé sur un contact, et mis à jour en place au fil des messages.
 */

import type { SettingCoaching, SettingPhase, Momentum, Lang } from './setting-coach.js';

const ACCENT = '#02c950';
const AMBER = '#f5a623';
const MUTED = 'rgba(255,255,255,0.5)';

// Icônes lucide (line) — cohérence avec le reste de l'UI Waler.
const ICON_DOT = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="${ACCENT}" stroke="none"><circle cx="12" cy="12" r="10"/></svg>`;
const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
// Réduire le panneau en bulle flottante (lucide minimize-2).
const ICON_MINIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
// Icônes des suggestions : « analyser » (pouls) et « pas dans People » (user+).
const ICON_PULSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const ICON_USER_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// Flèche directionnelle du momentum (↗ accélère / → stable / ↘ refroidit).
const MOMENTUM_ICON: Record<Momentum, string> = {
  accelerating: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
  steady: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  cooling: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>`,
};

const MOMENTUM_COLOR: Record<Momentum, string> = {
  accelerating: ACCENT,
  steady: MUTED,
  cooling: AMBER,
};

const MOMENTUM_LABEL: Record<Lang, Record<Momentum, string>> = {
  fr: { accelerating: 'accélère', steady: 'stable', cooling: 'refroidit' },
  en: { accelerating: 'heating up', steady: 'steady', cooling: 'cooling' },
};

// Ordre du framework de setting → position dans le stepper.
const PHASE_ORDER: SettingPhase[] = ['connexion', 'situation', 'probleme', 'transition'];

const CLOSE_LABEL: Record<Lang, string> = { fr: 'prêt à closer', en: 'ready to close' };
const CHECKPOINT_LABEL: Record<Lang, string> = { fr: 'Checkpoint', en: 'Checkpoint' };
const EXAMPLE_LABEL: Record<Lang, string> = { fr: 'exemple (reformule-le)', en: 'example (make it yours)' };
// Tooltips des boutons d'en-tête (réduire / fermer).
const TIP_MIN: Record<Lang, string> = { fr: 'Réduire', en: 'Minimize' };
const TIP_CLOSE: Record<Lang, string> = { fr: 'Fermer', en: 'Close' };

// Rappel affiché sous le coaching quand le profil serveur du People n'est pas
// encore complet : la conversation est analysée, mais l'engagement/profil reste
// à collecter (analyse complète) pour remplir les stats manquantes.
const COMPLETE_NUDGE: Record<Lang, { title: string; body: string }> = {
  fr: { title: 'Conversation analysée', body: 'Profil incomplet — lance l\'analyse d\'engagement (bouton Pro de l\'extension) pour remplir le reste des stats.' },
  en: { title: 'Conversation analyzed', body: 'Profile incomplete — run the engagement analysis (Pro button in the extension) to fill the remaining stats.' },
};

// Suggestions affichées quand le coaching n'est pas (encore) disponible :
//  - needs_analysis : contact suivi mais sans baseline / contexte trop mince →
//    bouton pour lancer une analyse complète (le score se reflète dans People) ;
//  - not_tracked    : pas dans People → le bouton l'AJOUTE à People puis lance
//    l'analyse (l'ajout est requis pour que le score soit rattaché).
export type SuggestionKind = 'needs_analysis' | 'not_tracked';

const SUGGESTION: Record<SuggestionKind, Record<Lang, { title: string; body: string; cta?: string }>> = {
  needs_analysis: {
    fr: { title: 'Pas encore assez de contexte', body: 'Lance une analyse complète pour activer le coaching sur cette conversation.', cta: 'Analyser la conversation' },
    en: { title: 'Not enough context yet', body: 'Run a full analysis to enable coaching on this conversation.', cta: 'Analyze conversation' },
  },
  not_tracked: {
    fr: { title: 'Contact non suivi', body: 'Ajoute @{u} à tes People pour compléter son profil et mieux le connaître. Waler analysera la conversation.', cta: 'Ajouter à People et analyser' },
    en: { title: 'Not in your People', body: 'Add @{u} to your People to complete their profile and know them better. Waler will analyze the conversation.', cta: 'Add to People and analyze' },
  },
};

class CoachPanel {
  private root: HTMLDivElement | null = null;
  private target: string | null = null; // @username actuellement affiché
  private dismissed = new Set<string>(); // contacts fermés (croix) cette session
  private onCta: (() => void) | null = null; // action du bouton de la suggestion
  private lastSig = ''; // signature du contenu rendu → évite de réécrire (et de
                        //  refermer l'exemple) à chaque tick identique.
  private panelEl: HTMLDivElement | null = null;  // contenu complet (patché par setHtml)
  private bubbleEl: HTMLDivElement | null = null; // icône flottante = état réduit
  private minimized = false; // réduit en bulle (persiste sur la session)
  // Drag en cours : positions de départ + drapeau « a bougé » (distingue clic/drag).
  private drag: { sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  /** Contact actuellement ciblé par le panneau (null si masqué). */
  currentTarget(): string | null {
    return this.target;
  }

  /**
   * Crée ou met à jour le panneau pour `username` avec le coaching fourni.
   * Idempotent : réutilise le DOM existant et ne fait que patcher le contenu
   * (pas de flash à chaque tick).
   */
  render(username: string, coaching: SettingCoaching, _uiLang: Lang, incompleteProfile = false): void {
    if (!this.root) this.mount();
    this.target = username;
    this.onCta = null; // mode coaching : pas de bouton d'action
    if (this.dismissed.has(username.toLowerCase())) { this.displayNone(); return; }

    // Le panneau suit la langue de la CONVERSATION (détectée des messages du
    // prospect), PAS la langue d'UI : le checkpoint et l'exemple sont déjà rédigés
    // dans cette langue (message à lui envoyer). Aligner les libellés (« exemple »,
    // momentum, closing) dessus évite un panneau mi-FR / mi-EN.
    const lang = coaching.lang;
    const { phase, phaseLabel } = coaching;
    const { momentum, nextStep, closeProbability, priority } = coaching.summary;

    // --- Headline : stepper de phase + momentum. ---
    const activeIdx = PHASE_ORDER.indexOf(phase);
    const dots = PHASE_ORDER.map((_, i) => {
      const on = i <= activeIdx;
      return `<span style="width:6px;height:6px;border-radius:50%;background:${on ? ACCENT : 'rgba(255,255,255,0.15)'};display:inline-block;"></span>`;
    }).join('<span style="width:8px;height:1px;background:rgba(255,255,255,0.12);display:inline-block;"></span>');

    const momoColor = MOMENTUM_COLOR[momentum];
    const momoHtml =
      `<span style="display:inline-flex;align-items:center;gap:4px;color:${momoColor};font-size:12px;font-weight:600;">` +
      `${MOMENTUM_ICON[momentum]}${MOMENTUM_LABEL[lang][momentum]}</span>`;

    // --- closeProbability : discret par défaut, promu en phase de closing. ---
    const promoted = priority === 'close' || phase === 'transition';
    const pct = Math.max(0, Math.min(100, Math.round(closeProbability)));

    // Le nudge est un CHECKPOINT (objectif à atteindre), pas une réplique : on
    // mène avec l'objectif et on relègue le script en « exemple » repliable.
    const { checkpoint, example } = this.parseNudge(nextStep);

    // Signature du contenu : si rien n'a changé, on ne réécrit pas le DOM (évite
    // le flicker et de refermer l'exemple que l'utilisateur aurait ouvert).
    const sig = `coach|${username}|${phase}|${momentum}|${pct}|${promoted ? 1 : 0}|${incompleteProfile ? 1 : 0}|${checkpoint}|${example}`;
    if (this.root && this.root.style.display !== 'none' && sig === this.lastSig) {
      this.show();
      return;
    }
    this.lastSig = sig;

    this.setHtml(`
      ${this.header(username, lang)}

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="display:flex;align-items:center;gap:5px;">${dots}</span>
        <span style="font-size:12px;font-weight:600;color:#fff;">${phaseLabel}</span>
        <span style="flex:1;"></span>
        ${momoHtml}
      </div>

      <div style="background:rgba(2,201,80,0.06);border:1px solid rgba(2,201,80,0.16);border-radius:8px;padding:10px 12px;margin-bottom:${promoted ? '12px' : '10px'};">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${ACCENT};margin-bottom:4px;">${CHECKPOINT_LABEL[lang]}</div>
        <div style="font-size:13px;color:#fff;line-height:1.45;">${this.esc(checkpoint)}</div>
        ${example ? `<details style="margin-top:8px;">
          <summary style="font-size:11px;color:rgba(255,255,255,0.4);cursor:pointer;list-style:none;user-select:none;">${EXAMPLE_LABEL[lang]}</summary>
          <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.4;font-style:italic;margin-top:6px;">${this.esc(example)}</div>
        </details>` : ''}
      </div>

      ${this.closeBar(pct, promoted, lang)}
      ${incompleteProfile ? this.completeNudge(lang) : ''}
    `);

    this.show();
  }

  /** Rappel « conversation analysée · profil incomplet » sous le coaching. */
  private completeNudge(lang: Lang): string {
    const t = COMPLETE_NUDGE[lang];
    return `<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;align-items:flex-start;">
        <span style="color:${ACCENT};display:flex;flex-shrink:0;margin-top:1px;">${ICON_CHECK}</span>
        <div>
          <div style="font-size:11px;font-weight:600;color:#fff;margin-bottom:2px;">${this.esc(t.title)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);line-height:1.4;">${this.esc(t.body)}</div>
        </div>
      </div>`;
  }

  /**
   * Affiche une SUGGESTION au lieu du coaching, quand celui-ci n'est pas
   * disponible : `needs_analysis` (contact suivi mais sans contexte → bouton pour
   * lancer une analyse) ou `not_tracked` (pas dans People → invite à l'ajouter).
   * `onAnalyze` n'est utilisé que par `needs_analysis`.
   */
  renderSuggestion(username: string, kind: SuggestionKind, lang: Lang, onCta?: () => void): void {
    if (!this.root) this.mount();
    this.target = username;
    this.onCta = onCta || null;
    if (this.dismissed.has(username.toLowerCase())) { this.displayNone(); return; }

    const s = SUGGESTION[kind][lang];
    const body = s.body.replace('@{u}', '@' + username);
    const icon = kind === 'not_tracked' ? ICON_USER_PLUS : ICON_PULSE;

    const sig = `sug|${username}|${kind}`;
    if (this.root && this.root.style.display !== 'none' && sig === this.lastSig) {
      this.show();
      return;
    }
    this.lastSig = sig;

    this.setHtml(`
      ${this.header(username, lang)}
      <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:${s.cta ? '12px' : '2px'};">
        <span style="color:${ACCENT};display:flex;flex-shrink:0;margin-top:1px;">${icon}</span>
        <div>
          <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:3px;">${this.esc(s.title)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.45;">${this.esc(body)}</div>
        </div>
      </div>
      ${s.cta ? `<button data-waler-coach-analyze style="width:100%;padding:8px 12px;border:1px solid rgba(2,201,80,0.35);background:rgba(2,201,80,0.12);color:${ACCENT};font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;font-family:inherit;">${this.esc(s.cta)}</button>` : ''}
    `);

    this.show();
  }

  /**
   * En-tête commun (point Waler + @username + réduire + fermer). Sert aussi de
   * poignée de déplacement (`data-waler-coach-drag`) ; les boutons sont marqués
   * `data-waler-coach-btn` pour ne PAS déclencher de drag au clic.
   */
  private header(username: string, lang: Lang): string {
    return `<div data-waler-coach-drag style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:move;user-select:none;">
        <span style="display:flex;align-items:center;">${ICON_DOT}</span>
        <span style="font-weight:600;font-size:13px;letter-spacing:0.02em;color:${ACCENT};flex:1;">Waler</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.35);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${this.esc(username)}</span>
        <button data-waler-coach-min data-waler-coach-btn title="${TIP_MIN[lang]}" style="background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:2px;display:flex;line-height:0;">${ICON_MINIMIZE}</button>
        <button data-waler-coach-close data-waler-coach-btn title="${TIP_CLOSE[lang]}" style="background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:2px;display:flex;line-height:0;">${ICON_X}</button>
      </div>`;
  }

  /**
   * Sépare le `nextStep` en checkpoint (objectif à atteindre) + exemple (script
   * entre guillemets, optionnel). Retire aussi le préfixe de phase (« Problème —
   * … ») déjà affiché dans le stepper. Format produit par SettingCoach :
   *   « Phase — objectif : « exemple » » (guillemets FR «…» ou EN "…").
   */
  private parseNudge(nextStep: string): { checkpoint: string; example: string } {
    let s = (nextStep || '').trim();
    const dash = s.indexOf(' — ');
    if (dash !== -1) s = s.slice(dash + 3).trim();
    const q = s.search(/[«"]/);
    if (q === -1) return { checkpoint: s, example: '' };
    const checkpoint = s.slice(0, q).replace(/[\s:.]+$/, '').trim();
    const example = s.slice(q).replace(/^[«"\s]+|[»"\s]+$/g, '').trim();
    return { checkpoint, example };
  }

  /** Barre closeProbability — fine par défaut, promue (chiffre + label) en closing. */
  private closeBar(pct: number, promoted: boolean, lang: Lang): string {
    const bar = `<div style="width:100%;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${ACCENT};border-radius:2px;transition:width 0.4s ease;box-shadow:0 0 6px rgba(2,201,80,0.5);"></div>
      </div>`;
    if (!promoted) return bar;
    return `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px;">
        <span style="font-size:18px;font-weight:700;color:${ACCENT};font-variant-numeric:tabular-nums;">${pct}%</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.5);">${CLOSE_LABEL[lang]}</span>
      </div>${bar}`;
  }

  private mount(): void {
    // Conteneur positionné (fixe) : porte le déplacement (left/top). Le contenu
    // et la bulle réduite sont des enfants → survivent aux re-render de setHtml.
    this.root = document.createElement('div');
    this.root.id = 'waler-coach-panel';
    this.root.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Panneau complet (mis à jour par setHtml).
    this.panelEl = document.createElement('div');
    this.panelEl.style.cssText = `
      background: #000;
      border: 1px solid rgba(2,201,80,0.18);
      color: #fff;
      padding: 14px 16px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(2,201,80,0.06);
      width: 288px;
      animation: waler-coach-in 0.25s ease-out;
    `;

    // Bulle flottante = état réduit. Cliquable pour ré-ouvrir, déplaçable.
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.setAttribute('data-waler-coach-drag', '');
    this.bubbleEl.setAttribute('data-waler-coach-bubble', '');
    this.bubbleEl.style.cssText = `
      display: none;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: #000;
      border: 1px solid rgba(2,201,80,0.35);
      cursor: pointer;
      align-items: center;
      justify-content: center;
      animation: waler-coach-pulse 2.4s ease-in-out infinite;
    `;
    this.bubbleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${ACCENT}" stroke="none"><circle cx="12" cy="12" r="10"/></svg>`;

    this.root.appendChild(this.panelEl);
    this.root.appendChild(this.bubbleEl);

    if (!document.getElementById('waler-coach-style')) {
      const style = document.createElement('style');
      style.id = 'waler-coach-style';
      style.textContent = `
        @keyframes waler-coach-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes waler-coach-pulse { 0%,100% { box-shadow: 0 6px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(2,201,80,0.08); } 50% { box-shadow: 0 6px 20px rgba(0,0,0,0.6), 0 0 0 4px rgba(2,201,80,0.18); } }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(this.root);

    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement | null;
      // Réduire → bulle flottante (garde le contexte, libère l'écran).
      if (el?.closest('[data-waler-coach-min]')) { this.minimize(); return; }
      // Croix → fermer POUR CE CONTACT (le coaching réapparaît sur les autres).
      if (el?.closest('[data-waler-coach-close]')) {
        if (this.target) this.dismissed.add(this.target.toLowerCase());
        this.displayNone();
        return;
      }
      // Bouton d'action d'une suggestion (analyser / ajouter à People).
      if (el?.closest('[data-waler-coach-analyze]')) {
        this.onCta?.();
      }
    });

    // Déplacement : via l'en-tête (panneau) ou la bulle réduite.
    this.root.addEventListener('pointerdown', this.onPointerDown);
  }

  // Démarre un drag depuis une poignée (`data-waler-coach-drag`), sauf sur un
  // bouton d'en-tête. Passe l'ancrage en top/left pour bouger librement.
  private onPointerDown = (e: PointerEvent): void => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('[data-waler-coach-btn]')) return; // boutons → clic, pas drag
    if (!el?.closest('[data-waler-coach-drag]') || !this.root) return;
    const r = this.root.getBoundingClientRect();
    this.root.style.left = `${r.left}px`;
    this.root.style.top = `${r.top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
    this.drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag || !this.root) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.max(4, Math.min(this.drag.ox + dx, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(this.drag.oy + dy, window.innerHeight - h - 4));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  };

  private onPointerUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    const moved = this.drag?.moved;
    this.drag = null;
    // Clic (sans déplacement) sur la bulle réduite → ré-ouvrir le panneau.
    if (!moved && (e.target as HTMLElement | null)?.closest('[data-waler-coach-bubble]')) {
      this.expand();
    }
  };

  /** Réduit le panneau en bulle flottante (état conservé sur la session). */
  private minimize(): void {
    this.minimized = true;
    this.syncMinimized();
  }

  /** Ré-ouvre le panneau complet depuis la bulle. */
  private expand(): void {
    this.minimized = false;
    this.syncMinimized();
  }

  /** Bascule l'affichage panneau ↔ bulle selon `this.minimized`. */
  private syncMinimized(): void {
    if (this.panelEl) this.panelEl.style.display = this.minimized ? 'none' : 'block';
    if (this.bubbleEl) this.bubbleEl.style.display = this.minimized ? 'flex' : 'none';
    if (!this.minimized) this.clampToViewport();
  }

  /** Re-borne le panneau dans le viewport (utile après ré-ouverture près d'un bord). */
  private clampToViewport(): void {
    if (!this.root || !this.root.style.left) return; // pas déplacé → ancrage bas/droite intact
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.max(4, Math.min(parseFloat(this.root.style.left), window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(parseFloat(this.root.style.top), window.innerHeight - h - 4));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  private setHtml(html: string): void {
    if (this.panelEl) this.panelEl.innerHTML = html;
  }

  private displayNone(): void {
    if (this.root) this.root.style.display = 'none';
  }

  private show(): void {
    if (this.target && this.dismissed.has(this.target.toLowerCase())) return; // fermé pour ce contact
    if (this.root) this.root.style.display = 'block';
    this.syncMinimized();
  }

  /** Masque le panneau (changement de thread, arrêt global, contexte invalidé). */
  hide(): void {
    this.target = null;
    this.displayNone();
  }

  private esc(s: string): string {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  }
}

export default CoachPanel;
