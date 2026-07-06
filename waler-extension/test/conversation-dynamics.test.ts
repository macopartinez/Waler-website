/**
 * Tests de la dynamique de conversation — focus sur les DEUX nouveaux signaux
 * d'engagement : réponses reçues à mes STORIES et à mes REELS.
 * Exécution : npx tsx waler-extension/test/conversation-dynamics.test.ts
 *
 * On vérifie que : (1) l'extracteur tague bien ces bulles (comptage), (2) le
 * score de température ÉVOLUE avec le nombre de réponses (rendements décroissants
 * mais monotone), (3) seules les réponses REÇUES comptent (pas les miennes).
 */

import { ConversationDynamicsAnalyzer } from '../src/content/conversation-dynamics.js';
import type { ExtractedMessage, MessageKind } from '../src/content/dm-message-extractor.js';

const dyn = new ConversationDynamicsAnalyzer();

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log(`  ❌ FAIL: ${name}`); }
}

let seq = 0;
const msg = (isSent: boolean, kind: MessageKind = 'text', text = 'x'): ExtractedMessage => ({
  messageId: `m${seq++}`,
  text,
  isSent,
  timestamp: Date.now() - (100 - seq) * 60_000, // récents, ordonnés
  reactions: [],
  kind,
  order: seq,
});

// Base commune : une conversation tiède sans réponse story/reel, pour isoler
// l'effet des nouveaux signaux (même trame, on ajoute juste des réponses).
const base = (): ExtractedMessage[] => [
  msg(true), msg(false), msg(true), msg(false),
];

// ===== 1. Comptage des réponses story / reel (uniquement les reçues) =====
{
  const d = dyn.analyze([
    ...base(),
    msg(false, 'story-reply'),
    msg(false, 'reel-reply'),
    msg(true, 'story-reply'), // MA réponse à SA story → ne doit PAS compter
  ]);
  check('compte 1 réponse story reçue', d.storyReplyCount === 1);
  check('compte 1 réponse reel reçue', d.reelReplyCount === 1);
}

// ===== 2. Le score ÉVOLUE avec le nombre de réponses (monotone croissant) =====
{
  const withN = (n: number, kind: MessageKind) =>
    dyn.analyze([...base(), ...Array.from({ length: n }, () => msg(false, kind))]).temperatureScore;

  const s0 = dyn.analyze(base()).temperatureScore;
  const s1 = withN(1, 'story-reply');
  const s2 = withN(2, 'story-reply');
  const s3 = withN(3, 'story-reply');

  check('1 réponse story réchauffe le score', s1 > s0);
  check('2 réponses > 1 réponse', s2 > s1);
  check('3 réponses >= 2 réponses (monotone)', s3 >= s2);
  check('rendements décroissants (gain 2→3 <= gain 0→1)', (s3 - s2) <= (s1 - s0));
}

// ===== 3. Story et reel sont deux signaux CUMULABLES =====
{
  const sStoryOnly = dyn.analyze([...base(), msg(false, 'story-reply'), msg(false, 'story-reply')]).temperatureScore;
  const sBoth = dyn.analyze([...base(), msg(false, 'story-reply'), msg(false, 'reel-reply')]).temperatureScore;
  // Deux types différents (1+1) cumulent plus que 2 du même type (rendement décroissant).
  check('story + reel cumulent (2 types > 2 du même)', sBoth > sStoryOnly);
}

// ===== 4. Conseil déclenché quand l'engagement entrant est marqué =====
{
  const d = dyn.analyze([...base(), msg(false, 'story-reply'), msg(false, 'reel-reply')]);
  const fr = dyn.buildAdvice(d, 'fr');
  const en = dyn.buildAdvice(d, 'en');
  check('conseil FR mentionne stories/reels', fr.some((t) => /stories\/reels/i.test(t)));
  check('conseil EN mentionne stories/reels', en.some((t) => /stories\/reels/i.test(t)));
}

// ===== 5. Aucun signal → pas de bonus ni de conseil dédié =====
{
  const d = dyn.analyze(base());
  check('aucune réponse story/reel', d.storyReplyCount === 0 && d.reelReplyCount === 0);
  check('pas de conseil engagement si aucun signal', !dyn.buildAdvice(d, 'fr').some((t) => /stories\/reels/i.test(t)));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} conversation-dynamics: ${pass} pass, ${fail} fail`);
if (fail > 0) { console.log('Échecs:', fails); process.exit(1); }
