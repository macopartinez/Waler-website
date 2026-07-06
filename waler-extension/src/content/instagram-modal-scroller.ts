/**
 * Instagram Modal Scroller
 * 
 * Scroll intelligent et adaptatif pour le modal followers/following d'Instagram.
 * Inspiré d'OpenCLI mais optimisé pour un comportement humain indétectable.
 * 
 * Fonctionnalités :
 * - Scroll progressif avec variation naturelle
 * - Détection automatique de la fin de liste
 * - Attente intelligente du chargement DOM
 * - Extraction en temps réel pendant le scroll
 * - Gestion d'erreurs robuste
 * - Budget/résumabilité pour les gros comptes (étape B, cf. scan-budget.ts)
 */

import { checkScanGate, recordCaptured } from './scan-budget.js';

export interface ScrollProgress {
    totalFollowers: number;
    newFollowersThisScroll: number;
    scrollPosition: number;
    isEndReached: boolean;
    estimatedRemaining?: number;
}

/** Pourquoi `scrollToEnd` s'est arrêté (lisible via `scroller.lastStopReason`). */
export type ScrollStopReason =
    | 'end-of-list'        // fin naturelle de la liste (stuck detection, proche de la cible)
    | 'target-reached'     // targetCount atteint (baseline complet)
    | 'budget-exhausted'   // budget journalier épuisé → reprise demain
    | 'rate-limited'       // backoff actif → reprise différée
    | 'safety-cap'         // garde-fou anti boucle infinie
    | 'stuck-incomplete'   // heuristique stuck déclenchée LOIN de la cible connue
                           // (page initiale réduite/lazy-load bloqué) → PAS une
                           // vraie fin, à retenter — ne doit jamais marquer le
                           // baseline "complet".
    | 'running';           // pas encore arrêté

export interface ScrollOptions {
    maxScrollAttempts?: number;
    scrollDelay?: number;
    waitForLoadTimeout?: number;
    onProgress?: (progress: ScrollProgress) => void;
    /**
     * Active la couche sécurité scan-budget : vérifie le budget/backoff avant
     * chaque portion, persiste l'avancement (`seen`) et reprend un baseline
     * interrompu. À réserver au scan complet des gros comptes.
     */
    enforceBudget?: boolean;
    /**
     * Garde-fou absolu contre une boucle infinie (nb max de portions de scroll).
     * N'est PAS le limiteur métier — le budget et la fin de liste arrêtent bien
     * avant. Défaut volontairement haut pour ne pas tronquer un scan légitime.
     */
    hardScrollCap?: number;
    /**
     * Signal de fin AUTHENTIQUE fourni de l'extérieur (ex. `has_next_page=false`
     * lu passivement dans les réponses API interceptées). Plus fiable que la
     * détection "stuck" : quand il renvoie true, on arrête sans ambiguïté.
     */
    shouldStop?: () => boolean;
}

export class InstagramModalScroller {
    private modalSelector = 'div[role="dialog"] div._aano';
    private followerItemSelector = 'div._aano > div > div';
    private scrollContainer: HTMLElement | null = null;
    private lastFollowerCount = 0;
    private stuckCount = 0;
    private maxStuckAttempts: number;
    private scrollDelay: number;
    private waitForLoadTimeout: number;
    private onProgress?: (progress: ScrollProgress) => void;
    private enforceBudget: boolean;
    private hardScrollCap: number;
    private shouldStop?: () => boolean;

    /** Raison du dernier arrêt de `scrollToEnd` (pour piloter l'UI côté appelant). */
    public lastStopReason: ScrollStopReason = 'running';

    constructor(options: ScrollOptions = {}) {
        this.maxStuckAttempts = options.maxScrollAttempts || 10; // 10 tentatives au lieu de 3
        this.scrollDelay = options.scrollDelay || 250;
        this.waitForLoadTimeout = options.waitForLoadTimeout || 5000; // 5s au lieu de 3s
        this.onProgress = options.onProgress;
        this.enforceBudget = options.enforceBudget || false;
        // Garde-fou absolu contre une boucle infinie. En mode budget, on le monte
        // haut (le budget/fin de liste arrêtent bien avant) : l'ancien cap dur de
        // 100 tronquait les gros comptes. Hors budget, on garde 100 pour ne pas
        // changer le comportement des appelants existants (détecteur d'unfollowers).
        this.hardScrollCap = options.hardScrollCap ?? (this.enforceBudget ? 1000 : 100);
        this.shouldStop = options.shouldStop;
    }

    /**
     * Scroll jusqu'à la fin du modal et retourne tous les usernames
     */
    async scrollToEnd(): Promise<string[]> {
        // Attendre que la liste charge : le modal s'ouvre AVANT que ses followers
        // soient rendus, donc le conteneur scrollable n'existe pas immédiatement.
        this.scrollContainer = await this.waitForScrollContainer();
        if (!this.scrollContainer) {
            throw new Error('Conteneur scrollable introuvable (liste followers non chargée ?).');
        }

        // Set au lieu d'un array + includes() : la dédup était O(n²) et faisait
        // ramer l'onglet au-delà de ~1000 followers.
        const allFollowers = new Set<string>();
        let isEndReached = false;
        let scrollAttempt = 0;
        this.lastStopReason = 'running';

        // Reprise : réamorcer avec les followers déjà capturés (baseline interrompu).
        // `knownTargetCount` sert de garde-fou : l'heuristique "stuck" ne doit
        // JAMAIS être prise pour une vraie fin de liste tant qu'on est loin de
        // cette cible (cf. plus bas) — sinon un blocage de chargement (page
        // initiale réduite sur réouverture, lazy-load qui stalle) marquerait à
        // tort le baseline "complet" avec des données partielles.
        let knownTargetCount = 0;
        if (this.enforceBudget) {
            const gate0 = await checkScanGate();
            for (const u of gate0.state.seen) allFollowers.add(u);
            knownTargetCount = gate0.state.targetCount || 0;
            if (gate0.state.seen.length > 0) {
                console.log(`♻️ Reprise du baseline : ${gate0.state.seen.length} followers déjà en mémoire`);
            }
        }

        console.log('🚀 Début du scroll intelligent pour capturer TOUS les followers...');

        while (!isEndReached) {
            scrollAttempt++;

            // 0. Porte budget/backoff AVANT toute action (sécurité compte).
            if (this.enforceBudget) {
                const gate = await checkScanGate();
                if (!gate.ok) {
                    this.lastStopReason =
                        gate.reason === 'rate-limited' ? 'rate-limited'
                        : gate.reason === 'done' ? 'target-reached'
                        : 'budget-exhausted';
                    console.warn(`⏸️ Scan mis en pause (${gate.reason}). Reprise ultérieure.`);
                    break;
                }
            }

            // 1. Scroll humain avec variation
            await this.humanScroll();

            // 2. Attendre le chargement DOM
            await this.waitForNewFollowers();

            // 3. Extraire les followers visibles dans cette portion
            const visibleFollowers = this.extractVisibleFollowers();
            const newThisScroll: string[] = [];
            visibleFollowers.forEach(username => {
                if (!allFollowers.has(username)) {
                    allFollowers.add(username);
                    newThisScroll.push(username);
                }
            });
            const newCount = newThisScroll.length;

            // 3b. Persister l'avancement (dédup serveur + reprise) et laisser le
            //     budget décider d'un arrêt (cible atteinte / plafond du jour).
            if (this.enforceBudget && newCount > 0) {
                const { state } = await recordCaptured(newThisScroll);
                if (state.status === 'done') {
                    this.lastStopReason = 'target-reached';
                    console.log('🎯 Cible atteinte : baseline complet.');
                    break;
                }
                if (state.status === 'paused-budget') {
                    this.lastStopReason = 'budget-exhausted';
                    console.warn('⏸️ Budget journalier épuisé. Reprise demain.');
                    break;
                }
            }

            // 4. Fin AUTHENTIQUE via l'API interceptée (has_next_page=false) —
            //    prioritaire et fiable ; sinon repli sur la détection "stuck".
            //    IMPORTANT : la détection "stuck" se base sur le nombre de lignes
            //    CHARGÉES dans le DOM (qui croît tant qu'on scrolle), PAS sur les
            //    uniques capturés — sinon, à la reprise, re-scroller la zone déjà
            //    vue (0 nouveau) serait pris pour une fin de liste et couperait le
            //    baseline trop tôt.
            if (this.shouldStop?.()) {
                isEndReached = true;
                this.lastStopReason = 'end-of-list';
                console.log('🏁 Fin de liste confirmée par l\'API (has_next_page=false).');
            } else if (this.isEndOfList(this.getCurrentFollowerCount())) {
                // GARDE-FOU DE COMPLÉTUDE : l'heuristique "stuck" seule n'est pas
                // fiable (une réouverture du modal peut faire servir une petite
                // page initiale par Instagram, bloquant le chargement — cf.
                // humanScroll). On ne l'accepte comme VRAIE fin que si on est
                // raisonnablement proche de la cible connue. Sinon → pause
                // "stuck-incomplete" (retryable), jamais "complet".
                const nearTarget = knownTargetCount <= 0 || allFollowers.size >= knownTargetCount - 5;
                isEndReached = true;
                if (nearTarget) {
                    this.lastStopReason = 'end-of-list';
                } else {
                    this.lastStopReason = 'stuck-incomplete';
                    console.warn(
                        `⚠️ Chargement bloqué à ${allFollowers.size}/${knownTargetCount} followers — ` +
                        `PAS la vraie fin de liste. Pause pour nouvelle tentative (aucune marque "complet").`
                    );
                }
            }

            // 5. Callback de progression
            if (this.onProgress) {
                this.onProgress({
                    totalFollowers: allFollowers.size,
                    newFollowersThisScroll: newCount,
                    scrollPosition: this.scrollContainer.scrollTop,
                    isEndReached,
                });
            }

            // 6. Log progress
            console.log(
                `📊 Scroll #${scrollAttempt}: ${allFollowers.size} followers capturés ` +
                `(+${newCount} dans cette portion) | Position: ${Math.round(this.scrollContainer.scrollTop)}px`
            );

            // 7. Garde-fou absolu anti boucle infinie
            if (scrollAttempt >= this.hardScrollCap) {
                console.warn(`⚠️ Garde-fou de ${this.hardScrollCap} scrolls atteint. Arrêt.`);
                this.lastStopReason = 'safety-cap';
                break;
            }
        }

        console.log(`✅ Scroll terminé : ${allFollowers.size} followers capturés (${this.lastStopReason})`);
        return Array.from(allFollowers);
    }

    /**
     * Attend que le conteneur scrollable apparaisse : le modal s'ouvre AVANT que
     * sa liste de followers soit rendue, donc une détection one-shot échoue (rien
     * n'est encore scrollable). On sonde jusqu'à `timeoutMs`.
     */
    private async waitForScrollContainer(timeoutMs = 10000): Promise<HTMLElement | null> {
        const start = Date.now();
        let container = this.detectScrollContainer();
        while (!container && Date.now() - start < timeoutMs) {
            console.log('⏳ Attente du chargement de la liste followers...');
            await this.sleep(400);
            container = this.detectScrollContainer();
        }
        if (container) {
            console.log(
                `✅ Conteneur scrollable trouvé : <${container.tagName}> ` +
                `scrollH=${container.scrollHeight} clientH=${container.clientHeight}`
            );
        } else {
            console.error('❌ Aucun conteneur scrollable trouvé après attente');
        }
        return container;
    }

    /**
     * Détecte le conteneur scrollable du modal, robuste aux changements de DOM
     * d'Instagram (ne dépend PAS de la classe `._aano`).
     */
    private detectScrollContainer(): HTMLElement | null {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return null;

        const isScrollable = (el: Element): boolean => {
            const oy = window.getComputedStyle(el).overflowY;
            return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4;
        };

        // Stratégie 0 (la plus robuste) : remonter depuis un lien de profil de la
        // liste jusqu'au plus proche ancêtre scrollable. Indépendant des classes.
        const link = modal.querySelector('a[href^="/"]');
        if (link) {
            let el: Element | null = link;
            while (el) {
                if (isScrollable(el)) return el as HTMLElement;
                if (el === modal) break;
                el = el.parentElement;
            }
        }

        // Stratégie 1 : sélecteurs connus (compat anciennes versions).
        for (const selector of ['div[role="dialog"] div._aano', 'div[role="dialog"] div[style*="overflow"]']) {
            const c = document.querySelector<HTMLElement>(selector);
            if (c && c.scrollHeight > c.clientHeight) return c;
        }

        // Stratégie 2 : n'importe quel div scrollable dans le modal.
        const divs = Array.from(modal.querySelectorAll('div')) as HTMLElement[];
        for (const div of divs) {
            if (isScrollable(div)) return div;
        }

        // Stratégie 3 (repli) : le plus grand div dont le contenu déborde.
        let best: HTMLElement | null = null;
        for (const div of divs) {
            if (div.scrollHeight > div.clientHeight + 40) {
                if (!best || div.scrollHeight > best.scrollHeight) best = div;
            }
        }
        return best;
    }

    /**
     * Scroll progressif avec variation humaine naturelle
     * Basé sur les patterns observés dans waler-recording-1779454178367.json
     */
    private async humanScroll(): Promise<number> {
        if (!this.scrollContainer) return 0;

        const currentScroll = this.scrollContainer.scrollTop;
        const maxScroll = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight;

        // Rien à scroller pour l'instant (contenu initial trop court pour dépasser
        // le viewport — arrive sur une RÉOUVERTURE du modal où Instagram sert
        // une petite première page). Ancien seuil `maxScroll - 10` bloquait
        // TOUJOURS le scroll dans ce cas (deadlock : pas de scroll → pas de
        // lazy-load → jamais plus de contenu → faux "fin de liste"). On envoie un
        // événement wheel pour inciter Instagram à charger, sans bouger scrollTop.
        if (maxScroll <= 0) {
            this.scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
            await this.sleep(this.scrollDelay);
            return 0;
        }
        // Presque en bas mais une marge existe encore : aller jusqu'au bout plutôt
        // que d'abandonner (l'ancien seuil fixe de 10px pouvait couper court sur
        // un maxScroll minuscule).
        if (currentScroll >= maxScroll - 2) {
            this.scrollContainer.scrollTop = maxScroll;
            await this.sleep(this.scrollDelay);
            return maxScroll - currentScroll;
        }

        // Variation naturelle du scroll (comme dans l'enregistrement)
        // Plus de variation pour éviter la détection
        const baseScroll = 300 + Math.random() * 200; // 300-500px (plus variable)
        const variation = Math.random() * 200 - 100; // ±100px
        const scrollAmount = Math.min(baseScroll + variation, maxScroll - currentScroll);

        // Scroll progressif (pas instantané) — simule le scroll à la molette
        const steps = 5 + Math.floor(Math.random() * 5); // 5-9 micro-scrolls (plus variable)
        const stepSize = scrollAmount / steps;
        const stepDelay = 16 + Math.floor(Math.random() * 20); // 16-36ms (variation plus large)

        for (let i = 0; i < steps; i++) {
            this.scrollContainer.scrollTop += stepSize;
            await this.sleep(stepDelay);
        }

        // Pause aléatoire après scroll (comme un humain qui lit)
        // Variation beaucoup plus large : 400-1000ms
        const pauseTime = this.scrollDelay + Math.random() * 600;
        await this.sleep(pauseTime);

        return scrollAmount;
    }

    /**
     * Attend que plus de followers soient chargés dans le DOM (lazy loading)
     */
    private async waitForNewFollowers(): Promise<void> {
        const maxWait = this.waitForLoadTimeout;
        const startTime = Date.now();
        const initialCount = this.getCurrentFollowerCount();

        while (Date.now() - startTime < maxWait) {
            await this.sleep(100);
            const currentCount = this.getCurrentFollowerCount();
            
            if (currentCount > initialCount) {
                // Plus de followers chargés — attendre un peu plus pour le rendu complet
                await this.sleep(200);
                return;
            }
        }

        // Timeout — probablement la fin de la liste ou problème réseau
        console.log('⏱️ Timeout : aucun follower supplémentaire chargé (fin de liste probable)');
    }

    /**
     * Compte le nombre d'éléments followers actuellement dans le DOM
     * Pattern OpenCLI: compter les liens dans le modal
     */
    private getCurrentFollowerCount(): number {
        const modal = document.querySelector('div[role="dialog"]');
        if (!modal) return 0;
        return modal.querySelectorAll('a[href^="/"]').length;
    }

    /**
     * Extrait les usernames visibles dans le modal
     * Pattern inspiré d'OpenCLI/Playwright agents
     */
    private extractVisibleFollowers(): string[] {
        const followers: string[] = [];
        const seen = new Set<string>(); // Éviter les doublons

        // Pattern OpenCLI: div[role="dialog"] a[href^="/"]
        const modal = document.querySelector('div[role="dialog"]');
        if (!modal) {
            console.warn('⚠️ Modal not found');
            return followers;
        }

        // Chercher tous les liens de profil (pattern OpenCLI)
        const links = modal.querySelectorAll('a[href^="/"]');

        links.forEach(linkEl => {
            const href = linkEl.getAttribute('href');
            if (href) {
                // Pattern OpenCLI: href.strip('/').split('/')[0]
                const username = href
                    .replace(/^\//, '')    // strip('/') initial
                    .replace(/\/$/, '')    // strip('/') final
                    .split('/')[0];        // Prendre le premier segment
                
                // Pattern OpenCLI: filtrer explore, reels, direct
                const invalidPrefixes = ['explore', 'p', 'reel', 'reels', 'stories', 'direct', 'accounts'];
                const isValid = username && 
                               username.length > 0 && 
                               !invalidPrefixes.includes(username) &&
                               !seen.has(username);
                
                if (isValid) {
                    seen.add(username);
                    followers.push(username);
                }
            }
        });

        console.log(`✅ Extracted ${followers.length} unique followers from ${links.length} links`);
        return followers;
    }

    /**
     * Détecte si on a atteint la fin de la liste
     */
    private isEndOfList(currentCount: number): boolean {
        // Si le nombre de followers n'a pas changé après plusieurs scrolls
        if (currentCount === this.lastFollowerCount) {
            this.stuckCount++;
            console.log(`🔄 Aucun follower supplémentaire chargé (${this.stuckCount}/${this.maxStuckAttempts})`);
        } else {
            this.stuckCount = 0;
            this.lastFollowerCount = currentCount;
        }

        return this.stuckCount >= this.maxStuckAttempts;
    }

    /**
     * Vérifie si le modal est toujours ouvert
     */
    isModalOpen(): boolean {
        return document.querySelector('div[role="dialog"]') !== null;
    }

    /**
     * Ferme le modal
     */
    closeModal(): void {
        const closeButton = document.querySelector('div[role="dialog"] button[aria-label*="Close"]');
        if (closeButton instanceof HTMLElement) {
            closeButton.click();
            console.log('✅ Modal fermé');
        }
    }

    /**
     * Utilitaire : sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset l'état du scroller
     */
    reset(): void {
        this.scrollContainer = null;
        this.lastFollowerCount = 0;
        this.stuckCount = 0;
    }
}
