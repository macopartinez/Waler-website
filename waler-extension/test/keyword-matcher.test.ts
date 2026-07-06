/**
 * Tests du keyword matcher (déterministe, tolérant aux fautes de frappe).
 * Exécution : npx tsx waler-extension/test/keyword-matcher.test.ts
 */

import { matchKeyword, normalize, editDistance } from '../src/content/keyword-matcher.js';

let pass = 0, fail = 0;
const fails: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log(`  ❌ FAIL: ${name}`); }
}

const KW = ['GUIDE', 'FORMATION', 'appel offert', 'PDF'];

// ===== normalize =====
check('normalize accents + casse', normalize('Général!') === 'general');
check('normalize emojis → séparateur', normalize('guide 🙌🔥') === 'guide');
check('normalize compacte espaces', normalize('  a   b  ') === 'a b');

// ===== editDistance (OSA / Damerau) =====
check('editDistance égal = 0', editDistance('guide', 'guide') === 0);
check('editDistance 1 substitution', editDistance('guide', 'guode') === 1);
check('editDistance transposition = 1', editDistance('guide', 'guied') === 1);

// ===== match exact / casse / ponctuation / emoji =====
check('exact', matchKeyword('GUIDE', KW) === 'GUIDE');
check('casse', matchKeyword('guide stp', KW) === 'GUIDE');
check('ponctuation collée', matchKeyword('Guide!', KW) === 'GUIDE');
check('emoji autour', matchKeyword('je veux le guide 🙌', KW) === 'GUIDE');
check('mot-clé au milieu', matchKeyword('coucou envoie moi le PDF please', KW) === 'PDF');

// ===== fautes de frappe =====
check('faute 1 (formation→formaton)', matchKeyword('je veux la formaton', KW) === 'FORMATION');
check('faute 1 (guide→guode)', matchKeyword('le guode svp', KW) === 'GUIDE');

// ===== multi-mots =====
check('multi-mots exact', matchKeyword('je veux un appel offert', KW) === 'appel offert');
check('multi-mots faute', matchKeyword('un apel offert stp', KW) === 'appel offert');

// ===== non-match (pas de faux positifs) =====
check('non-match texte neutre', matchKeyword('super post, bravo à toi', KW) === null);
check('non-match mot proche mais court exclu', matchKeyword('pda', ['PDF']) === null); // len 3 → exact seul
check('non-match trop de fautes', matchKeyword('guidZZ complètement différent', ['GUIDE']) === null);
check('non-match liste vide', matchKeyword('guide', []) === null);
check('non-match texte vide', matchKeyword('', KW) === null);

// ===== résumé =====
console.log(`\n${fail === 0 ? '✅' : '❌'} keyword-matcher : ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log('Échecs :', fails);
  process.exit(1);
}
