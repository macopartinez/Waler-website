// ──────────────────────────────────────────────────────────────────────────
// Backend de l'extension — SOURCE UNIQUE de l'URL.
//
// La valeur est injectée À LA COMPILATION par esbuild (build.js) via `define` :
//   • `npm run build`    → DEV  : http://localhost:5000   (défaut)
//   • `npm run package`  → PROD : https://waler.website   (forcé : package-extension.js
//                                  exporte WALER_API_BASE avant le build)
//
// ⇒ Le ZIP publié sur le store pointe TOUJOURS vers la prod, même si la ligne de
//   secours ci-dessous est restée sur localhost. Plus aucun risque de livrer
//   localhost par erreur — c'est précisément ce qui a fait refuser la v1.0.1
//   (motif Chrome Web Store « Red Potassium » : sign-in qui ouvre localhost).
// ──────────────────────────────────────────────────────────────────────────
declare const __WALER_API_BASE__: string;

// Remplacé LITTÉRALEMENT par esbuild (define). Toutes les voies de compilation
// (npm run build | dev | package) passent par build.js qui définit toujours
// cette constante → pas de fallback runtime, et AUCUNE chaîne "localhost" ne
// subsiste dans le bundle de prod.
export const API_BASE: string = __WALER_API_BASE__;

// Origine du site web (mêmes que l'API : le serveur sert l'app ET /api).
export const WEB_BASE = API_BASE;

// Préfixe des routes API.
export const API_URL = `${API_BASE}/api`;
