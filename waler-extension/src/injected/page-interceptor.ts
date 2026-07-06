/**
 * Page Interceptor - S'exécute dans le MONDE PRINCIPAL (MAIN world) de la page Instagram.
 *
 * IMPORTANT : Les content scripts classiques s'exécutent dans un monde ISOLÉ et ne peuvent
 * donc PAS intercepter les vrais appels `fetch`/`XMLHttpRequest` de la page.
 * Ce script est injecté via `world: "MAIN"` dans le manifest, ce qui lui permet de
 * surcharger `window.fetch` et `XMLHttpRequest` réellement utilisés par Instagram.
 *
 * Les données interceptées sont transmises au content script (monde isolé) via
 * `window.postMessage`, qui les relaie ensuite au reste de l'extension.
 */

(function () {
  const SOURCE = 'WALER_PAGE_INTERCEPTOR';

  // Eviter une double injection
  if ((window as any).__walerInterceptorInstalled) {
    return;
  }
  (window as any).__walerInterceptorInstalled = true;

  console.log('🔌 [MAIN] Waler page interceptor installed');

  const RELEVANT_URL_PATTERNS = [
    '/graphql/query',
    '/api/v1/users/',
    'web_profile_info',
    'followers',
    'following',
  ];

  function isRelevantUrl(url: string): boolean {
    if (!url) return false;
    return RELEVANT_URL_PATTERNS.some((pattern) => url.includes(pattern));
  }

  function postToContentScript(url: string, data: any) {
    try {
      window.postMessage(
        {
          source: SOURCE,
          type: 'API_RESPONSE',
          url,
          data,
        },
        '*'
      );
    } catch (e) {
      // Certains objets ne sont pas clonables : on ignore silencieusement
    }
  }

  // Signale un rate-limit (429 / throttle) sur un endpoint pertinent, pour que
  // la couche scan-budget déclenche un backoff. On ne transmet que le minimum.
  function postRateLimit(url: string, status: number) {
    try {
      window.postMessage({ source: SOURCE, type: 'RATE_LIMIT', url, status }, '*');
    } catch (e) {
      /* ignore */
    }
  }

  // --- Intercepter fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args: any[]) {
    const response = await originalFetch.apply(this, args as any);

    try {
      let url = '';
      const input = args[0];
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
      } else if (input && typeof input.url === 'string') {
        url = input.url;
      }

      if (isRelevantUrl(url)) {
        if (response.status === 429) {
          postRateLimit(url, response.status);
        } else {
          response
            .clone()
            .json()
            .then((data) => postToContentScript(url, data))
            .catch(() => {
              /* réponse non-JSON, on ignore */
            });
        }
      }
    } catch (e) {
      /* ignore */
    }

    return response;
  };

  // --- Intercepter XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
    (this as any).__walerUrl = url;
    return originalOpen.call(this, method, url, ...(rest as []));
  };

  XMLHttpRequest.prototype.send = function (...args: any[]) {
    const xhr = this as XMLHttpRequest;
    const url: string = (xhr as any).__walerUrl || '';

    if (isRelevantUrl(url)) {
      xhr.addEventListener('load', function () {
        try {
          if (xhr.status === 429) {
            postRateLimit(url, xhr.status);
            return;
          }
          const contentType = xhr.getResponseHeader('content-type') || '';
          if (contentType.includes('application/json') || xhr.responseType === '' || xhr.responseType === 'text') {
            const text = xhr.responseText;
            if (text) {
              const data = JSON.parse(text);
              postToContentScript(url, data);
            }
          }
        } catch (e) {
          /* réponse non-JSON, on ignore */
        }
      });
    }

    return originalSend.apply(this, args as []);
  };
})();
