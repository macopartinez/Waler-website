/**
 * Conversation Dynamics
 *
 * Analyse la DYNAMIQUE d'une conversation DM (et non son contenu/intention) pour
 * en déduire une « température » de relation : 🔥 chaud / 🟡 tiède / 🧊 froid.
 *
 * C'est l'axe complémentaire de DMAnalyzer (qui, lui, mesure l'INTENTION via
 * mots-clés/ton). Ici on ne regarde que des signaux comportementaux :
 *   - temps de réponse moyen (le contact ET l'utilisateur) ;
 *   - taux de réponse (mes messages obtiennent-ils une réponse ?) ;
 *   - réponses brèves (« ok », « 👍 ») ;
 *   - ancienneté / propriété du dernier message (balle dans son camp ?) ;
 *   - « vu » sans réponse (read receipt) ;
 *   - tendance de cadence (les échanges s'accélèrent ou ralentissent ?).
 *
 * Tout est heuristique, sans IA. Les temps de réponse sont APPROXIMATIFS :
 * Instagram ne timestampe pas chaque bulle, donc les messages sans horodatage
 * sont ignorés dans les calculs de délai.
 */

import type { ExtractedMessage } from './dm-message-extractor.js';

export type Temperature = 'hot' | 'warm' | 'cold';

export interface ConversationDynamics {
  // Délais (ms) — null si trop peu d'horodatages pour les calculer.
  theirAvgResponseMs: number | null; // temps de réponse moyen du contact
  myAvgResponseMs: number | null; // mon temps de réponse moyen

  // Taux 0-1.
  theirResponseRate: number; // part de mes relances obtenant une réponse
  briefReplyRatio: number; // part de leurs réponses « brèves »

  // Dernier message.
  lastMessageIsSent: boolean; // true = c'est moi qui ai écrit en dernier
  lastMessageAgeMs: number | null; // ancienneté du dernier message
  seenNotAnswered: boolean; // mon dernier message a été vu mais non répondu

  // Volumes.
  msgCount: number;
  myMsgCount: number;
  theirMsgCount: number;

  // Tendance de fréquence des échanges.
  cadenceTrend: 'up' | 'down' | 'flat';

  // Synthèse.
  temperatureScore: number; // 0-100
  temperature: Temperature;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Réponses « brèves » : acquiescements courts / emoji seuls.
const BRIEF_TOKENS = new Set([
  'ok', 'oki', 'okay', 'k', 'kk', 'd\'accord', 'daccord', 'dac', 'ouais', 'oui', 'non', 'yep', 'yup', 'yes', 'no', 'nope',
  'mdr', 'ptdr', 'lol', 'haha', 'hahaha', 'ah', 'ahh', 'aha', 'hmm', 'mmh', 'ah ok', 'ok ok', 'cool', 'top', 'nickel',
  'parfait', 'merci', 'thx', 'ty', 'oki doki', 'ca marche', 'ca roule', 'nice', 'great', 'sure', 'np', 'soit', 'bien',
  'carrement', 'grave', 'wsh', 'wesh', 'jvois', 'jvois pas', 'ok merci', 'super',
  '👍', '👌', '🙏', '❤️', '🔥', '😂', '😅', '🙂', '😉', '🤝', '✅', '💪', '🙌', '😄', '😊', '👀',
]);

export class ConversationDynamicsAnalyzer {
  /**
   * Calcule la dynamique d'une conversation. `messages` doit être trié par
   * timestamp croissant (cf. DMMessageExtractor.getAll()). `seenReceipt` indique
   * si un « Vu / Seen » est affiché sous le dernier message envoyé.
   */
  analyze(messages: ExtractedMessage[], seenReceipt = false): ConversationDynamics {
    const sorted = [...messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const myMsgCount = sorted.filter((m) => m.isSent).length;
    const theirMsgCount = sorted.length - myMsgCount;

    const { theirAvgResponseMs, myAvgResponseMs } = this.computeResponseTimes(sorted);
    const theirResponseRate = this.computeTheirResponseRate(sorted);
    const briefReplyRatio = this.computeBriefReplyRatio(sorted);
    const cadenceTrend = this.computeCadenceTrend(sorted);

    const last = sorted[sorted.length - 1];
    const lastMessageIsSent = last ? last.isSent : false;
    const lastTs = last?.timestamp ?? null;
    const lastMessageAgeMs = lastTs != null ? Math.max(0, Date.now() - lastTs) : null;
    const seenNotAnswered = seenReceipt && lastMessageIsSent;

    const dyn: ConversationDynamics = {
      theirAvgResponseMs,
      myAvgResponseMs,
      theirResponseRate,
      briefReplyRatio,
      lastMessageIsSent,
      lastMessageAgeMs,
      seenNotAnswered,
      msgCount: sorted.length,
      myMsgCount,
      theirMsgCount,
      cadenceTrend,
      temperatureScore: 0,
      temperature: 'cold',
    };

    dyn.temperatureScore = this.scoreTemperature(dyn);
    dyn.temperature = this.toTemperature(dyn.temperatureScore);
    return dyn;
  }

  /** Conseils d'action générés à partir de la dynamique (règles, EN/FR selon `lang`). */
  buildAdvice(dyn: ConversationDynamics, lang: 'en' | 'fr' = 'en'): string[] {
    const tips: string[] = [];
    const tr = (en: string, fr: string) => (lang === 'fr' ? fr : en);

    // Balle dans son camp : il a vu / on attend sa réponse.
    if (dyn.seenNotAnswered) {
      tips.push(tr(
        'They saw your message without replying — follow up with a short, open question.',
        'Ton message a été vu sans réponse — relance avec une question courte et ouverte.'
      ));
    } else if (dyn.lastMessageIsSent && (dyn.lastMessageAgeMs ?? 0) > 2 * DAY) {
      tips.push(tr(
        'Your last message went unanswered — suggest a time slot or ask a simple question.',
        'Ton dernier message est resté sans réponse — propose un créneau ou pose une question simple.'
      ));
    }

    // Balle dans TON camp : ne pas le laisser refroidir.
    if (!dyn.lastMessageIsSent) {
      tips.push(tr(
        'They messaged last — reply quickly to keep the momentum.',
        'C\'est à toi de répondre — fais-le vite pour garder la dynamique.'
      ));
    }

    // Momentum élevé : profiter du moment.
    if (
      dyn.theirAvgResponseMs != null && dyn.theirAvgResponseMs < 1 * HOUR &&
      dyn.theirResponseRate >= 0.7 && dyn.temperature === 'hot'
    ) {
      tips.push(tr(
        'High momentum: this is the right time to pitch your offer or a call.',
        'Momentum élevé : c\'est le bon moment pour proposer ton offre ou un appel.'
      ));
    }

    // Réponses brèves : changer d'angle.
    if (dyn.briefReplyRatio > 0.6 && dyn.theirMsgCount >= 3) {
      tips.push(tr(
        'Short replies: switch angles with a question that needs more than a yes/no.',
        'Réponses courtes : change d\'angle avec une question qui demande plus qu\'un oui/non.'
      ));
    }

    // Refroidissement.
    if (dyn.temperature === 'cold' && (dyn.lastMessageAgeMs ?? 0) > 14 * DAY) {
      tips.push(tr(
        'Conversation has cooled off: a light nudge (react to a story, short natural message).',
        'La conversation s\'est refroidie : une relance légère (réagis à une story, message court et naturel).'
      ));
    }

    // Cadence en baisse.
    if (dyn.cadenceTrend === 'down' && dyn.temperature !== 'cold') {
      tips.push(tr(
        'Exchanges are slowing down — suggest a concrete next step before it fades.',
        'Les échanges ralentissent — propose une prochaine étape concrète avant que ça s\'éteigne.'
      ));
    }

    if (tips.length === 0) {
      tips.push(tr(
        'Stable relationship — keep in touch with a valuable message now and then.',
        'Relation stable — garde le contact avec un message utile de temps en temps.'
      ));
    }
    return tips;
  }

  // ==================== Calculs ====================

  /**
   * Temps de réponse moyens : à chaque changement d'émetteur entre deux messages
   * horodatés consécutifs, le délai est imputé à celui qui RÉPOND.
   */
  private computeResponseTimes(sorted: ExtractedMessage[]): {
    theirAvgResponseMs: number | null;
    myAvgResponseMs: number | null;
  } {
    const theirs: number[] = [];
    const mine: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.isSent === cur.isSent) continue; // pas une réponse
      if (prev.timestamp == null || cur.timestamp == null) continue;
      const delta = cur.timestamp - prev.timestamp;
      if (delta <= 0 || delta > 30 * DAY) continue; // ignore aberrations
      if (cur.isSent) mine.push(delta);
      else theirs.push(delta);
    }

    return {
      theirAvgResponseMs: theirs.length ? this.avg(theirs) : null,
      myAvgResponseMs: mine.length ? this.avg(mine) : null,
    };
  }

  /**
   * Taux de réponse du contact : on découpe la conversation en « blocs » de
   * messages envoyés consécutifs ; un bloc est « répondu » s'il est suivi d'un
   * message reçu. taux = blocs répondus / blocs envoyés.
   */
  private computeTheirResponseRate(sorted: ExtractedMessage[]): number {
    let blocks = 0;
    let answered = 0;
    let inSentBlock = false;

    for (const m of sorted) {
      if (m.isSent) {
        if (!inSentBlock) {
          blocks++;
          inSentBlock = true;
        }
      } else {
        if (inSentBlock) answered++;
        inSentBlock = false;
      }
    }
    if (blocks === 0) return 0;
    return Math.min(1, answered / blocks);
  }

  /** Part des messages reçus qui sont « brefs » (acquiescement / emoji seul). */
  private computeBriefReplyRatio(sorted: ExtractedMessage[]): number {
    const received = sorted.filter((m) => !m.isSent);
    if (received.length === 0) return 0;
    const brief = received.filter((m) => this.isBrief(m.text)).length;
    return brief / received.length;
  }

  private isBrief(text: string): boolean {
    const t = (text || '').trim().toLowerCase();
    if (!t) return false;
    if (t.length <= 4) return true;
    if (BRIEF_TOKENS.has(t)) return true;
    // Phrase d'un ou deux mots très courts.
    const words = t.split(/\s+/);
    if (words.length <= 2 && t.length <= 12 && words.every((w) => BRIEF_TOKENS.has(w) || w.length <= 5)) {
      return true;
    }
    return false;
  }

  /**
   * Tendance de cadence : compare l'écart moyen entre messages sur la 1ʳᵉ moitié
   * vs la 2ᵉ moitié de la conversation. Des écarts plus courts = accélération.
   */
  private computeCadenceTrend(sorted: ExtractedMessage[]): 'up' | 'down' | 'flat' {
    const ts = sorted.map((m) => m.timestamp).filter((t): t is number => t != null);
    if (ts.length < 6) return 'flat';

    const gaps: number[] = [];
    for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);

    const mid = Math.floor(gaps.length / 2);
    const firstAvg = this.avg(gaps.slice(0, mid));
    const secondAvg = this.avg(gaps.slice(mid));
    if (firstAvg === 0 || secondAvg === 0) return 'flat';

    const ratio = secondAvg / firstAvg;
    if (ratio < 0.7) return 'up'; // écarts plus courts → ça s'accélère
    if (ratio > 1.4) return 'down'; // écarts plus longs → ça ralentit
    return 'flat';
  }

  /**
   * Score de température 0-100 à partir d'une base neutre (50) ajustée par les
   * signaux comportementaux. Bornes saturées dans [0, 100].
   */
  private scoreTemperature(d: ConversationDynamics): number {
    let s = 50;

    // Le contact répond-il ? (signal le plus fort)
    s += d.theirResponseRate * 25 - 5; // 0% → -5, 100% → +20

    // À quelle vitesse répond-il ?
    if (d.theirAvgResponseMs != null) {
      if (d.theirAvgResponseMs < 1 * HOUR) s += 15;
      else if (d.theirAvgResponseMs < 6 * HOUR) s += 10;
      else if (d.theirAvgResponseMs < 1 * DAY) s += 5;
      else if (d.theirAvgResponseMs > 3 * DAY) s -= 10;
    }

    // Récence : une relation vivante a échangé récemment.
    if (d.lastMessageAgeMs != null) {
      if (d.lastMessageAgeMs < 2 * DAY) s += 15;
      else if (d.lastMessageAgeMs < 7 * DAY) s += 5;
      else if (d.lastMessageAgeMs > 30 * DAY) s -= 30;
      else if (d.lastMessageAgeMs > 14 * DAY) s -= 20;
    }

    // Balle dans son camp depuis longtemps → ghosting probable.
    if (d.lastMessageIsSent && (d.lastMessageAgeMs ?? 0) > 2 * DAY) s -= 15;
    if (d.seenNotAnswered) s -= 10;

    // Réponses brèves → engagement faible.
    if (d.briefReplyRatio > 0.6) s -= 10;
    else if (d.briefReplyRatio > 0.4) s -= 5;

    // Tendance de cadence.
    if (d.cadenceTrend === 'up') s += 10;
    else if (d.cadenceTrend === 'down') s -= 10;

    return Math.max(0, Math.min(100, Math.round(s)));
  }

  private toTemperature(score: number): Temperature {
    if (score >= 66) return 'hot';
    if (score >= 33) return 'warm';
    return 'cold';
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
