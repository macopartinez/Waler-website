/**
 * Unfollower Detector
 * 
 * Orchestrateur principal pour la détection et classification des unfollowers
 * - Scan complet des followers actuels
 * - Comparaison avec la base de données
 * - Recherche automatique des IDs manquants
 * - Classification: unfollow / blocked / deleted
 */

import { InstagramModalScroller } from './instagram-modal-scroller.js';
import { InstagramSearchAutomator } from './instagram-search-automator.js';
import { ProfileAnalyzer } from './profile-analyzer.js';
// Stockage ISOLÉ par compte Instagram actif : la détection/le compteur
// d'unfollowers et la base de followers appartiennent au compte courant. Les lire
// /écrire en global contaminait le compte principal (faux « 211 » partout).
import { accountGet, accountSet } from '../background/account-storage.js';
// Backoff partagé avec le scroller budgété : un rate-limit détecté ICI doit
// aussi mettre en pause un baseline en cours pour ce compte (même signal de
// risque, même compte Instagram).
import { isRateLimitSignal, triggerBackoff } from './scan-budget.js';

export interface UnfollowerAnalysisResult {
  totalMissing: number;
  unfollowed: string[];
  blocked: string[];
  notFoundOnInstagram: string[];
  errors: string[];
  // true = analyse ABANDONNÉE (scan incomplet) plutôt qu'un vrai « 0 unfollower ».
  // Le caller doit alors afficher un avertissement, pas « analyse réussie ».
  aborted?: boolean;
}

// Résultat de la récupération API des followers : la liste pk→username + un
// drapeau `complete` (pagination terminée naturellement, sans troncature). On se
// fie à `complete` — PAS à une comparaison avec un compteur potentiellement
// périmé — pour décider si la liste est exploitable.
type ApiFollowers = { map: Map<string, string>; complete: boolean };

export class UnfollowerDetector {
  private scroller: InstagramModalScroller;
  private searcher: InstagramSearchAutomator;
  private analyzer: ProfileAnalyzer;
  private isRunning: boolean = false;
  private maxSearches: number = 20;
  private searchCount: number = 0;

  constructor() {
    this.scroller = new InstagramModalScroller({
      maxScrollAttempts: 6,
      scrollDelay: 400,
      waitForLoadTimeout: 8000,
    });
    this.searcher = new InstagramSearchAutomator();
    this.analyzer = new ProfileAnalyzer();
  }

  /**
   * Lance l'analyse complète des unfollowers
   */
  async analyzeUnfollowers(currentUsername: string): Promise<UnfollowerAnalysisResult> {
    if (this.isRunning) {
      throw new Error('Analysis already in progress');
    }

    this.isRunning = true;
    this.searchCount = 0;

    const result: UnfollowerAnalysisResult = {
      totalMissing: 0,
      unfollowed: [],
      blocked: [],
      notFoundOnInstagram: [],
      errors: [],
    };

    try {
      console.log('🎬 Starting unfollower analysis...');

      // Phase 1 : obtenir la liste des followers ACTUELS. On PRIORISE la
      // pagination API (`fetchCurrentFollowersByPk`) — déjà nécessaire pour la
      // résolution des renames, déjà throttlée (600-1000ms/page), et dont la
      // complétude est garantie par la pagination elle-même (`next_max_id`
      // épuisé naturellement), pas par une heuristique. Le scroll DOM
      // (`scanCurrentFollowers`, qui EXIGE le modal déjà ouvert) ne sert plus
      // qu'en REPLI si l'API échoue/est incomplète (ex. compte > ~4000
      // followers, hors du cap de pagination) → moins d'activité Instagram
      // pour un résultat identique dans l'immense majorité des cas.
      console.log('📊 Phase 1: Fetching current followers via API (pk-based)...');
      const apiFollowers = await this.fetchCurrentFollowersByPk();
      const apiUsable = this.apiListUsable(apiFollowers);

      let currentFollowers: string[];
      if (apiUsable) {
        currentFollowers = Array.from(apiFollowers!.map.values());
        console.log(`✅ Current followers via API: ${currentFollowers.length} (scroll DOM évité)`);
      } else {
        console.log('ℹ️ Liste API followers indisponible/incomplète — repli sur le scroll DOM...');
        currentFollowers = await this.scanCurrentFollowers(currentUsername);
        console.log(`✅ Current followers via DOM: ${currentFollowers.length}`);

        // GARDE-FOU DE COMPLÉTUDE — ne s'applique QU'au repli DOM : ce scan-là
        // ne vaut que s'il a atteint le bas de la liste (validé contre le
        // compteur live). Le chemin API n'en a pas besoin : sa complétude est
        // déjà garantie par `apiUsable` (pagination épuisée naturellement).
        const liveCountForGate = (await accountGet('lastFollowerCount')).lastFollowerCount || 0;
        if (liveCountForGate > 0 && currentFollowers.length < liveCountForGate - 5) {
          console.warn(
            `⛔ Scan incomplet : ${currentFollowers.length} followers chargés pour ${liveCountForGate} réels. ` +
            `La modale n'a pas été défilée jusqu'en bas → analyse ANNULÉE pour éviter de FAUX unfollowers. ` +
            `Re-scrolle ta liste de followers jusqu'en bas, puis relance.`
          );
          // ABANDON (≠ « 0 unfollower ») : on ne touche NI au drapeau NI au badge.
          result.totalMissing = 0;
          result.aborted = true;
          return result;
        }
      }

      // Phase 2: Comparer avec la base de données
      console.log('📊 Phase 2: Comparing with database...');

      // 1. RÉSOUDRE LES RENAMES + backfiller les pk sur TOUTE la base, AVANT de
      //    calculer les manquants. Un rename NE CHANGE PAS le nombre de followers :
      //    on migre l'entrée (ancien→nouveau pseudo) par `pk`, au lieu de la voir
      //    comme un départ. Indépendant du cache DOM (qui peut encore afficher
      //    l'ancien pseudo — c'était la cause des faux départs sur rename).
      await this.syncPksAndRenames(apiFollowers);
      // 2. Ajouter les nouveaux followers vus au scan DOM (réconciliation additive),
      //    en leur attachant leur pk via l'API → renames FUTURS détectables.
      await this.reconcileDatabaseToScan(currentFollowers, apiFollowers);

      // Manquants calculés APRÈS résolution des renames (sinon un rename = faux
      // départ), puis on écarte ceux dont l'ID suit TOUJOURS (ratés par le scan DOM).
      let missingFollowers = await this.findMissingFollowers(currentFollowers);
      missingFollowers = await this.filterStillFollowing(missingFollowers, apiFollowers);
      result.totalMissing = missingFollowers.length;
      console.log(`🔍 Vrais manquants: ${missingFollowers.length}`);

      if (missingFollowers.length === 0) {
        // Le scan DOM n'a trouvé personne en moins. MAIS la modale followers est
        // souvent servie EN CACHE : juste après un départ, les partis restent
        // affichés quelques minutes → « 0 manquant » est un FAUX NÉGATIF fréquent.
        //
        // On tranche avec une source FIABLE du nombre courant : la taille de la
        // liste API (exhaustive, non mise en cache) si dispo, sinon le compteur
        // live. Si la base dépasse ce nombre ET que le compteur avait déjà détecté
        // une baisse (handleUnfollowers), il reste des départs masqués par le
        // cache → on CONSERVE la détection au lieu de la rétrograder à 0.
        const prior = await accountGet(['unfollowerDetected', 'unfollowerCount']);
        const dbSize = await this.getDatabaseSize();
        const liveCount = (await accountGet('lastFollowerCount')).lastFollowerCount || 0;
        const authoritativeCount = apiUsable ? apiFollowers!.map.size : liveCount;
        const expectedMissing = authoritativeCount > 0 ? Math.max(0, dbSize - authoritativeCount) : 0;

        if (prior.unfollowerDetected && expectedMissing > 0) {
          console.warn(
            `⚠️ Scan DOM = 0 manquant, mais base(${dbSize}) > followers réels(${authoritativeCount}) ` +
            `→ ${expectedMissing} départ(s) masqué(s) par le cache de la modale. ` +
            `Détection CONSERVÉE, réessaie l'identification dans quelques minutes.`
          );
          result.totalMissing = expectedMissing;
          // On garde le drapeau/badge déjà posés par le compteur live.
          await this.setUnfollowerBadge(expectedMissing);
          return result;
        }

        console.log('✅ No unfollowers detected (base cohérente avec les followers réels)');
        // Aucun unfollower confirmé : nettoyer toute détection obsolète + badge
        await accountSet({ unfollowerDetected: false, unfollowerCount: 0 });
        await this.setUnfollowerBadge(0);
        return result;
      }

      // L'analyse (scan de la modale) a détecté des unfollowers. On pose tout de
      // suite l'état de détection + le badge, SANS dépendre du compteur de
      // followers ni du diff (qui peut être faussé par le cache d'Instagram).
      await accountSet({
        unfollowerDetected: true,
        unfollowerCount: missingFollowers.length,
        unfollowerDetectedAt: Date.now(),
      });
      await this.setUnfollowerBadge(missingFollowers.length);

      // Fermer la modale followers (plus de navigation profil par profil).
      console.log('🚪 Closing followers modal...');
      await this.closeFollowersModal();
      await this.sleep(1500);

      // Phase 3 : CLASSIFICATION 100 % API (plus de window.location.href). Pour
      // CHAQUE manquant, un appel web_profile_info CONNECTÉ tranche « visible pour
      // toi » (→ unfollow) vs « invisible », puis un appel ANONYME distingue bloqué
      // vs supprimé. Aucune navigation = bien plus rapide et nettement moins
      // détectable par Instagram qu'une visite de chaque profil.
      console.log('📊 Phase 3: Classifying missing followers via API (no navigation)...');
      localStorage.removeItem('notificationCheckerAutoState');
      // Marqueur « analyse en cours » : chrome.storage pour le popup, localStorage
      // (forme légère, mode:'api') pour les gardes "pause" (notification-checker,
      // tracker) sans réintroduire d'état de navigation.
      await chrome.storage.local.set({ isAnalyzing: true });
      localStorage.setItem('unfollowerCheckState', JSON.stringify({
        startedAt: Date.now(), mode: 'api', total: missingFollowers.length,
      }));

      try {
        await this.classifyMissingViaApi(missingFollowers, result);
      } finally {
        // Quoi qu'il arrive, on lève le marqueur d'analyse.
        localStorage.removeItem('unfollowerCheckState');
        await chrome.storage.local.set({ isAnalyzing: false });
      }

      // ANTI-DÉRIVE : retirer de la base locale les comptes CONFIRMÉS non-followers
      // (les « te suit encore » ne sont dans aucune de ces listes → conservés).
      await this.pruneFromDatabase([
        ...result.unfollowed,
        ...result.blocked,
        ...result.notFoundOnInstagram,
      ]);

      // Phase 4 : envoyer les résultats au backend
      console.log('📊 Phase 4: Sending results to backend...');
      await this.sendResultsToBackend(result);

      // Détection traitée → effacer le drapeau + le badge.
      await accountSet({ unfollowerDetected: false, unfollowerCount: 0 });
      await this.setUnfollowerBadge(0);

      // Notifier popup + dashboard que l'analyse est terminée.
      try {
        await chrome.runtime.sendMessage({
          type: 'ANALYSIS_COMPLETED',
          data: {
            unfollowers: result.unfollowed.length,
            blocked: result.blocked.length,
            notFound: result.notFoundOnInstagram.length,
          },
        });
      } catch (msgError) {
        console.error('⚠️ Impossible d\'envoyer ANALYSIS_COMPLETED:', msgError);
      }

      console.log('✅ Unfollower analysis completed');
      console.log(`📊 Results: ${result.unfollowed.length} unfollows, ${result.blocked.length} blocked, ${result.notFoundOnInstagram.length} not found`);

      return result;

    } catch (error) {
      console.error('Error during unfollower analysis:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Scan complet des followers actuels via le modal — REPLI utilisé seulement
   * quand la pagination API (`fetchCurrentFollowersByPk`) est indisponible ou
   * incomplète (cf. `analyzeUnfollowers`). Ouvre le modal AUTOMATIQUEMENT s'il
   * n'est pas déjà affiché (via `openFollowersModal`), puis scrolle la liste.
   */
  private async scanCurrentFollowers(myUsername?: string): Promise<string[]> {
    try {
      let modal = document.querySelector('[role="dialog"]');
      if (!modal) {
        console.log('ℹ️ Modale followers non ouverte — ouverture automatique...');
        modal = await this.openFollowersModal(myUsername);
        if (!modal) {
          throw new Error(
            "Impossible d'ouvrir automatiquement la liste de tes followers. Ouvre-la manuellement (clique sur « followers » sur ton profil), puis relance l'analyse."
          );
        }
      }

      // Utiliser le scroller intelligent
      const followers = await this.scroller.scrollToEnd();
      return followers;

    } catch (error) {
      console.error('Error scanning current followers:', error);
      throw error;
    }
  }

  /**
   * Ouvre la modale des followers en cliquant sur le lien /followers/ de la page
   * de profil courante. Renvoie l'élément de la modale, ou null si le lien est
   * introuvable (typiquement : on n'est pas sur la page de profil).
   */
  private async openFollowersModal(myUsername?: string): Promise<Element | null> {
    // La cible n'est PAS forcément un <a> : sur les versions récentes le compteur
    // "215 followers" est un <span>/<div>/<button> avec un handler React (aucun
    // href). On cherche donc large et on clique l'ancêtre cliquable.
    const clickableAncestor = (el: HTMLElement): HTMLElement =>
      (el.closest('a, button, [role="button"], [role="link"], li') as HTMLElement) || el;

    const findTarget = (): HTMLElement | null => {
      // 1. Lien href (anciennes versions d'Instagram)
      if (myUsername) {
        const exact = document.querySelector(
          `a[href="/${myUsername}/followers/"]`
        ) as HTMLElement | null;
        if (exact) return exact;
      }
      const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const byHref = anchors.find((a) => {
        try {
          return /\/followers\/?$/.test(new URL(a.href, location.origin).pathname);
        } catch {
          return false;
        }
      });
      if (byHref) return byHref;

      // 2. Repli par le texte : élément COURT contenant "followers"/"abonnés"
      //    (on évite de matcher de gros conteneurs en bornant la longueur), puis
      //    on remonte à l'ancêtre cliquable.
      const candidates = (
        Array.from(document.querySelectorAll('a, span, button, div, li')) as HTMLElement[]
      )
        .filter((el) => {
          const t = (el.textContent || '').trim();
          return /\b(followers|abonn[ée]s?)\b/i.test(t) && t.length > 0 && t.length < 40;
        })
        .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);

      return candidates.length ? clickableAncestor(candidates[0]) : null;
    };

    let target: HTMLElement | null = null;
    for (let attempts = 0; attempts < 8 && !target; attempts++) {
      target = findTarget();
      if (!target) await this.sleep(500);
    }

    if (!target) {
      console.warn(
        '⚠️ Élément "followers" introuvable (es-tu sur ta page de profil ?).'
      );
      return null;
    }

    console.log('🔗 Cible followers trouvée:', target.tagName, (target.textContent || '').trim().slice(0, 30), '— ouverture...');
    target.scrollIntoView({ block: 'center' });
    target.click();

    // Attendre une modale qui ressemble VRAIMENT à une liste de followers
    // (≥3 liens de profil), pas n'importe quel dialog (menu, paramètres…).
    for (let i = 0; i < 12; i++) {
      await this.sleep(500);
      const modal = document.querySelector('[role="dialog"]');
      if (modal && modal.querySelectorAll('a[href^="/"]').length >= 3) {
        console.log('✅ Modale des followers ouverte');
        // Laisser le lazy-loading démarrer avant de scroller.
        await this.sleep(800);
        return modal;
      }
    }
    console.warn("⚠️ Clic effectué mais aucune liste de followers détectée");
    return null;
  }

  /**
   * Taille réelle de la base de followers (nombre d'usernames connus), pour le
   * garde-fou anti-faux-négatif. 0 si la base n'est pas initialisée.
   */
  private async getDatabaseSize(): Promise<number> {
    try {
      const stored = await accountGet('followerDatabase');
      return Object.keys(stored.followerDatabase?.followers || {}).length;
    } catch {
      return 0;
    }
  }

  /**
   * Compare les followers actuels avec la base de données
   */
  private async findMissingFollowers(currentFollowers: string[]): Promise<string[]> {
    try {
      // Charger la base de données de followers
      const stored = await accountGet('followerDatabase');
      const followerDatabase = stored.followerDatabase;

      if (!followerDatabase || !followerDatabase.followers) {
        console.warn('⚠️ No follower database found');
        return [];
      }

      const previousFollowers = Object.keys(followerDatabase.followers);
      console.log(`📊 Previous followers: ${previousFollowers.length}`);
      console.log(`📊 Current followers: ${currentFollowers.length}`);

      // Comparaison INSENSIBLE À LA CASSE / aux espaces : la base peut avoir été
      // remplie depuis l'API (casse canonique) tandis que le scroll lit le DOM —
      // un includes() sensible à la casse créait des faux "manquants" en masse.
      const currentSet = new Set(currentFollowers.map(u => u.toLowerCase().trim()));
      const missing = previousFollowers.filter(
        username => !currentSet.has(username.toLowerCase().trim())
      );

      console.log(`🔍 Missing followers: ${missing.length}`);
      return missing;

    } catch (error) {
      console.error('Error finding missing followers:', error);
      throw error;
    }
  }

  /**
   * ANTI-DÉRIVE : retire des usernames de la base locale de followers et
   * resynchronise `totalCount`. Appelé à la fin de l'analyse pour les comptes
   * confirmés non-followers (unfollowed / blocked / deleted), afin que la map ne
   * gonfle pas indéfiniment (cause de la dérive 221 vs 213). Insensible à la
   * casse pour matcher quel que soit l'origine (API canonique vs DOM).
   */
  private async pruneFromDatabase(usernames: string[]): Promise<void> {
    if (!usernames || usernames.length === 0) return;
    try {
      const stored = await accountGet('followerDatabase');
      const db = stored.followerDatabase;
      if (!db || !db.followers) return;

      const toRemove = new Set(usernames.map(u => u.toLowerCase().trim()));
      let removed = 0;
      for (const key of Object.keys(db.followers)) {
        if (toRemove.has(key.toLowerCase().trim())) {
          delete db.followers[key];
          removed++;
        }
      }
      if (removed === 0) return;

      db.totalCount = Object.keys(db.followers).length;
      db.lastScanDate = new Date().toISOString();
      await accountSet({ followerDatabase: db });
      console.log(`🧹 Base locale élaguée : ${removed} compte(s) retiré(s) → ${db.totalCount} followers`);
    } catch (error) {
      console.error('Error pruning follower database:', error);
    }
  }

  /**
   * Récupère TOUS les followers actuels via l'API Instagram (même source que la
   * modale) AVEC leur identifiant STABLE `pk`, en paginant via `next_max_id`.
   * Renvoie une Map pk→username, ou null si l'API échoue dès la 1ʳᵉ page (on
   * retombe alors sur le DOM seul). Le `pk` est insensible au renommage → c'est
   * lui qui permet de distinguer un VRAI départ d'un simple changement de pseudo.
   */
  private async fetchCurrentFollowersByPk(): Promise<ApiFollowers | null> {
    const m = document.cookie.match(/ds_user_id=(\d+)/);
    const userId = m?.[1];
    if (!userId) return null;

    const byPk = new Map<string, string>();
    let maxId: string | undefined;
    let complete = false;
    try {
      for (let page = 0; page < 80; page++) { // garde-fou : 80 pages × 50 = 4000
        const url =
          `https://www.instagram.com/api/v1/friendships/${userId}/followers/?count=50` +
          (maxId ? `&max_id=${encodeURIComponent(maxId)}` : '');
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'x-ig-app-id': '936619743392459',
            'x-requested-with': 'XMLHttpRequest',
          },
        });
        if (!res.ok) {
          console.log(`⚠️ [API followers] HTTP ${res.status} (page ${page})`);
          if (isRateLimitSignal(res.status)) {
            console.warn('🛑 [API followers] Rate-limit détecté — arrêt immédiat, backoff activé pour protéger le compte.');
            await triggerBackoff();
          }
          return page === 0 ? null : { map: byPk, complete: false };
        }
        const data = await res.json();
        // Instagram renvoie parfois un throttle en 200 (corps "please wait a few
        // minutes"/feedback_required) plutôt qu'un vrai 429 — mêmes conséquences.
        if (isRateLimitSignal(res.status, JSON.stringify(data))) {
          console.warn('🛑 [API followers] Signal de throttle détecté (200) — arrêt, backoff activé.');
          await triggerBackoff();
          return page === 0 ? null : { map: byPk, complete: false };
        }
        const users = data?.users;
        if (!Array.isArray(users)) return page === 0 ? null : { map: byPk, complete: false };

        for (const u of users) {
          const pk = u?.pk != null ? String(u.pk) : (u?.id != null ? String(u.id) : null);
          const username = typeof u?.username === 'string' ? u.username : null;
          if (pk && username) byPk.set(pk, username);
        }

        maxId = data?.next_max_id ? String(data.next_max_id) : undefined;
        if (!maxId) { complete = true; break; } // fin naturelle = liste exhaustive
        await this.sleep(600 + Math.random() * 400); // throttle anti rate-limit
      }
      // Si on sort par la limite de pages (maxId encore présent), la liste est tronquée.
      return { map: byPk, complete };
    } catch (e) {
      console.log('⚠️ [API followers] échec:', e);
      return byPk.size > 0 ? { map: byPk, complete: false } : null;
    }
  }

  /**
   * Liste API exploitable = pagination TERMINÉE naturellement (exhaustive) et non
   * vide. Prédicat PUR (aucun log) : on ne se compare PLUS à `lastFollowerCount`,
   * qui peut être périmé/cross-compte et rejetterait à tort une liste correcte.
   */
  private apiListUsable(api: ApiFollowers | null): boolean {
    return !!api && api.complete && api.map.size > 0;
  }

  /**
   * CROSS-CHECK ANONYME (bloqué vs supprimé). Depuis TON compte connecté, un
   * profil bloqué et un profil supprimé affichent le MÊME message « indisponible »
   * → indifférenciables. Le blocage étant PAR-COMPTE, on rejoue la requête en
   * visiteur DÉCONNECTÉ (`credentials: 'omit'`, donc sans ton cookie de session) :
   *  - le profil répond AVEC un objet `user` en anonyme → il existe toujours, c'est
   *    TON compte qui est exclu → BLOCKED ;
   *  - réponse propre SANS `user` (200 sans user, ou 404) → compte réellement DELETED ;
   *  - réponse ambiguë (rate-limit, login wall, réseau) → 'unknown', on ne tranche
   *    pas (le caller retombe sur le comportement « not found » d'origine).
   * Same-origin (instagram.com) → aucun souci CORS. Remplace le 2e compte IG de
   * l'ancien agent Nathan (agent_b) sans risque de ban.
   */
  private async checkBlockedAnonymously(
    username: string
  ): Promise<'blocked' | 'deleted' | 'unknown'> {
    const url =
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'omit', // CLÉ : pas de cookie → point de vue d'un anonyme
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
        },
      });

      // Données réelles (captures) — l'endpoint anonyme tranche par la PRÉSENCE de
      // `user`, PAS par le code HTTP :
      //  - bloqué   → 200 AVEC user (existe pour un anonyme, pas pour toi)
      //  - supprimé → 200 SANS user (et non un 404 comme on le supposait)
      const data = res.ok ? await res.json().catch(() => null) : null;
      const user = data?.data?.user;
      if (user && (user.username || user.id || user.pk)) {
        console.log(`🚫 @${username} visible en anonyme mais pas pour toi → BLOCKED`);
        return 'blocked';
      }
      // Réponse PROPRE sans user (200 ok sans user, ou 404) = compte disparu.
      if (res.ok || res.status === 404) {
        console.log(`🗑️ @${username} absent en anonyme (HTTP ${res.status}, pas de user) → DELETED`);
        return 'deleted';
      }
      // 401/403/429/5xx : login wall, rate-limit ou erreur serveur → inconcluant.
      console.log(`❔ @${username} : cross-check anonyme HTTP ${res.status} → unknown`);
      return 'unknown';
    } catch (e) {
      console.log(`❔ @${username} : cross-check anonyme échoué (${e}) → unknown`);
      return 'unknown';
    }
  }

  /**
   * Classification 100 % API d'une liste de followers manquants, SANS navigation.
   * Remplit `result` (unfollowed / blocked / notFoundOnInstagram). Les comptes qui
   * te suivent ENCORE (faux positifs) et les cas inconcluants ne sont classés nulle
   * part. Throttle entre chaque compte pour rester sous le radar anti-bot d'IG.
   */
  private async classifyMissingViaApi(
    missing: string[],
    result: UnfollowerAnalysisResult
  ): Promise<void> {
    const total = missing.length;
    for (let i = 0; i < total; i++) {
      if (!this.isRunning) {
        console.log('⏹️ Classification interrompue (analyse stoppée).');
        break;
      }
      const username = missing[i];
      await this.updateProgress(`Vérification de @${username}...`, i, total);
      const verdict = await this.classifyOneViaApi(username);
      switch (verdict) {
        case 'unfollowed':
          console.log(`👋 @${username} → UNFOLLOWED`);
          result.unfollowed.push(username);
          break;
        case 'blocked':
          console.log(`🚫 @${username} → BLOCKED`);
          result.blocked.push(username);
          break;
        case 'deleted':
          console.log(`🗑️ @${username} → DELETED`);
          result.notFoundOnInstagram.push(username);
          break;
        case 'still_follows':
          console.log(`✅ @${username} te suit encore — non classé (faux positif)`);
          break;
        default:
          console.log(`❔ @${username} → inconcluant, non classé`);
          break;
      }
      // Throttle anti rate-limit, mais bien plus court qu'une navigation de page.
      if (i < total - 1) await this.sleep(1500 + Math.random() * 2000);
    }
    await this.updateProgress('Analyse terminée', total, total);
  }

  /**
   * Classe UN follower manquant via deux appels API :
   *  1. web_profile_info CONNECTÉ → s'il est visible pour TOI :
   *       `follows_viewer` faux → UNFOLLOWED ; vrai → te suit encore (faux positif).
   *  2. s'il est INVISIBLE pour toi (hasUser faux), cross-check ANONYME :
   *       visible en anonyme → BLOCKED ; absent → DELETED.
   * 'unknown' si une réponse est inexploitable (rate-limit, réseau) → non classé.
   */
  private async classifyOneViaApi(
    username: string
  ): Promise<'unfollowed' | 'blocked' | 'deleted' | 'still_follows' | 'unknown'> {
    const connected = await this.fetchProfileConnected(username);
    if (connected === 'error') return 'unknown';
    if (connected.hasUser) {
      return connected.followsViewer ? 'still_follows' : 'unfollowed';
    }

    // Invisible pour toi sous CE pseudo. AVANT de conclure bloqué/supprimé, gérer le
    // RENAME : si on a un pk stocké et qu'il résout vers un AUTRE pseudo encore
    // vivant, le compte existe (≠ supprimé). On reclasse sur le nouveau pseudo via
    // sa vraie relation (te suit encore vs unfollow). Rattrape les renames que
    // syncPksAndRenames a ratés (ex. liste followers API incomplète ce run-là).
    const pk = await this.getStoredPk(username);
    if (pk) {
      const currentName = await this.resolveUsernameByPk(pk);
      if (currentName && currentName.toLowerCase() !== username.toLowerCase()) {
        const reCheck = await this.fetchProfileConnected(currentName);
        if (reCheck !== 'error' && reCheck.hasUser) {
          console.log(`✏️ @${username} a été renommé en @${currentName} (pk ${pk}) — pas supprimé`);
          return reCheck.followsViewer ? 'still_follows' : 'unfollowed';
        }
      }
    }

    // Pas de rename vivant détecté → bloqué ou supprimé : on tranche en anonyme.
    return this.checkBlockedAnonymously(username); // 'blocked' | 'deleted' | 'unknown'
  }

  /**
   * pk (ID stable) stocké pour un username dans la base locale de followers, ou null.
   * Insensible à la casse (la base peut mêler casse API et casse DOM).
   */
  private async getStoredPk(username: string): Promise<string | null> {
    try {
      const stored = await accountGet('followerDatabase');
      const followers = (stored.followerDatabase?.followers || {}) as Record<string, any>;
      const lower = username.toLowerCase();
      for (const key of Object.keys(followers)) {
        if (key.toLowerCase() === lower) {
          return followers[key]?.pk != null ? String(followers[key].pk) : null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Résout le pseudo COURANT d'un compte à partir de son pk via l'API users/info
   * (le pk est insensible au renommage). Renvoie le username actuel, ou null si le
   * compte est introuvable/supprimé ou la requête échoue.
   */
  private async resolveUsernameByPk(pk: string): Promise<string | null> {
    try {
      const res = await fetch(`https://www.instagram.com/api/v1/users/${pk}/info/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'x-ig-app-id': '936619743392459' },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const u = data?.user?.username;
      return typeof u === 'string' ? u : null;
    } catch {
      return null;
    }
  }

  /**
   * Récupère le profil en mode CONNECTÉ (avec ton cookie). Renvoie la présence du
   * `user` et son `follows_viewer`, ou 'error' si la réponse est inexploitable.
   * Un 404 ou un 200-sans-user = invisible pour toi (bloqué/supprimé → hasUser:false,
   * cf. captures réelles). 401/403/429/5xx = inexploitable → 'error' (non classé).
   */
  private async fetchProfileConnected(
    username: string
  ): Promise<{ hasUser: boolean; followsViewer: boolean } | 'error'> {
    const url =
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
        },
      });
      if (res.status === 404) return { hasUser: false, followsViewer: false };
      if (!res.ok) return 'error';
      const data = await res.json().catch(() => null);
      const user = data?.data?.user;
      if (user && (user.id || user.username)) {
        return { hasUser: true, followsViewer: !!user.follows_viewer };
      }
      // 200 sans user = compte invisible pour toi (bloqué/supprimé).
      return { hasUser: false, followsViewer: false };
    } catch {
      return 'error';
    }
  }

  /**
   * SYNC `pk` + RENAMES sur TOUTE la base (pas seulement les « manquants »). Pour
   * chaque follower de l'API (pk→username) :
   *  - si la base connaît déjà ce `pk` sous un AUTRE pseudo → RENAME : on migre
   *    l'entrée vers le nouveau pseudo. La « section followers » reste INCHANGÉE
   *    (ni départ ni nouveau follower fantôme) — un rename ne change pas le compte.
   *  - sinon, si la base a ce pseudo SANS pk → on backfille le pk (clé pour
   *    détecter les renames FUTURS : le pk doit être stocké AVANT le changement).
   * Indépendant du scan DOM : un rename est résolu MÊME si l'ancien pseudo traîne
   * encore dans le cache de la modale (c'était la cause des faux départs). Limite
   * de fond : un rename survenu AVANT tout backfill reste indétectable (ancien
   * pseudo absent de l'API, aucun lien possible).
   */
  private async syncPksAndRenames(api: ApiFollowers | null): Promise<void> {
    if (!this.apiListUsable(api)) return;
    try {
      const stored = await accountGet('followerDatabase');
      const db = stored.followerDatabase;
      const followers = (db?.followers || {}) as Record<string, any>;

      const pkToKey = new Map<string, string>();
      const lowerToKey = new Map<string, string>();
      for (const key of Object.keys(followers)) {
        const e = followers[key];
        if (e?.pk) pkToKey.set(String(e.pk), key);
        lowerToKey.set(key.toLowerCase(), key);
      }

      let backfilled = 0;
      let renamed = 0;
      for (const [pk, name] of api!.map) {
        const byPkKey = pkToKey.get(pk);
        if (byPkKey) {
          // La base connaît ce pk. Pseudo différent → RENAME (on migre l'entrée).
          if (byPkKey.toLowerCase() !== name.toLowerCase()) {
            const entry = followers[byPkKey];
            delete followers[byPkKey];
            followers[name] = { ...entry, username: name, pk };
            lowerToKey.delete(byPkKey.toLowerCase());
            lowerToKey.set(name.toLowerCase(), name);
            pkToKey.set(pk, name);
            renamed++;
            console.log(`✏️ Rename: @${byPkKey} → @${name} (pk ${pk}) — section followers inchangée`);
          }
          continue;
        }
        // pk inconnu de la base → tenter de l'attacher par pseudo (backfill).
        const byNameKey = lowerToKey.get(name.toLowerCase());
        if (byNameKey && followers[byNameKey] && !followers[byNameKey].pk) {
          followers[byNameKey].pk = pk;
          pkToKey.set(pk, byNameKey);
          backfilled++;
        }
      }

      if (backfilled > 0 || renamed > 0) {
        db.totalCount = Object.keys(followers).length;
        db.lastScanDate = new Date().toISOString();
        await accountSet({ followerDatabase: db });
        console.log(`🧬 pk backfillés: ${backfilled} | renames résolus: ${renamed}`);
      } else {
        console.log('🧬 pk déjà à jour, aucun rename.');
      }
    } catch (e) {
      console.error('Error syncing pks/renames:', e);
    }
  }

  /**
   * Écarte des « manquants » ceux dont l'ID stable suit TOUJOURS (le scan DOM les
   * a ratés) — les renames ayant déjà été résolus par `syncPksAndRenames` sur
   * toute la base. Réutilise la map API (aucun appel réseau). Dégrade proprement
   * (liste inchangée) si l'API est indisponible/incomplète.
   */
  private async filterStillFollowing(missing: string[], api: ApiFollowers | null): Promise<string[]> {
    if (!missing || missing.length === 0) return missing;
    if (!this.apiListUsable(api)) return missing;
    try {
      const currentPks = new Set(api!.map.keys());
      const usernameToPk = new Map<string, string>();
      for (const [pk, name] of api!.map) usernameToPk.set(name.toLowerCase(), pk);

      const stored = await accountGet('followerDatabase');
      const followers = (stored.followerDatabase?.followers || {}) as Record<string, any>;
      const lowerToKey = new Map<string, string>();
      for (const k of Object.keys(followers)) lowerToKey.set(k.toLowerCase(), k);

      const realMissing: string[] = [];
      for (const username of missing) {
        const key = lowerToKey.get(username.toLowerCase());
        const pk = (key && followers[key]?.pk) || usernameToPk.get(username.toLowerCase());
        if (pk && currentPks.has(pk)) continue; // l'ID suit toujours → écarté
        realMissing.push(username);
      }
      const dropped = missing.length - realMissing.length;
      if (dropped > 0) {
        console.log(`✅ ${dropped} faux départ(s) écarté(s) (suivent toujours) → ${realMissing.length} vrai(s) manquant(s)`);
      }
      return realMissing;
    } catch (e) {
      console.error('Error filtering still-following:', e);
      return missing;
    }
  }

  /**
   * RÉCONCILIATION (additive) : ajoute à la base locale les followers vus au scan
   * mais absents de la base (nouveaux), en préservant les entrées existantes. Ne
   * RETIRE rien : les retraits restent pilotés par la navigation/classification,
   * qui épargne les comptes « te suit encore ». Corrige le cas où la base finit
   * SOUS le nombre réel (ex. 212 au lieu de 213) faute d'avoir intégré les
   * nouveaux. À n'appeler qu'avec un scan FIABLE (garde-fou de complétude passé).
   */
  private async reconcileDatabaseToScan(currentFollowers: string[], api: ApiFollowers | null): Promise<void> {
    try {
      const stored = await accountGet('followerDatabase');
      const db = stored.followerDatabase;
      if (!db || !db.followers) return;

      const existing = db.followers as Record<string, any>;
      const lowerExisting = new Set(Object.keys(existing).map(k => k.toLowerCase()));

      // username(lower) → pk depuis l'API : on ESTAMPILLE chaque nouvel entrant avec
      // son ID stable. SANS ça, un follower ajouté ici n'a pas de pk → un futur
      // rename est INDÉTECTABLE et le compte ressort en « supprimé » sous l'ancien
      // pseudo (cause exacte du cas waler.website → waler.web → waler.network).
      const nameToPk = new Map<string, string>();
      if (this.apiListUsable(api)) {
        for (const [pk, name] of api!.map) nameToPk.set(name.toLowerCase(), pk);
      }

      let added = 0;
      for (const raw of currentFollowers) {
        const u = (raw || '').trim();
        if (!u || lowerExisting.has(u.toLowerCase())) continue;
        const pk = nameToPk.get(u.toLowerCase());
        existing[u] = pk
          ? { username: u, pk, addedAt: new Date().toISOString() }
          : { username: u, addedAt: new Date().toISOString() };
        lowerExisting.add(u.toLowerCase());
        added++;
      }
      if (added === 0) return;

      db.totalCount = Object.keys(existing).length;
      db.lastScanDate = new Date().toISOString();
      await accountSet({ followerDatabase: db });
      console.log(`🔄 ${added} nouveau(x) follower(s) ajouté(s) à la base → ${db.totalCount}`);
    } catch (error) {
      console.error('Error reconciling database to scan:', error);
    }
  }

  /**
   * Envoie les résultats au backend
   */
  private async sendResultsToBackend(result: UnfollowerAnalysisResult): Promise<void> {
    try {
      console.log('📤 Sending results to backend...');

      const response = await chrome.runtime.sendMessage({
        type: 'SEND_UNFOLLOWER_RESULTS',
        data: {
          unfollowedUsernames: result.unfollowed,
          blockedUsernames: result.blocked,
          missingUsernames: result.notFoundOnInstagram,
        },
      });

      if (response && response.success) {
        console.log('✅ Results sent to backend successfully');
        
        // Mettre à jour les stats de session avec les résultats de l'analyse
        await chrome.runtime.sendMessage({
          type: 'UPDATE_UNFOLLOWER_STATS',
          data: {
            unfollowers: result.unfollowed.length,
            ghost: result.blocked.length + result.notFoundOnInstagram.length,
          },
        });

        // NOTE : Agent B (bot Python de vérification via Google) est OBSOLÈTE — la
        // classification bloqué/supprimé est désormais confirmée en direct par les
        // appels API (connecté + anonyme). On ne le déclenche plus (il renvoyait une
        // page HTML 404 → « Failed to trigger Agent B »).
      } else {
        console.error('❌ Failed to send results to backend:', response);
      }

    } catch (error) {
      console.error('Error sending results to backend (non-fatal):', error);
      // Ne pas re-throw : le cleanup et la notification doivent toujours s'exécuter
    }
  }

  /**
   * Déclenche l'Agent B pour vérifier les unfollowers via Google
   */
  async triggerAgentB(missingUsernames: string[]): Promise<void> {
    try {
      console.log(`🤖 Triggering Agent B for ${missingUsernames.length} usernames...`);
      
      const response = await chrome.runtime.sendMessage({
        type: 'TRIGGER_AGENT_B',
        data: {
          missingUsernames,
        },
      });

      if (response && response.success) {
        console.log('✅ Agent B triggered successfully');
        console.log(`🔍 Agent B will verify these usernames via Google search`);
      } else {
        console.error('❌ Failed to trigger Agent B:', response);
      }

    } catch (error) {
      console.error('Error triggering Agent B:', error);
    }
  }

  /**
   * Met à jour le badge de l'extension pour les unfollowers détectés par
   * l'analyse (couleur ambre). `count <= 0` efface le badge.
   */
  private async setUnfollowerBadge(count: number): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        text: count > 0 ? `-${count}` : '',
        color: '#f59e0b',
      });
    } catch (error) {
      // Non-fatal : le badge n'est qu'un indicateur visuel
      console.log('⚠️ Impossible de mettre à jour le badge unfollower:', error);
    }
  }

  /**
   * Met à jour la progression (pour l'overlay)
   */
  private async updateProgress(message: string, current: number, total: number): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'UNFOLLOWER_ANALYSIS_PROGRESS',
        data: {
          message,
          current,
          total,
          percentage: Math.round((current / total) * 100),
        },
      });
    } catch (error) {
      // Ignore errors (overlay might not be listening)
    }
  }

  /**
   * Vérifie si une analyse est en cours
   */
  isAnalysisRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Arrête l'analyse en cours
   */
  stopAnalysis(): void {
    this.isRunning = false;
    console.log('⏹️ Analysis stopped by user');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ferme le modal followers s'il est ouvert
   */
  private async closeFollowersModal(): Promise<void> {
    try {
      // Chercher le bouton de fermeture du modal
      const closeButton = document.querySelector('[role="dialog"] svg[aria-label="Close"], [role="dialog"] button[aria-label="Close"]');
      
      if (closeButton) {
        console.log('✅ Found close button, clicking...');
        (closeButton as HTMLElement).click();
        await this.sleep(1000);
      } else {
        // Essayer d'appuyer sur Escape
        console.log('⌨️ Pressing Escape to close modal...');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
        await this.sleep(1000);
      }
      
      console.log('✅ Modal closed');
    } catch (error) {
      console.error('Error closing modal:', error);
    }
  }

  /**
   * Initialise l'état pour la vérification par URL dans localStorage
   */
  private async initializeUrlCheckState(myUsername: string, missingFollowers: string[]): Promise<void> {
    const state = {
      currentIndex: 0,
      startedAt: Date.now(), // horodatage : permet à l'init de purger un état périmé
      myUsername: myUsername,
      missingFollowers: missingFollowers,
      results: {
        unfollowed: [] as string[],
        blocked: [] as string[],
        notFoundOnInstagram: [] as string[]
      }
    };
    localStorage.setItem('unfollowerCheckState', JSON.stringify(state));
    console.log('💾 State initialized in localStorage');
  }

  /**
   * Vérifie la page actuelle pour un unfollower (appelé automatiquement sur chaque page)
   */
  async checkCurrentPageForUnfollower(): Promise<void> {
    const stateStr = localStorage.getItem('unfollowerCheckState');
    if (!stateStr) {
      return; // Pas de vérification en cours
    }

    const state = JSON.parse(stateStr);

    // Marqueur du NOUVEAU flux « tout API » (mode:'api') : il n'a pas de liste à
    // parcourir et la classification se fait sans navigation → cette routine de
    // navigation profil-par-profil ne le concerne pas, on sort.
    if (state.mode === 'api' || !Array.isArray(state.missingFollowers)) {
      return;
    }

    // AUTO-PROTECTION : un état hérité d'un scan corrompu (modale non défilée)
    // peut contenir presque toute la base comme "manquants" → boucle de visites
    // de centaines de profils, qui reprend à chaque rechargement de page. On
    // détecte ça (manquants > 70 % de la base) et on annule + nettoie au lieu de
    // continuer la boucle.
    try {
      const dbStore = await accountGet('followerDatabase');
      const dbCount = Object.keys(dbStore.followerDatabase?.followers || {}).length;
      const missingTotal = Array.isArray(state.missingFollowers) ? state.missingFollowers.length : 0;
      if (dbCount > 0 && missingTotal > dbCount * 0.7) {
        console.warn(
          `🛑 État d'analyse corrompu (${missingTotal}/${dbCount} "manquants") — annulation et nettoyage, pas de boucle.`
        );
        localStorage.removeItem('unfollowerCheckState');
        await chrome.storage.local.set({ isAnalyzing: false });
        await accountSet({ unfollowerDetected: false, unfollowerCount: 0 });
        return;
      }
    } catch (e) {
      // best-effort : si on ne peut pas lire la base, on ne bloque pas le flux normal
    }

    const currentUrl = window.location.href;
    const currentUsername = currentUrl.match(/instagram\.com\/([^\/]+)/)?.[1];

    console.log(`📍 Current page: @${currentUsername}`);

    // Vérifier si on est sur une page système (notifications, explore, etc.)
    const systemPages = ['notifications', 'explore', 'direct', 'accounts', 'settings'];
    const isSystemPage = systemPages.some(page => currentUrl.includes(`/${page}`));
    
    if (isSystemPage) {
      console.log('⚠️ On a system page, redirecting to expected profile...');
      const expectedUsername = state.missingFollowers[state.currentIndex];
      if (expectedUsername) {
        console.log(`➡️ Navigating to @${expectedUsername}...`);
        window.location.href = `https://www.instagram.com/${expectedUsername}/`;
      } else {
        // Si on a fini, retourner au profil
        console.log(`🏠 Returning to profile @${state.myUsername}...`);
        window.location.href = `https://www.instagram.com/${state.myUsername}/`;
      }
      return;
    }

    // Si on est de retour sur notre profil, c'est fini
    if (currentUsername === state.myUsername && state.currentIndex >= state.missingFollowers.length) {
      console.log('\n✅ All checks completed!');
      console.log('📊 Results:');
      console.log(`   - Unfollowed: ${state.results.unfollowed.length}`, state.results.unfollowed);
      console.log(`   - Blocked: ${state.results.blocked.length}`, state.results.blocked);
      console.log(`   - Not found: ${state.results.notFoundOnInstagram.length}`, state.results.notFoundOnInstagram);

      // ANTI-DÉRIVE : retirer de la base locale tous les comptes VISITÉS et
      // CONFIRMÉS non-followers (unfollowed / blocked / deleted). Sans ça, la map
      // accumule les partants sans jamais les élaguer (ex. 221 usernames pour 213
      // followers réels) et chaque future analyse les « re-détecte ». Les comptes
      // « te suit encore » ne sont dans AUCUNE de ces listes → ils restent.
      await this.pruneFromDatabase([
        ...state.results.unfollowed,
        ...state.results.blocked,
        ...state.results.notFoundOnInstagram,
      ]);

      try {
        // Envoyer les résultats au backend (non-fatal si ça échoue)
        await this.sendResultsToBackend({
          totalMissing: state.missingFollowers.length,
          unfollowed: state.results.unfollowed,
          blocked: state.results.blocked,
          notFoundOnInstagram: state.results.notFoundOnInstagram,
          errors: []
        });

        // Déclencher l'Agent B si nécessaire
        if (state.results.notFoundOnInstagram.length > 0) {
          console.log(`\n🤖 Triggering Agent B for ${state.results.notFoundOnInstagram.length} usernames...`);
          await this.triggerAgentB(state.results.notFoundOnInstagram);
        }
      } catch (error) {
        console.error('⚠️ Erreur envoi résultats (cleanup continue quand même):', error);
      } finally {
        // Cleanup toujours exécuté, même si le backend a échoué
        localStorage.removeItem('unfollowerCheckState');
        // isAnalyzing est une clé GLOBALE (état d'une navigation en cours) ; les
        // autres sont propres au compte actif.
        await chrome.storage.local.set({ isAnalyzing: false });
        await accountSet({
          unfollowerDetected: false,
          unfollowerCount: 0,
        });

        // Notifier le service worker → popup + dashboard
        try {
          await chrome.runtime.sendMessage({
            type: 'ANALYSIS_COMPLETED',
            data: {
              unfollowers: state.results.unfollowed.length,
              blocked: state.results.blocked.length,
              notFound: state.results.notFoundOnInstagram.length
            }
          });
          console.log('✅ Analysis completed notification sent');
        } catch (msgError) {
          console.error('⚠️ Impossible d\'envoyer ANALYSIS_COMPLETED:', msgError);
        }
      }

      return;
    }

    // Analyser la page actuelle
    const expectedUsername = state.missingFollowers[state.currentIndex];

    if (currentUsername === expectedUsername) {
      console.log(`\n🔍 [${state.currentIndex + 1}/${state.missingFollowers.length}] Analyzing @${expectedUsername}...`);

      await this.sleep(3000); // Attendre que la page charge

      const pageContent = document.body.textContent || '';
      const pageHTML = document.body.innerHTML || '';

      // Classifier
      if (pageContent.includes('Vous ne pouvez pas accéder') || 
          pageContent.includes("You can't access") ||
          pageContent.includes('This Account is Private')) {
        console.log(`🚫 @${expectedUsername} classified as BLOCKED`);
        state.results.blocked.push(expectedUsername);
      } else if (pageContent.includes('Utilisateur introuvable') ||
                 pageContent.includes('Sorry, this page') ||
                 pageContent.includes("isn't available") ||
                 pageContent.includes('Page not found') ||
                 pageHTML.includes('Page Not Found')) {
        // « Indisponible » pour TOI = bloqué OU supprimé (indifférenciable ici).
        // On tranche via un cross-check ANONYME (déconnecté) : si le profil existe
        // encore pour un visiteur sans session, c'est un BLOCAGE ; sinon DELETED.
        const verdict = await this.checkBlockedAnonymously(expectedUsername);
        if (verdict === 'blocked') {
          console.log(`🚫 @${expectedUsername} classified as BLOCKED (confirmé en anonyme)`);
          state.results.blocked.push(expectedUsername);
        } else {
          // 'deleted' ou 'unknown' → on conserve le bucket « not found » d'origine.
          console.log(`❌ @${expectedUsername} classified as DELETED/NOT FOUND (${verdict})`);
          state.results.notFoundOnInstagram.push(expectedUsername);
        }
      } else {
        // Profil valide et accessible. On NE suppose PAS "unfollowed" par défaut :
        // - si la page affiche "Follows you / Vous suit", la personne te suit
        //   ENCORE (faux positif d'un scan/comparaison imparfait) → non classée ;
        // - si la page n'a pas vraiment chargé, c'est inconclusif → non classée.
        // Ainsi on ne brande plus chaque profil visité comme unfollower.
        const followsYou = /follows you|vous suit/i.test(pageContent);
        const pageLoaded = pageContent.length > 200;
        if (followsYou) {
          console.log(`✅ @${expectedUsername} te suit encore — ignoré (faux positif, non classé)`);
        } else if (!pageLoaded) {
          console.log(`⏳ @${expectedUsername} page non chargée — inconclusif, non classé`);
        } else {
          console.log(`👋 @${expectedUsername} classified as UNFOLLOWED`);
          state.results.unfollowed.push(expectedUsername);
        }
      }

      // Passer au suivant
      state.currentIndex++;
      localStorage.setItem('unfollowerCheckState', JSON.stringify(state));

      // Délai aléatoire
      const delay = 5000 + Math.random() * 5000;
      const delaySec = Math.round(delay / 1000);
      console.log(`⏸️ Waiting ${delaySec} seconds before next check...`);
      await this.sleep(delay);

      // Naviguer vers le prochain ou revenir au profil
      if (state.currentIndex < state.missingFollowers.length) {
        const nextUsername = state.missingFollowers[state.currentIndex];
        console.log(`➡️ Navigating to @${nextUsername}...`);
        window.location.href = `https://www.instagram.com/${nextUsername}/`;
      } else {
        console.log(`🏠 Returning to profile @${state.myUsername}...`);
        window.location.href = `https://www.instagram.com/${state.myUsername}/`;
      }
    } else {
      // On est sur une mauvaise page (pas celle attendue)
      console.log(`⚠️ Wrong page! Expected @${expectedUsername} but on @${currentUsername}`);
      console.log(`➡️ Redirecting to @${expectedUsername}...`);
      window.location.href = `https://www.instagram.com/${expectedUsername}/`;
    }
  }
}
