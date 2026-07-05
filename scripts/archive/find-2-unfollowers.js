/**
 * find-2-unfollowers.js
 *
 * ⚠️ CONTEXTE D'EXÉCUTION — le plus important :
 * Ce script a besoin À LA FOIS de `chrome.storage` ET du DOM (`document`).
 * Seul le CONTENT SCRIPT de l'extension sur l'onglet Instagram a les deux.
 *   - PAS la console normale de la page (chrome.storage absent).
 *   - PAS le Service Worker (document absent).
 * → Ouvre l'onglet Instagram (ta page de profil), F12 → Console, puis dans le
 *   menu déroulant en haut de la Console (libellé "top"), choisis le contexte
 *   du content script de l'extension Waler. Ensuite colle ce script.
 *
 * AVANT : ouvre manuellement le modal "followers" (clique sur "213 followers").
 *
 * Le script lit la base locale, scrolle le modal, et affiche qui manque.
 * NB : ta base locale a DÉRIVÉ (ex. 221 usernames pour 213 followers réels) : elle
 * accumule sans élaguer. Le diff montrera donc TOUS les partants accumulés, pas
 * seulement ceux d'aujourd'hui — ils ne sont pas datables côté local.
 */

(async function find2Unfollowers() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- 0. Garde-fou de contexte : explique précisément quoi faire -------------
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.error('⛔ Mauvais contexte : `chrome.storage` indisponible.');
    console.error('   → Console de la PAGE détectée. Change le contexte (menu "top" en haut');
    console.error('     de la Console) et choisis le content script de l\'extension Waler.');
    return;
  }
  if (typeof document === 'undefined') {
    console.error('⛔ Mauvais contexte : pas de DOM (tu es dans le Service Worker).');
    console.error('   → Lance-le depuis l\'onglet Instagram, contexte content script Waler.');
    return;
  }

  // --- 1. Résoudre la clé namespacée du compte actif --------------------------
  const meta = await chrome.storage.local.get(['activeDsUserId', 'primaryDsUserId']);
  const active = meta.activeDsUserId || null;
  const primary = meta.primaryDsUserId || null;
  const isSecondary = active && primary && active !== primary;
  const dbKey = isSecondary ? `acct:${active}:followerDatabase` : 'followerDatabase';

  const store = await chrome.storage.local.get(dbKey);
  const db = store[dbKey];

  if (!db || !db.followers) {
    console.error('❌ Aucune base de followers trouvée (clé:', dbKey, ')');
    console.log('   → Fais d\'abord un scan initial depuis le popup de l\'extension.');
    return;
  }

  const previous = Object.keys(db.followers);
  console.log(`📦 Base lue: ${dbKey}`);
  console.log(`📊 Usernames RÉELS dans la base : ${previous.length}`);
  console.log(`📊 totalCount affiché par la base : ${db.totalCount}`);
  if (previous.length !== db.totalCount) {
    console.warn(
      `⚠️ Incohérence: la map contient ${previous.length} usernames mais totalCount=${db.totalCount}.` +
      ` Le compteur a été mis à jour sans les usernames → diff peu fiable.`
    );
  }

  // --- 2. Scroller le modal followers déjà ouvert -----------------------------
  const modal = document.querySelector('[role="dialog"]');
  if (!modal) {
    console.error('❌ Modal followers introuvable. Ouvre d\'abord ta liste de followers, puis relance.');
    return;
  }

  // Conteneur scrollable du modal
  const scrollBox =
    modal.querySelector('div[style*="overflow"]') ||
    Array.from(modal.querySelectorAll('div')).find(
      (d) => d.scrollHeight > d.clientHeight + 50
    );
  if (!scrollBox) {
    console.error('❌ Conteneur scrollable du modal introuvable.');
    return;
  }

  const current = new Set();
  const collect = () => {
    modal.querySelectorAll('a[href^="/"]').forEach((a) => {
      const m = a.getAttribute('href').match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (!m) return;
      const u = m[1].toLowerCase();
      const system = ['explore', 'reels', 'direct', 'p', 'stories', 'tv', 'accounts'];
      if (!system.includes(u)) current.add(u);
    });
  };

  console.log('🔄 Scroll du modal en cours...');
  let stable = 0;
  let lastSize = 0;
  for (let i = 0; i < 60 && stable < 4; i++) {
    collect();
    scrollBox.scrollTop = scrollBox.scrollHeight;
    await sleep(700);
    if (current.size === lastSize) stable++;
    else stable = 0;
    lastSize = current.size;
    if (i % 5 === 0) console.log(`   ...${current.size} followers collectés`);
  }
  collect();
  console.log(`✅ Followers actuels collectés : ${current.size}`);

  // --- 3. Diff (insensible à la casse) ----------------------------------------
  const prevLower = previous.map((u) => u.toLowerCase());
  const missing = prevLower.filter((u) => !current.has(u)); // ont unfollow / disparu
  const added = [...current].filter((u) => !prevLower.includes(u)); // nouveaux

  // Départs DÉJÀ connus/datés côté backend (table `unfollowers` de @pako_mrtz).
  // Tout "manquant" qui n'est PAS dans cette liste = NOUVEAU départ (aujourd'hui).
  const KNOWN_BACKEND_UNFOLLOWERS = new Set([
    'iguana.7628669',
    'geoffroy_422',
    'emmaa.roussel',
    't0m.pei',
    'socialuhq',
    'lone.filmofficiel',
    'josh.whistle.meme',
  ]);
  const fresh = missing.filter((u) => !KNOWN_BACKEND_UNFOLLOWERS.has(u));
  const known = missing.filter((u) => KNOWN_BACKEND_UNFOLLOWERS.has(u));

  console.log('\n========== RÉSULTAT ==========');
  console.log(`🚫 TOTAL manquants (base − liste actuelle) : ${missing.length}`);
  console.log(`\n🔥 NOUVEAUX départs (PAS encore connus du backend = tes unfollowers du jour) : ${fresh.length}`);
  fresh.forEach((u, i) => console.log(`   ${i + 1}. @${u}  →  https://instagram.com/${u}/`));
  console.log(`\n🗂️ Déjà connus/datés (historique backend) : ${known.length}`);
  known.forEach((u, i) => console.log(`   ${i + 1}. @${u}`));
  console.log(`\n🆕 Nouveaux followers (dans la liste, pas en base) : ${added.length}`);
  added.forEach((u, i) => console.log(`   ${i + 1}. @${u}`));

  if (missing.length === 0) {
    console.log(
      '\nℹ️ Aucun manquant : la base avait déjà été nettoyée à 213 par un scan ' +
      'automatique antérieur. Les 2 unfollowers n\'y figurent plus — vérifie la ' +
      'table backend `unfollowers` (ils y ont peut-être été enregistrés via TRACK_UNFOLLOWER).'
    );
  } else if (current.size < previous.length - missing.length) {
    console.warn(
      '\n⚠️ Le scan a peut-être chargé moins de followers que prévu (cache IG / scroll ' +
      'incomplet). Re-scrolle manuellement jusqu\'en bas puis relance pour fiabiliser.'
    );
  }
})();
