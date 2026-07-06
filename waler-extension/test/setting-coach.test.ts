/**
 * Batterie de tests du moteur de setting (déterministe, sans IA).
 * Exécution : npx tsx waler-extension/test/setting-coach.test.ts
 *
 * Objectif : MESURER (pas supposer) la solidité — détection de phase, négation,
 * langue, signaux d'achat, et surtout les FAUX POSITIFS sur du bavardage neutre.
 * Certains cas sont marqués `xfail` : limites connues d'un moteur par mots-clés.
 */

import { SettingCoach } from '../src/content/setting-coach.js';
import type { ExtractedMessage } from '../src/content/dm-message-extractor.js';

const coach = new SettingCoach();

const them = (text: string): ExtractedMessage => ({ messageId: Math.random().toString(), text, isSent: false, timestamp: null, reactions: [] });
const conv = (...texts: string[]) => texts.map(them);

let pass = 0, fail = 0, xfail = 0, xpass = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, opts: { xfail?: boolean } = {}) {
  if (opts.xfail) {
    if (cond) { xpass++; console.log(`  ⚠️  XPASS (limite finalement OK): ${name}`); }
    else { xfail++; console.log(`  ⏳ xfail (limite connue): ${name}`); }
    return;
  }
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log(`  ❌ FAIL: ${name}`); }
}

// ===== 1. Progression de phase (FR) =====
check('connexion par défaut (msg vide)', coach.analyze(conv('coucou')).phase === 'connexion');
check('objectif → situation', coach.analyze(conv('salut, je veux lancer mon business en ligne')).phase === 'situation');
check('situation → probleme', coach.analyze(conv('je veux scaler', 'je fais du freelance depuis 2 ans, je gagne 2000 par mois')).phase === 'probleme');
{
  const r = coach.analyze(conv('je veux percer', 'je fais du dropshipping depuis 1 an', 'mais là je galère, je stagne et je perds de l\'argent'));
  check('pain + situation → transition', r.phase === 'transition');
  check('readiness élevée si tout révélé', (r.summary.qualificationScore ?? 0) >= 50);
}

// ===== 2. Phase (EN) + langue de sortie =====
{
  const r = coach.analyze(conv('hey, i want to grow my agency', 'i run an smma, been doing it for a year, i make 3k a month', 'but i\'m stuck and losing money'));
  check('EN: transition', r.phase === 'transition');
  check('EN: conseil en anglais', /Transition — offer the call/.test(r.nextStep));
}
check('FR: conseil en français', /Transition — propose le call/.test(
  coach.analyze(conv('je veux scaler', 'je gère mon agence depuis 2 ans', 'mais je galère et je perds de l\'argent')).nextStep
));

// ===== 3. Négation (le cœur de la robustesse) =====
check('négation: "je galère pas" → pas de pain', coach.analyze(conv('je galère pas du tout en ce moment')).summary.revealed.pain === false);
check('négation bornée par "mais": "galère pas MAIS veux scaler"',
  coach.analyze(conv('je galère pas mais je veux scaler mon business')).summary.revealed.pain === false);
check('affirmation simple: "je galère" → pain', coach.analyze(conv('je galère vraiment là')).summary.revealed.pain === true);

// ===== 4. Signaux d'achat / émotion =====
check('signal achat: "ça coûte combien ?"', coach.analyze(conv('ok et ça coûte combien ?')).buyingSignal === true);
check('sceptique > chaud (le doute gagne)',
  coach.analyze(conv('mouais, ça a l\'air trop beau pour être vrai franchement')).emotionalState === 'skeptical');

// ===== 5. Routage d'offre =====
check('offre low-ticket si débutant sans business',
  /low-ticket/i.test(coach.analyze(conv('je veux me lancer', 'je suis étudiant, je débute', 'je sais pas par où commencer')).summary.recommendedOffer || ''));
check('offre call si a déjà une activité',
  /call/i.test(coach.analyze(conv('je veux scaler', 'je gère mon agence smma depuis 2 ans', 'mais je stagne')).summary.recommendedOffer || ''));

// ===== 6. Momentum + prédiction (avec dynamique stub) =====
{
  const dyn: any = { theirAvgResponseMs: 10 * 60 * 1000, myAvgResponseMs: null, theirResponseRate: 0.9, briefReplyRatio: 0.1, lastMessageIsSent: false, lastMessageAgeMs: 3600 * 1000, seenNotAnswered: false, msgCount: 6, myMsgCount: 3, theirMsgCount: 3, cadenceTrend: 'up', temperatureScore: 80, temperature: 'hot' };
  const r = coach.analyze(conv('je veux scaler', 'je gère mon agence depuis 2 ans', 'mais je galère', 'ça coûte combien on commence quand ?'), dyn);
  check('momentum accelerating si dynamique chaude', r.summary.momentum === 'accelerating');
  check('closeProbability haute si qualifié + momentum', (r.summary.closeProbability ?? 0) >= 65);
  check('priority = close', r.summary.priority === 'close');
}
{
  const dynCold: any = { theirAvgResponseMs: null, myAvgResponseMs: null, theirResponseRate: 0.2, briefReplyRatio: 0.8, lastMessageIsSent: true, lastMessageAgeMs: 5 * 24 * 3600 * 1000, seenNotAnswered: true, msgCount: 4, myMsgCount: 3, theirMsgCount: 1, cadenceTrend: 'down', temperatureScore: 20, temperature: 'cold' };
  const r = coach.analyze(conv('je veux scaler', 'je gère mon business', 'mais je galère'), dynCold);
  check('momentum cooling si ghosting', r.summary.momentum === 'cooling');
  check('priority = reengage si refroidit', r.summary.priority === 'reengage');
}

// ===== 7. FAUX POSITIFS — bavardage neutre ne doit RIEN déclencher =====
{
  const neutral = coach.analyze(conv('salut ça va ? trop cool ta story de hier 😂'));
  check('neutre: pas de pain', neutral.summary.revealed.pain === false);
  check('neutre: pas de signal achat', neutral.buyingSignal === false);
  check('neutre: reste en connexion', neutral.phase === 'connexion');
}
{
  const compliment = coach.analyze(conv('bravo pour ton parcours, t\'es une inspiration 🙏'));
  check('compliment: pas de pain', compliment.summary.revealed.pain === false);
}

// ===== 8. Tactiques de closing (enrichies via analyse de reels de closing) =====
check('prix demandé sans qualification → garde le cadre, ne donne pas le prix',
  /ne donne pas le prix/i.test(coach.analyze(conv('salut ça coûte combien ton programme ?')).summary.closingTactic || ''));
check('prix demandé sans qualification → priority reste qualify',
  coach.analyze(conv('salut ça coûte combien ton programme ?')).summary.priority === 'qualify');
check('objection budget → recadrage "comparé à quoi"',
  /compar[ée] à quoi/i.test(coach.analyze(conv('c\'est trop cher pour moi')).summary.closingTactic || ''));
check('objection autorité (conjoint) → décision plutôt que question',
  /décision/i.test(coach.analyze(conv('faut que j\'en parle à mon copain avant de me décider')).summary.closingTactic || ''));
check('scepticisme → script 2 étapes (raconter puis demander ce qu\'il faut voir)',
  /raconter|PRÉCISÉMENT/.test(coach.analyze(conv('c\'est une arnaque ton truc ?')).summary.closingTactic || ''));

// ===== 9. LIMITES CONNUES (xfail attendus) =====
check('[limite] sarcasme: "ouais c\'est sûr, des résultats garantis lol" mal lu',
  coach.analyze(conv('ouais c\'est sûr, des "résultats garantis" mdr')).emotionalState !== 'hot', { xfail: true });
check('[limite] langue sur message ultra-court ("ok")',
  coach.analyze(conv('ok')).lang === 'en', { xfail: true });
check('[limite] négation à cheval sur 2 propositions (virgule perdue)',
  coach.analyze(conv('ça a l\'air trop beau pour être vrai, c\'est pas une arnaque ?')).emotionalState === 'skeptical', { xfail: true });

// ===== Résumé =====
console.log('\n──────── RÉSULTAT ────────');
console.log(`✅ pass: ${pass}   ❌ fail: ${fail}   ⏳ xfail (limites): ${xfail}   ⚠️ xpass: ${xpass}`);
if (fails.length) { console.log('\nÉchecs réels :'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
