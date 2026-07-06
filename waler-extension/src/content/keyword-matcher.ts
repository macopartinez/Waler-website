/**
 * Keyword matcher (déterministe, sans IA) — détecte si un commentaire contient
 * l'un des mots-clés de campagne du compte (mécanique « commente GUIDE »).
 *
 * Tourne EN LOCAL dans l'extension : on lit le texte du commentaire, on matche,
 * et seul le mot-clé CANONIQUE trouvé quitte l'extension (jamais le texte brut).
 *
 * Tolérance aux fautes de frappe : normalisation (casse/accents/emojis/ponctuation)
 * puis distance de Levenshtein bornée selon la longueur du mot-clé. Couvre
 * « guide », « Guide! », « GUIDE 🙌 », « guied », « gujde ».
 */

/**
 * Normalise un texte pour la comparaison : minuscules, accents retirés,
 * emojis/ponctuation → espaces, espaces compactés. Ne garde que lettres/chiffres
 * (unicode) et espaces.
 */
export function normalize(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques (accents)
    .toLowerCase()
    // Tout ce qui n'est ni lettre ni chiffre (unicode) devient un séparateur.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Distance d'édition « Optimal String Alignment » (Damerau-Levenshtein restreint) :
 * insertion/suppression/substitution + transposition de deux caractères adjacents,
 * chacune de coût 1. La transposition (faute de frappe très courante, ex.
 * « guied » → « guide ») compte donc pour UNE faute et non deux.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // suppression
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return d[m][n];
}

/** Seuil de tolérance (nb de fautes admises) selon la longueur du mot-clé. */
function fuzzyThreshold(len: number): number {
  if (len <= 3) return 0; // trop court → exact seulement (évite les faux positifs)
  if (len <= 5) return 1;
  return 2;
}

/**
 * Renvoie le mot-clé CANONIQUE (tel que défini par l'utilisateur) détecté dans
 * `text`, ou `null`. Priorité au match exact, puis au fuzzy (plus petite distance).
 *
 * - mot-clé mono-token : comparé à chaque token du commentaire.
 * - mot-clé multi-tokens (ex. « appel offert ») : comparé aux fenêtres glissantes
 *   de tokens de même taille.
 */
export function matchKeyword(text: string, keywords: string[]): string | null {
  if (!text || !keywords || keywords.length === 0) return null;

  const normText = normalize(text);
  if (!normText) return null;
  const tokens = normText.split(' ');

  let best: { keyword: string; dist: number } | null = null;

  for (const raw of keywords) {
    const canonical = (raw || '').trim();
    if (!canonical) continue;
    const normKw = normalize(canonical);
    if (!normKw) continue;

    const kwTokens = normKw.split(' ');
    const threshold = fuzzyThreshold(normKw.replace(/\s/g, '').length);

    if (kwTokens.length === 1) {
      // Comparaison à chaque token du commentaire.
      for (const tok of tokens) {
        const d = tok === normKw ? 0 : editDistance(tok, normKw);
        if (d <= threshold && (!best || d < best.dist)) {
          best = { keyword: canonical, dist: d };
          if (d === 0) break;
        }
      }
    } else {
      // Fenêtres glissantes de la même taille que le mot-clé multi-mots.
      const win = kwTokens.length;
      for (let i = 0; i + win <= tokens.length; i++) {
        const phrase = tokens.slice(i, i + win).join(' ');
        const d = phrase === normKw ? 0 : editDistance(phrase, normKw);
        if (d <= threshold && (!best || d < best.dist)) {
          best = { keyword: canonical, dist: d };
          if (d === 0) break;
        }
      }
    }
    if (best && best.dist === 0) break; // match parfait : inutile de continuer
  }

  return best ? best.keyword : null;
}
