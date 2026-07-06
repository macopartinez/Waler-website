/**
 * Instagram API Interceptor
 *
 * NOTE IMPORTANTE : Les content scripts s'exécutent dans un monde ISOLÉ et ne peuvent
 * pas intercepter les vrais appels `fetch`/`XHR` de la page. C'est le script
 * `page-interceptor.ts` (injecté dans le monde MAIN) qui surcharge réellement `fetch`/`XHR`
 * et nous transmet les réponses via `window.postMessage`.
 *
 * Cette classe écoute ces messages et déclenche les callbacks correspondants.
 */

const PAGE_INTERCEPTOR_SOURCE = 'WALER_PAGE_INTERCEPTOR';

/** Pagination d'une réponse de liste followers/following. */
export interface PageInfo {
  hasNextPage: boolean;
  /** Curseur de reprise (GraphQL `end_cursor` ou REST `next_max_id`). */
  endCursor?: string;
}

/**
 * Extrait la pagination d'une réponse de liste, en couvrant les 2 formats IG :
 *  - REST  `/api/v1/friendships/{id}/followers/` → { users:[…], next_max_id? }
 *          (next_max_id présent = encore des pages ; absent/vide = fin)
 *  - GraphQL → …edge_followed_by.page_info { has_next_page, end_cursor }
 * Renvoie null si la réponse n'est pas une liste paginée (pour ne pas réagir à
 * une réponse sans rapport).
 */
export function extractPageInfo(data: any): PageInfo | null {
  // Format REST (friendships followers/following)
  if (data && Array.isArray(data.users)) {
    const next = typeof data.next_max_id === 'string' ? data.next_max_id : '';
    return { hasNextPage: next.length > 0, endCursor: next || undefined };
  }
  // Format GraphQL : un objet {edges:[…], page_info:{has_next_page,…}}
  let found: PageInfo | null = null;
  const walk = (obj: any) => {
    if (found || !obj || typeof obj !== 'object') return;
    const pi = obj.page_info;
    if (pi && typeof pi.has_next_page === 'boolean' && Array.isArray(obj.edges)) {
      found = { hasNextPage: pi.has_next_page, endCursor: pi.end_cursor ?? undefined };
      return;
    }
    for (const key in obj) {
      if (found) break;
      if (Object.prototype.hasOwnProperty.call(obj, key)) walk(obj[key]);
    }
  };
  walk(data);
  return found;
}

export class InstagramAPIInterceptor {
  private followers: Set<string> = new Set();
  private isIntercepting = false;
  private onUserInfoCallback: ((data: any) => void) | null = null;
  private onFollowersCallback: ((followers: string[]) => void) | null = null;
  private onRateLimitCallback: ((info: { url: string; status: number }) => void) | null = null;
  private onPageInfoCallback: ((info: PageInfo) => void) | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  /**
   * Callback déclenché quand Instagram renvoie un rate-limit (429) sur un
   * endpoint followers/following. Sert à déclencher le backoff de scan-budget.
   */
  onRateLimit(cb: (info: { url: string; status: number }) => void) {
    this.onRateLimitCallback = cb;
  }

  /**
   * Callback déclenché quand une réponse de liste (followers/following) contient
   * l'info de pagination. `hasNextPage=false` = fin AUTHENTIQUE de la liste
   * (bien plus fiable que la détection "stuck" du scroller). 100 % passif : on
   * ne fait que lire une réponse qu'Instagram a déjà renvoyée.
   */
  onPageInfo(cb: (info: PageInfo) => void) {
    this.onPageInfoCallback = cb;
  }

  start(onFollowersReceived: (followers: string[]) => void, onUserInfo?: (data: any) => void) {
    // On met à jour les callbacks même si déjà en cours (utilisé pendant les scans)
    this.onFollowersCallback = onFollowersReceived;
    this.onUserInfoCallback = onUserInfo || null;

    if (this.isIntercepting) {
      console.log('🔌 API interception already active, callbacks updated');
      return;
    }

    console.log('🔌 Starting Instagram API interception (listening to MAIN world)...');
    this.isIntercepting = true;

    this.messageHandler = (event: MessageEvent) => {
      // Sécurité : n'accepter que les messages de notre propre fenêtre
      if (event.source !== window) return;

      const msg = event.data;
      if (!msg || msg.source !== PAGE_INTERCEPTOR_SOURCE) return;

      if (msg.type === 'RATE_LIMIT') {
        console.warn(`🛑 Rate-limit intercepté (${msg.status}) sur ${msg.url}`);
        this.onRateLimitCallback?.({ url: msg.url, status: msg.status });
        return;
      }

      if (msg.type !== 'API_RESPONSE') return;

      this.handleApiResponse(msg.url, msg.data);
    };

    window.addEventListener('message', this.messageHandler);
  }

  private handleApiResponse(url: string, data: any) {
    try {
      // Vérifier si c'est une réponse avec des informations utilisateur
      const userNode = data?.data?.user || data?.user;
      if (userNode && this.onUserInfoCallback) {
        console.log('📊 User info detected in API response:', url);
        // Normaliser pour que data-collector reçoive toujours data.data.user
        const normalized = data?.data?.user ? data : { data: { user: userNode } };
        this.onUserInfoCallback(normalized);
      }

      // Pagination : signal de fin AUTHENTIQUE (passif) pour le scroller.
      if (this.onPageInfoCallback) {
        const pageInfo = extractPageInfo(data);
        if (pageInfo) {
          console.log(
            `📄 page_info intercepté : hasNextPage=${pageInfo.hasNextPage}` +
              (pageInfo.endCursor ? ` (cursor ${String(pageInfo.endCursor).slice(0, 12)}…)` : '')
          );
          this.onPageInfoCallback(pageInfo);
        }
      }

      // Parser les followers depuis la réponse
      this.parseFollowersFromResponse(data);

      if (this.followers.size > 0 && this.onFollowersCallback) {
        console.log(`📡 Intercepted ${this.followers.size} followers from API`);
        this.onFollowersCallback(Array.from(this.followers));
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
  }

  stop() {
    if (!this.isIntercepting) return;

    console.log('🔌 Stopping Instagram API interception...');
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.isIntercepting = false;
  }

  private parseFollowersFromResponse(data: any) {
    // Parcourir récursivement l'objet pour trouver les usernames
    const findUsernames = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      // Si c'est un objet avec username
      if (obj.username && typeof obj.username === 'string') {
        this.followers.add(obj.username);
      }
      
      // Parcourir les propriétés
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          findUsernames(obj[key]);
        }
      }
    };
    
    findUsernames(data);
  }

  getFollowers(): string[] {
    return Array.from(this.followers);
  }
}
