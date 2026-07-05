// Using Chrome API
import { SyncManager } from './sync-manager.js';
import { ClassificationManager } from './classification-manager.js';
import { accountGet, accountSet, upsertAccount } from './account-storage.js';
import { API_BASE } from '../config.js';

const syncManager = new SyncManager();
const classificationManager = new ClassificationManager();

// Réinitialiser les stats à minuit chaque jour
async function scheduleNextMidnightReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const timeUntilMidnight = tomorrow.getTime() - now.getTime();
  
  console.log(`⏰ Next stats reset scheduled in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes (at midnight)`);
  
  setTimeout(async () => {
    console.log('🌙 Midnight! Resetting daily stats...');
    await syncManager.resetStats();
    
    // Notifier le popup si ouvert
    chrome.runtime.sendMessage({ type: 'STATS_RESET_MIDNIGHT' }).catch(() => {});
    
    // Programmer le prochain reset
    scheduleNextMidnightReset();
  }, timeUntilMidnight);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('🚀 Waler Extension installed/updated, reason:', details.reason);

  // Only wipe auth on a genuine first install, not on extension reloads/updates
  // (onInstalled fires on every dev-mode reload which would log the user out)
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      isAuthenticated: false,
      userId: null,
      lastSync: null,
    });
  }

  chrome.alarms.create('sync-data', {
    periodInMinutes: 5,
  });

  // Démarrer le scheduler de reset à minuit
  scheduleNextMidnightReset();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-data') {
    console.log('⏰ Syncing data...');
    await refreshProStatus();
    await syncManager.syncToServer();
  }
});

// Écouter les messages depuis la page web (externe)
chrome.runtime.onMessageExternal.addListener((message: any, sender: any, sendResponse: any) => {
  console.log('📨 External message received:', message.type, 'from:', sender.url);

  if (message.type === 'WALER_AUTH' && message.userId && message.token) {
    console.log('🔐 Received authentication token from Waler website');
    
    // Valider le token auprès du backend
    fetch(API_BASE + '/api/extension/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: message.token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.valid && data.userId === message.userId) {
          console.log('✅ Token validated, storing authentication...');
          return chrome.storage.local.set({
            isAuthenticated: true,
            userId: message.userId,
            apiToken: message.token,
            lastSync: Date.now(),
            subscriptionActive: data.subscriptionActive === true,
          });
        } else {
          throw new Error('Token validation failed');
        }
      })
      .then(() => {
        console.log('✅ Extension authenticated successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('❌ Authentication error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Indique que sendResponse sera appelé de manière asynchrone
  }

  // Ping de détection : la page d'onboarding vérifie que l'extension est installée.
  if (message.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  // Vérifie qu'un pseudo Instagram existe réellement (anti-faute de frappe lors
  // de l'ajout d'une personne au dashboard). Utilise la session IG de
  // l'utilisateur via web_profile_info.
  if (message.type === 'CHECK_IG_USERNAME') {
    const username: string = (message.username || '').trim().replace(/^@/, '');

    (async () => {
      if (!username) {
        sendResponse({ exists: false });
        return;
      }
      try {
        const cookie = await chrome.cookies.get({
          url: 'https://www.instagram.com',
          name: 'ds_user_id',
        });
        if (!cookie?.value) {
          // Pas de session IG → on ne peut pas vérifier (l'appelant ne bloque pas).
          sendResponse({ loggedIn: false });
          return;
        }

        const resp = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
          { method: 'GET', credentials: 'include', headers: { 'x-ig-app-id': '936619743392459' } },
        );

        if (resp.status === 404) {
          sendResponse({ loggedIn: true, exists: false });
          return;
        }
        if (!resp.ok) {
          // Rate-limit / erreur → indéterminé, on ne bloque pas l'utilisateur.
          console.warn(`⚠️ [CHECK_IG_USERNAME] web_profile_info a répondu ${resp.status}`);
          sendResponse({ loggedIn: true, error: `HTTP ${resp.status}` });
          return;
        }

        const data = await resp.json();
        const user = data?.data?.user;
        if (user?.username) {
          sendResponse({
            loggedIn: true,
            exists: true,
            username: user.username,
            fullName: user.full_name || '',
          });
        } else {
          sendResponse({ loggedIn: true, exists: false });
        }
      } catch (error: any) {
        console.error('❌ [CHECK_IG_USERNAME] Erreur:', error);
        sendResponse({ loggedIn: true, error: error?.message });
      }
    })();

    return true; // sendResponse asynchrone
  }

  // Vérification de propriété du compte Instagram pendant l'onboarding.
  // On lit le compte RÉELLEMENT connecté (cookie ds_user_id), on résout son
  // username via l'API IG, et on le compare au username saisi par l'utilisateur.
  if (message.type === 'VERIFY_IG_OWNERSHIP') {
    const claimedUsername: string = (message.claimedUsername || '').trim();

    (async () => {
      try {
        const cookie = await chrome.cookies.get({
          url: 'https://www.instagram.com',
          name: 'ds_user_id',
        });
        const dsUserId = cookie?.value;
        if (!dsUserId) {
          sendResponse({ loggedIn: false });
          return;
        }

        // Même appel que fetchRealFollowerCount() côté content script : fiable et
        // indépendant du profil affiché (host_permissions instagram.com → cookies envoyés).
        const resp = await fetch(`https://www.instagram.com/api/v1/users/${dsUserId}/info/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'x-ig-app-id': '936619743392459' },
        });

        if (!resp.ok) {
          console.warn(`⚠️ [VERIFY] users/${dsUserId}/info a répondu ${resp.status}`);
          sendResponse({ loggedIn: true, verified: false, dsUserId });
          return;
        }

        const data = await resp.json();
        const igUsername: string | undefined = data?.user?.username;
        const verified =
          !!igUsername &&
          igUsername.toLowerCase() === claimedUsername.toLowerCase();

        sendResponse({ loggedIn: true, verified, igUsername, dsUserId });
      } catch (error: any) {
        console.error('❌ [VERIFY] Erreur de vérification de propriété:', error);
        sendResponse({ loggedIn: true, verified: false, error: error?.message });
      }
    })();

    return true; // sendResponse asynchrone
  }
});

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  console.log('📨 Message received:', message.type);

  // Fonction async pour gérer les opérations asynchrones
  (async () => {
    switch (message.type) {
      case 'WALER_AUTH':
        console.log('🔐 Received authentication from Waler');
        
        // Valider le token auprès du backend
        try {
          const validateResponse = await fetch(API_BASE + '/api/extension/validate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: message.apiToken }),
          });
          
          const validateData = await validateResponse.json();
          
          if (validateData.valid && validateData.userId === message.userId) {
            console.log('✅ Token validated, storing authentication...');
            await chrome.storage.local.set({
              isAuthenticated: true,
              userId: message.userId,
              apiToken: message.apiToken,
              subscriptionTier: validateData.subscriptionTier ?? null,
              isPro: validateData.isPro === true,
              lastSync: Date.now(),
            });
            console.log(`✅ Extension authenticated successfully (tier: ${validateData.subscriptionTier ?? 'n/a'}, pro: ${validateData.isPro === true})`);
            sendResponse({ success: true });
          } else {
            console.error('❌ Token validation failed');
            sendResponse({ success: false, error: 'Token validation failed' });
          }
        } catch (error: any) {
          console.error('❌ Authentication error:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'REFRESH_PRO_STATUS':
        // Rafraîchit le flag global isPro depuis le backend (cookie de session).
        {
          const isPro = await refreshProStatus();
          sendResponse({ success: true, isPro });
        }
        break;

      case 'TRACK_FOLLOWER':
        await syncManager.trackFollower(message.data);
        sendResponse({ success: true });
        break;

      case 'TRACK_UNFOLLOWER':
        await syncManager.trackUnfollower(message.data);
        sendResponse({ success: true });
        break;

      case 'TRACK_POTENTIAL_BLOCKER':
      case 'TRACK_GHOST':
        await syncManager.trackGhost(message.data);
        sendResponse({ success: true });
        break;

      case 'PERSON_CLASSIFIED':
        await syncManager.classifyPerson();
        sendResponse({ success: true });
        break;

      case 'TRACK_ENGAGEMENT':
        await syncManager.trackEngagement(message.data);
        sendResponse({ success: true });
        break;

      case 'SYNC_NOW':
        await syncManager.syncToServer();
        // Forcer la mise à jour du compteur de followers même si la queue était vide
        {
          const syncNowStored = await accountGet(['userInfo', 'userId', 'apiToken', 'isAuthenticated']);
          if (syncNowStored.isAuthenticated && syncNowStored.userId && syncNowStored.userInfo) {
            try {
              await syncManager.updateUserInfo(syncNowStored.userInfo, syncNowStored.userId, syncNowStored.apiToken);
              console.log('✅ [SYNC_NOW] User info force-synced to backend');
            } catch (e) {
              console.error('❌ [SYNC_NOW] Failed to force-update user info:', e);
            }
          }
        }
        // Notifier le dashboard de rafraîchir ses données
        {
          const syncTabs = await chrome.tabs.query({});
          for (const tab of syncTabs) {
            if (tab.url?.startsWith(API_BASE)) {
              try {
                await chrome.tabs.sendMessage(tab.id!, {
                  type: 'REFRESH_DASHBOARD',
                  data: { syncCompleted: true }
                });
              } catch (_) { /* tab sans content script */ }
            }
          }
        }
        sendResponse({ success: true });
        break;

      case 'GET_STATS':
        const stats = await syncManager.getLocalStats();
        sendResponse({ success: true, data: stats });
        break;

      case 'GET_PEOPLE':
        // Récupère la liste des contacts (circle_members) pour la section Pro.
        // credentials:'include' → envoie le cookie de session du dashboard
        // (host_permissions localhost:5000 contourne CORS en MV3).
        try {
          // Cibler EXPLICITEMENT le compte Instagram actif (son accountId backend)
          // pour ne pas lire les People d'un autre compte si la session backend
          // n'est pas alignée sur le compte sélectionné dans l'extension.
          const activeStoreP = await chrome.storage.local.get('activeDsUserId');
          const regP = await accountGet('accountRegistry');
          const activeEntryP = regP.accountRegistry?.accounts?.[activeStoreP.activeDsUserId];
          const activeAccIdP = activeEntryP?.accountId;
          // Compte explicitement choisi dans la section Pro (repli) sinon compte actif.
          const activeUserP = message.username || activeEntryP?.igUsername;
          // On envoie le username Instagram actif (résolution fiable côté waler.db,
          // car l'accountId Supabase peut différer de l'id waler.db) + l'accountId
          // en repli.
          const peopleParams = new URLSearchParams();
          if (activeUserP) peopleParams.set('username', activeUserP);
          if (activeAccIdP) peopleParams.set('accountId', String(activeAccIdP));
          const peopleQs = peopleParams.toString();
          const peopleUrl = `${API_BASE}/api/extension/people${peopleQs ? `?${peopleQs}` : ''}`;
          console.log('🔎 GET_PEOPLE diag →', {
            activeDsUserId: activeStoreP.activeDsUserId,
            igUsername: activeEntryP?.igUsername,
            accountId: activeAccIdP,
            url: peopleUrl,
          });
          const peopleResp = await fetch(peopleUrl, {
            method: 'GET',
            credentials: 'include',
          });
          if (!peopleResp.ok) {
            const body = await peopleResp.text().catch(() => '');
            console.warn('⚠️ GET_PEOPLE: HTTP', peopleResp.status, body.slice(0, 200));
            sendResponse({ success: false, error: `HTTP ${peopleResp.status}`, people: [] });
            break;
          }
          const peopleData = await peopleResp.json();
          console.log(`🔎 GET_PEOPLE résultat → ${(peopleData.people || []).length} contact(s)`, peopleData.people);
          sendResponse({ success: true, people: peopleData.people || [] });
        } catch (error: any) {
          console.error('Error fetching people:', error);
          sendResponse({ success: false, error: error.message, people: [] });
        }
        break;

      case 'RESTORE_FOLLOWERS':
        // Récupère les followers du compte actif depuis le backend (Postgres) pour
        // reconstruire la base locale sans re-scanner Instagram. credentials:'include'
        // → cookie de session ; le compte actif backend doit être aligné (SET_ACTIVE_ACCOUNT).
        try {
          // Cibler EXPLICITEMENT le compte actif (son accountId backend) pour ne
          // pas récupérer les followers d'un autre compte si la session n'est pas
          // alignée — sinon contamination (ex. 214 de @pako_mrtz dans @eth4nduvin).
          const activeStoreR = await chrome.storage.local.get('activeDsUserId');
          const regR = await accountGet('accountRegistry');
          const activeAccId =
            regR.accountRegistry?.accounts?.[activeStoreR.activeDsUserId]?.accountId;
          const restoreUrl = activeAccId
            ? `${API_BASE}/api/extension/followers?accountId=${activeAccId}`
            : `${API_BASE}/api/extension/followers`;
          const restoreResp = await fetch(restoreUrl, {
            method: 'GET',
            credentials: 'include',
          });
          if (!restoreResp.ok) {
            console.warn('⚠️ RESTORE_FOLLOWERS: réponse', restoreResp.status);
            sendResponse({ success: false, error: `HTTP ${restoreResp.status}`, followers: [] });
            break;
          }
          const restoreData = await restoreResp.json();
          sendResponse({
            success: true,
            followers: restoreData.followers || [],
            totalCount: restoreData.totalCount || 0,
          });
        } catch (error: any) {
          console.error('Error restoring followers:', error);
          sendResponse({ success: false, error: error.message, followers: [] });
        }
        break;

      case 'AUTHENTICATE':
        await chrome.storage.local.set({
          isAuthenticated: true,
          userId: message.userId,
          apiToken: message.token,
        });
        sendResponse({ success: true });
        break;

      case 'LINK_ACCOUNT':
        // Lier le compte Insta courant (ds_user_id) au login FlowTrack : crée/
        // retrouve une ligne app_users côté backend et l'enregistre dans le
        // registre local. Le namespace de stockage est déjà actif (content script).
        try {
          const { dsUserId, igUsername } = message.data || {};
          if (!dsUserId) {
            sendResponse({ success: false, error: 'dsUserId manquant' });
            break;
          }

          const linkStored = await chrome.storage.local.get('apiToken');
          if (!linkStored.apiToken) {
            sendResponse({ success: false, error: 'Not authenticated' });
            break;
          }

          const linkResp = await fetch(API_BASE + '/api/accounts/link', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${linkStored.apiToken}`,
            },
            credentials: 'include',
            body: JSON.stringify({ igUsername, dsUserId }),
          });

          if (!linkResp.ok) {
            const errText = await linkResp.text();
            console.error('❌ LINK_ACCOUNT backend error:', linkResp.status, errText);
            sendResponse({ success: false, error: `HTTP ${linkResp.status}` });
            break;
          }

          const linkData = await linkResp.json();
          const account = await upsertAccount(dsUserId, {
            igUsername,
            accountId: linkData.accountId,
            avatarUrl: linkData.avatarUrl,
          });
          console.log(`🔗 Compte lié: @${igUsername} → accountId ${linkData.accountId}`);
          sendResponse({ success: true, account });
        } catch (error: any) {
          console.error('Error linking account:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'GET_ACCOUNTS':
        // Liste des comptes liés + compte actif, pour le popup. On fusionne le
        // registre local avec la liste backend (/api/accounts) pour rester
        // cohérent même si les comptes ont été liés ailleurs (autre appareil,
        // dashboard...). On indexe par instagram_user_id (= ds_user_id).
        try {
          const accTokenStore = await chrome.storage.local.get('apiToken');
          if (accTokenStore.apiToken) {
            try {
              const r = await fetch(API_BASE + '/api/accounts', {
                headers: { Authorization: `Bearer ${accTokenStore.apiToken}` },
                credentials: 'include',
              });
              if (r.ok) {
                const d = await r.json();
                for (const a of (d.accounts || [])) {
                  if (a.instagramUserId) {
                    await upsertAccount(String(a.instagramUserId), {
                      igUsername: a.username,
                      accountId: a.id,
                      avatarUrl: a.avatarUrl,
                    });
                  }
                }
              }
            } catch (e) {
              console.warn('⚠️ GET_ACCOUNTS: fusion backend échouée (non bloquant):', e);
            }
          }

          const reg = await accountGet('accountRegistry');
          const activeStored = await chrome.storage.local.get('activeDsUserId');
          sendResponse({
            success: true,
            accounts: (reg.accountRegistry?.accounts) || {},
            activeDsUserId: activeStored.activeDsUserId || null,
          });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message, accounts: {} });
        }
        break;

      case 'SET_ACTIVE_ACCOUNT':
        // Bascule le compte actif depuis le popup d'extension.
        try {
          const targetDs = message.dsUserId;
          if (!targetDs) {
            sendResponse({ success: false, error: 'dsUserId manquant' });
            break;
          }
          await chrome.storage.local.set({ activeDsUserId: targetDs });

          // Si le compte a un accountId backend, synchroniser le compte actif côté serveur.
          const reg2 = await accountGet('accountRegistry');
          const entry = reg2.accountRegistry?.accounts?.[targetDs];
          const tokenStore = await chrome.storage.local.get('apiToken');
          if (entry?.accountId && tokenStore.apiToken) {
            try {
              await fetch(API_BASE + '/api/accounts/switch', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${tokenStore.apiToken}`,
                },
                credentials: 'include',
                body: JSON.stringify({ accountId: entry.accountId }),
              });
            } catch (e) {
              console.warn('⚠️ Backend switch failed (non bloquant):', e);
            }
          }
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
        break;

    // ==================== DM HANDLERS ====================

      case 'NEW_DM':
        // Store DM locally
        await storeDMLocally(message.message);
        console.log(`💬 DM stored: @${message.message.conversationWith}`);
        sendResponse({ success: true });
        break;

      case 'SYNC_DMS':
        // Sync DMs to backend
        await syncDMsToBackend(message.messages, message.conversations);
        sendResponse({ success: true });
        break;

      case 'GET_DM_CONVERSATIONS':
        const conversations = await getDMConversations();
        sendResponse({ success: true, conversations });
        break;

      case 'GET_DM_HISTORY':
        // Historique DM stocké (chronologique) d'un contact — utilisé par le
        // collector Pro pour le scroll incrémental + la fusion avant analyse.
        {
          const dmHistory = await getDMHistory(message.username);
          sendResponse({ success: true, messages: dmHistory });
        }
        break;

      case 'SYNC_PRO_ENGAGEMENT':
        // Engagement Pro collecté par le content script (likes + commentaires des
        // People sur les posts de l'utilisateur). credentials:'include' → cookie
        // de session du dashboard.
        try {
          const engResp = await fetch(API_BASE + '/api/extension/pro-engagement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              engagements: message.engagements || [],
              analyzedPosts: message.analyzedPosts || [],
              engagers: message.engagers || [],
              mutuals: message.mutuals || [],
              // Posts à liste de likers tronquée (plafond IG) : une People non vue
              // sur ces posts est incertaine, pas un "n'a pas liké" fiable.
              partialLikePosts: message.partialLikePosts || [],
              ownUsername: message.ownUsername || '',
            }),
          });
          const engData = engResp.ok ? await engResp.json() : null;
          sendResponse({ success: engResp.ok, ...(engData || { error: `HTTP ${engResp.status}` }) });
        } catch (error: any) {
          console.error('Error syncing pro engagement:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'COLLECT_PERSON_PROFILE': {
        // Prépare le profil d'un People avec UNIQUEMENT les données qui remplissent
        // les stats de la fiche : connection status (follows-you / you-follow, via
        // web_profile_info) et connexions mutuelles (comptes en commun, via l'API
        // friendships). Aucune navigation/scroll. Persisté côté serveur
        // (→ profile_collected_at) : bascule ensuite le bouton du People de
        // « collecte+conversation » à « conversation seule + Refresh profile ».
        const contactUsername: string = (message.username || '').trim().replace(/^@/, '');
        if (!contactUsername) {
          sendResponse({ success: false, error: 'username manquant' });
          break;
        }
        try {
          const resp = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(contactUsername)}`,
            { method: 'GET', credentials: 'include', headers: { 'x-ig-app-id': '936619743392459' } },
          );
          if (!resp.ok) {
            console.warn(`⚠️ [COLLECT_PERSON_PROFILE] web_profile_info → HTTP ${resp.status}`);
            sendResponse({ success: false, error: `HTTP ${resp.status}` });
            break;
          }
          const data = await resp.json();
          const user = data?.data?.user;
          if (!user) {
            sendResponse({ success: false, error: 'profil introuvable' });
            break;
          }

          // Compte Instagram actif → ciblage fiable du bucket waler.db (l'id Supabase
          // de session peut différer ; cf. UPDATE_CONTACT_SCORE).
          const activeStoreCp = await chrome.storage.local.get('activeDsUserId');
          const regCp = await accountGet('accountRegistry');
          const accountUsername =
            regCp.accountRegistry?.accounts?.[activeStoreCp.activeDsUserId]?.igUsername;

          // Connexions mutuelles (comptes en commun avec le compte connecté).
          // Best-effort : un échec laisse 0 sans bloquer la connection status.
          let mutual = { count: 0, members: [] as string[] };
          if (user.id) {
            try {
              mutual = await computeMutualConnections(String(user.id));
            } catch (e) {
              console.warn('⚠️ [COLLECT_PERSON_PROFILE] mutuals échoué:', e);
            }
          }

          const profile = {
            contactUsername,
            accountUsername,
            followsYou: !!user.follows_viewer,
            youFollow: !!user.followed_by_viewer,
            mutualConnections: mutual.count,
            mutualConnectionsList: mutual.members,
            fullName: user.full_name || '',
            profilePicUrl: user.profile_pic_url || '',
          };

          const saveResp = await fetch(API_BASE + '/api/extension/person-profile', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
          });
          const saveData = saveResp.ok ? await saveResp.json() : null;
          sendResponse({
            success: saveResp.ok,
            ...(saveData || { error: `HTTP ${saveResp.status}` }),
          });
        } catch (error: any) {
          console.error('❌ [COLLECT_PERSON_PROFILE] Erreur:', error);
          sendResponse({ success: false, error: error?.message });
        }
        break;
      }

    // ==================== CLASSIFICATION HANDLERS ====================

      case 'UPDATE_CONTACT_SCORE': {
        // Update contact score in backend (+ axe température : dynamique de conversation).
        // Résoudre le username Instagram du compte ACTIF : le backend l'utilise pour
        // viser le bon bucket waler.db (l'id Supabase ≠ id waler.db → sans ça le
        // score atterrit dans un autre compte et la carte People ne se synchro pas).
        const activeStoreS = await chrome.storage.local.get('activeDsUserId');
        const regS = await accountGet('accountRegistry');
        const accountUsername = regS.accountRegistry?.accounts?.[activeStoreS.activeDsUserId]?.igUsername;
        await updateContactScore(message.username, message.scoreBreakdown, message.category || 'lead', {
          temperature: message.temperature,
          dynamics: message.dynamics,
          advice: message.advice,
          settingPhase: message.settingPhase,
          settingSummary: message.settingSummary,
          accountUsername,
        });
        sendResponse({ success: true });
        break;
      }

      case 'ANALYZE_DMS':
        // Score DM quantitatif côté serveur (après SYNC_DMS)
        {
          const dmScore = await analyzeDMsOnServer(message.username);
          sendResponse({ success: true, dmScore });
        }
        break;

      case 'UPDATE_CONTACT_NAME':
        // Persiste le nom de profil résolu par l'extension (full_name était null
        // car l'ajout d'un People ne saisit que l'id).
        await updateContactName(message.username, message.fullName);
        sendResponse({ success: true });
        break;

      case 'CREATE_SUGGESTION':
        // Create classification suggestion
        const suggestion = await createSuggestion(
          message.username,
          message.transition,
          message.scoreBreakdown
        );
        
        if (suggestion) {
          // Update badge
          await classificationManager.updateBadge();
        }
        
        sendResponse({ success: true, suggestion });
        break;

      case 'GET_SUGGESTIONS':
        const suggestions = await classificationManager.getPendingSuggestions();
        sendResponse({ success: true, suggestions });
        break;

      case 'ACCEPT_SUGGESTION':
        const accepted = await classificationManager.acceptSuggestion(message.suggestionId);
        if (accepted) {
          await classificationManager.updateBadge();
        }
        sendResponse({ success: accepted });
        break;

      case 'REJECT_SUGGESTION':
        const rejected = await classificationManager.rejectSuggestion(
          message.suggestionId,
          message.reason
        );
        if (rejected) {
          await classificationManager.updateBadge();
        }
        sendResponse({ success: rejected });
        break;

    // ==================== FOLLOWER MONITORING ====================

      case 'FOLLOWER_CHANGE_DETECTED':
        // Create notification for follower change
        const changeType = message.changeType === 'follower' ? 'new follower(s)' : 'unfollower(s)';
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: `${message.count} ${changeType} detected!`,
          message: 'Click the Waler icon to sync.',
          priority: 2
        });
        sendResponse({ success: true });
        break;

      case 'UPDATE_BADGE':
        // Update extension badge (couleur optionnelle, vert par défaut)
        chrome.action.setBadgeText({ text: message.text });
        chrome.action.setBadgeBackgroundColor({ color: message.color || '#00FF00' });
        sendResponse({ success: true });
        break;

      case 'PRO_REQUEST_ATTENTION':
        // L'analyse Pro attend une autorisation, mais l'onglet Instagram n'est
        // peut-être pas au premier plan (l'utilisateur a changé d'onglet/fenêtre).
        // On ramène l'onglet ET sa fenêtre au premier plan, on flashe le badge et
        // on émet une notification système (visible même hors du navigateur).
        try {
          const attTab = sender?.tab;
          if (attTab?.id != null) {
            await chrome.tabs.update(attTab.id, { active: true });
            if (attTab.windowId != null) {
              await chrome.windows.update(attTab.windowId, { focused: true, drawAttention: true });
            }
          }
          chrome.action.setBadgeText({ text: '❗' });
          chrome.action.setBadgeBackgroundColor({ color: '#FF6B00' });
          chrome.notifications.create('waler-pro-permission', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Authorization needed',
            message: message.reason || 'Waler needs your authorization to open a conversation.',
            priority: 2,
          });
          sendResponse({ success: true });
        } catch (error) {
          console.error('PRO_REQUEST_ATTENTION error:', error);
          sendResponse({ success: false, error: String(error) });
        }
        break;

      case 'PRO_NOTIFY':
        // Notification système générique pour l'analyse Pro (fin/refus/erreur),
        // visible même si l'utilisateur n'est pas sur l'onglet Instagram.
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: message.title || 'Waler',
            message: message.body || '',
            priority: 1,
          });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
        break;

      case 'CHECK_NOTIFICATIONS':
        // Vérifier les notifications pour détecter les unfollowers cachés
        (async () => {
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
              await chrome.tabs.sendMessage(tabs[0].id, { 
                type: 'START_NOTIFICATION_CHECK' 
              });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'No active tab' });
            }
          } catch (error) {
            console.error('Error checking notifications:', error);
            sendResponse({ success: false, error: String(error) });
          }
        })();
        return true; // Keep channel open for async response
      
      case 'INITIAL_SCAN_REQUIRED':
        // Notification pour scan initial requis
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Initial scan required',
          message: 'Click the Waler icon to start scanning your followers.',
          priority: 2
        });
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF6B00' });
        sendResponse({ success: true });
        break;

      case 'SCAN_PROGRESS':
        // Mettre à jour le badge avec la progression
        const progress = Math.floor((message.current / message.total) * 100);
        chrome.action.setBadgeText({ text: `${progress}%` });
        chrome.action.setBadgeBackgroundColor({ color: '#0095F6' });
        
        // Stocker la progression pour le popup
        await accountSet({
          scanProgress: {
            current: message.current,
            total: message.total,
            percentage: progress
          }
        });
        sendResponse({ success: true });
        break;

      case 'CLEAR_STORAGE':
        // Réinitialiser complètement l'extension (pour tests)
        await chrome.storage.local.clear();
        chrome.action.setBadgeText({ text: '' });
        console.log('🔄 Extension storage cleared - Reset to first use');
        sendResponse({ success: true });
        break;

      case 'SEND_UNFOLLOWER_RESULTS':
        // Envoyer les résultats de l'analyse des unfollowers au backend
        try {
          const stored = await chrome.storage.local.get('apiToken');
          
          if (!stored.apiToken) {
            console.error('No API token found');
            sendResponse({ success: false, error: 'Not authenticated' });
            break;
          }

          const response = await fetch(API_BASE + '/api/extension/verify-missing-followers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${stored.apiToken}`,
            },
            body: JSON.stringify(message.data),
          });

          const result = await response.json();
          
          if (response.ok) {
            console.log('✅ Unfollower results sent to backend:', result);
            sendResponse({ success: true, data: result });
          } else {
            console.error('❌ Failed to send unfollower results:', result);
            sendResponse({ success: false, error: result.message });
          }
        } catch (error: any) {
          console.error('Error sending unfollower results:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'UNFOLLOWER_ANALYSIS_PROGRESS':
        // Mettre à jour la progression de l'analyse des unfollowers
        const analysisProgress = message.data;
        chrome.action.setBadgeText({ text: `${analysisProgress.percentage}%` });
        chrome.action.setBadgeBackgroundColor({ color: '#FF6B00' });
        
        // Stocker la progression
        await accountSet({
          unfollowerAnalysisProgress: analysisProgress
        });
        sendResponse({ success: true });
        break;

      case 'RESET_STATS':
        // Réinitialiser les statistiques de session
        await syncManager.resetStats();
        console.log('🔄 Session stats reset');
        sendResponse({ success: true });
        break;

      case 'REPAIR_FOLLOWER_DB': {
        // Supprimer les entrées ajoutées aujourd'hui par le bug de détection de faux followers
        const repairStored = await accountGet(['followerDatabase', 'lastFollowerCount', 'userInfo']);
        const repairDb = repairStored.followerDatabase;

        if (!repairDb || !repairDb.followers) {
          sendResponse({ success: false, error: 'Base de données introuvable' });
          break;
        }

        const today = new Date().toISOString().slice(0, 10); // "2026-06-16"
        const originalEntries = Object.entries(repairDb.followers as Record<string, any>);
        const originalCount = originalEntries.length;

        const cleanedFollowers: Record<string, any> = {};
        for (const [username, data] of originalEntries) {
          // Garder les entrées qui NE sont PAS d'aujourd'hui
          if (!data.addedAt || !data.addedAt.startsWith(today)) {
            cleanedFollowers[username] = data;
          }
        }

        const removedCount = originalCount - Object.keys(cleanedFollowers).length;
        const repairedDb = {
          ...repairDb,
          followers: cleanedFollowers,
          totalCount: Object.keys(cleanedFollowers).length,
        };

        await accountSet({
          followerDatabase: repairedDb,
          // Effacer la fausse alarme unfollower déclenchée par le bug
          unfollowerDetected: false,
          unfollowerCount: 0,
          // Réinitialiser le check des notifications pour repartir proprement
          lastNotificationCheck: 0,
        });

        console.log(`🔧 DB réparée: ${removedCount} entrées supprimées (${originalCount} → ${Object.keys(cleanedFollowers).length})`);
        sendResponse({ success: true, removed: removedCount, remaining: Object.keys(cleanedFollowers).length });
        break;
      }

      case 'GET_DB_DUMP': {
        const dumpStored = await accountGet([
          'followerDatabase', 'lastFollowerCount', 'unfollowerDetected',
          'unfollowerCount', 'lastNotificationCheck', 'sessionStats',
        ]);
        const dumpDb = dumpStored.followerDatabase;
        const usernames = dumpDb ? Object.keys(dumpDb.followers || {}) : [];
        sendResponse({
          success: true,
          totalCount: dumpDb?.totalCount ?? 0,
          entriesInDB: usernames.length,
          isInitialized: dumpDb?.isInitialized ?? false,
          firstFollowerId: dumpDb?.firstFollowerId ?? null,
          lastFollowerCount: dumpStored.lastFollowerCount ?? 0,
          unfollowerDetected: dumpStored.unfollowerDetected ?? false,
          unfollowerCount: dumpStored.unfollowerCount ?? 0,
          lastNotificationCheck: dumpStored.lastNotificationCheck ?? 0,
          sessionStats: dumpStored.sessionStats ?? {},
          usernames,
        });
        break;
      }

      case 'SIMULATE_UNFOLLOWER': {
        // Force l'apparition du bouton "Analyser les unfollowers" pour déclencher l'analyse manuelle
        const simStored = await accountGet('followerDatabase');
        const simCount = (message.count as number) || 1;
        await accountSet({
          unfollowerDetected: true,
          unfollowerCount: simCount,
        });
        // Cohérence : l'état de détection s'accompagne toujours du badge
        chrome.action.setBadgeText({ text: `-${simCount}` });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        const simDbCount = simStored.followerDatabase
          ? Object.keys(simStored.followerDatabase.followers || {}).length
          : 0;
        console.log(`🎭 Unfollower simulé (${simCount}) — bouton analyse maintenant visible, DB=${simDbCount}`);
        sendResponse({ success: true, dbCount: simDbCount });
        break;
      }

      case 'RESET_FOLLOWER_DB': {
        // Réinitialiser complètement la DB followers pour repartir d'un scan propre
        await accountSet({
          followerDatabase: {
            followers: {},
            isInitialized: false,
            totalCount: 0,
            firstFollowerId: null,
          },
          unfollowerDetected: false,
          unfollowerCount: 0,
          lastFollowerCount: 0,
          lastNotificationCheck: 0,
          sessionStats: {
            followers: 0,
            unfollowers: 0,
            ghost: 0,
            pendingClassification: 0,
            engagements: 0,
          },
        });
        console.log('🔄 Follower DB réinitialisée — prêt pour le scan initial');
        sendResponse({ success: true });
        break;
      }

      case 'UPDATE_UNFOLLOWER_STATS':
        // Mettre à jour les stats après l'analyse des unfollowers
        try {
          const stored = await accountGet('sessionStats');
          const sessionStats = stored.sessionStats || {
            followers: 0,
            unfollowers: 0,
            ghost: 0,
            pendingClassification: 0,
            engagements: 0,
          };

          // Ajouter les résultats de l'analyse aux stats existantes
          sessionStats.unfollowers += message.data.unfollowers || 0;
          sessionStats.ghost = (sessionStats.ghost || 0) + (message.data.ghost || message.data.potentialBlockers || 0);

          await accountSet({ sessionStats });
          console.log('📊 Session stats updated:', sessionStats);
          sendResponse({ success: true });
        } catch (error: any) {
          console.error('Error updating stats:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'SYNC_FULL_DATABASE':
        // Synchroniser toute la base de données locale avec le backend
        console.log('🔄 Starting full database sync...');
        const syncResult = await syncManager.syncFullDatabase();
        sendResponse(syncResult);
        break;

      case 'TRIGGER_AGENT_B':
        // Déclencher l'Agent B pour vérifier les unfollowers via Google
        try {
          const stored = await chrome.storage.local.get('apiToken');
          
          if (!stored.apiToken) {
            console.error('No API token found');
            sendResponse({ success: false, error: 'Not authenticated' });
            break;
          }

          const response = await fetch(API_BASE + '/api/extension/trigger-agent-b', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${stored.apiToken}`,
            },
            body: JSON.stringify(message.data),
          });

          const result = await response.json();
          
          if (response.ok) {
            console.log('✅ Agent B triggered successfully:', result);
            sendResponse({ success: true, data: result });
          } else {
            console.error('❌ Failed to trigger Agent B:', result);
            sendResponse({ success: false, error: result.message });
          }
        } catch (error: any) {
          console.error('Error triggering Agent B:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'ANALYSIS_COMPLETED':
        // L'analyse des unfollowers est terminée
        console.log('✅ Analysis completed:', message.data);

        // Badge persistant indiquant le résultat de l'analyse (indépendant du
        // compteur de followers / diff, qui peut être faussé par le cache
        // d'Instagram). On reflète les unfollows confirmés par l'analyse.
        {
          const confirmedUnfollowers = message.data?.unfollowers || 0;
          if (confirmedUnfollowers > 0) {
            chrome.action.setBadgeText({ text: `-${confirmedUnfollowers}` });
            chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
            console.log(`📊 Badge set to -${confirmedUnfollowers} (analyse)`);
          } else {
            // Plus rien à signaler : nettoyer le badge de progression
            chrome.action.setBadgeText({ text: '' });
          }
        }

        // Notifier tous les onglets du dashboard pour qu'ils se rafraîchissent
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url?.startsWith(API_BASE)) {
            try {
              await chrome.tabs.sendMessage(tab.id!, {
                type: 'REFRESH_DASHBOARD',
                data: message.data
              });
              console.log(`📤 Sent refresh notification to dashboard tab ${tab.id}`);
            } catch (error) {
              // L'onglet n'a peut-être pas de content script
              console.log(`Could not send message to tab ${tab.id}`);
            }
          }
        }
        
        sendResponse({ success: true });
        break;

      case 'FOLLOWER_COUNT_CHANGED':
        // Le nombre de followers a changé
        console.log('🔔 Follower count changed:', message.data);
        
        const { oldCount, newCount, diff } = message.data;
        
        // Créer une notification
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'FlowTrack - Followers Changed',
          message: diff > 0 
            ? `+${diff} nouveau(x) follower(s) ! (${oldCount} → ${newCount})`
            : `${Math.abs(diff)} unfollower(s) détecté(s) (${oldCount} → ${newCount})`,
          priority: 2,
        });
        
        // Mettre à jour le badge
        chrome.action.setBadgeText({ text: diff > 0 ? `+${diff}` : `${diff}` });
        chrome.action.setBadgeBackgroundColor({ color: diff > 0 ? '#02c950' : '#f59e0b' });
        
        console.log(`📊 Badge updated: ${diff > 0 ? '+' : ''}${diff}`);
        
        // Transmettre le message aux content scripts Instagram pour synchroniser lastFollowerCount
        const instagramTabs = await chrome.tabs.query({ url: '*://www.instagram.com/*' });
        for (const tab of instagramTabs) {
          if (tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'FOLLOWER_COUNT_CHANGED',
                data: message.data
              });
              console.log(`📤 Sent FOLLOWER_COUNT_CHANGED to Instagram tab ${tab.id}`);
            } catch (error) {
              console.log(`Could not send message to tab ${tab.id}:`, error);
            }
          }
        }
        
        sendResponse({ success: true });
        break;

      case 'UPDATE_USER_INFO':
        // Mettre à jour les informations utilisateur (followers, following, etc.)
        console.log('📊 Updating user info:', message.data);
        
        try {
          // Toujours stocker les informations localement
          await accountSet({ userInfo: message.data });
          console.log('💾 User info stored locally');

          const { userId, apiToken: token } = await chrome.storage.local.get(['userId', 'apiToken']);
          
          if (!userId || !token) {
            console.warn('⚠️ No authentication found - data stored locally only');
            console.log('ℹ️ Will be sent to backend on next sync when authenticated');
            sendResponse({ success: true, stored: true, sent: false });
            break;
          }
          
          console.log('🔐 Authentication found, sending to backend...');
          
          // Envoyer au backend immédiatement
          const response = await fetch(API_BASE + '/api/extension/update-user-info', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              followersCount: message.data.followersCount || 0,
              followingCount: message.data.followingCount || 0,
              postsCount: message.data.postsCount || 0,
              bio: message.data.bio || '',
              isPrivate: message.data.isPrivate || false,
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('✅ User info updated successfully:', data);
            
            // Notifier le dashboard pour qu'il se rafraîchisse
            const dashboardTabs = await chrome.tabs.query({});
            for (const tab of dashboardTabs) {
              if (tab.url?.startsWith(API_BASE)) {
                try {
                  await chrome.tabs.sendMessage(tab.id!, {
                    type: 'REFRESH_DASHBOARD',
                    data: { userInfoUpdated: true }
                  });
                  console.log(`📤 Sent refresh notification to dashboard tab ${tab.id}`);
                } catch (error) {
                  console.log(`Could not send message to tab ${tab.id}`);
                }
              }
            }
            
            sendResponse({ success: true, data });
          } else {
            const error = await response.text();
            console.error('❌ Failed to update user info:', error);
            sendResponse({ success: false, error });
          }
        } catch (error) {
          console.error('❌ Error updating user info:', error);
          sendResponse({ success: false, error: String(error) });
        }
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  })();

  // Retourner true pour indiquer que sendResponse sera appelé de manière asynchrone
  return true;
});

// ==================== DM FUNCTIONS ====================

/**
 * Store DM locally in storage
 */
async function storeDMLocally(message: any) {
  const stored = await accountGet('dm_messages');
  const messages: any[] = (stored.dm_messages as any[]) || [];
  
  messages.push({
    ...message,
    storedAt: Date.now()
  });
  
  // Keep only last 1000 messages
  if (messages.length > 1000) {
    messages.splice(0, messages.length - 1000);
  }
  
  await accountSet({ dm_messages: messages });
}

/**
 * Sync DMs to backend
 */
async function syncDMsToBackend(messages: any[], conversations: any[]) {
  try {
    const stored = await chrome.storage.local.get('apiToken');
    
    if (!stored.apiToken) {
      console.error('No API token found');
      return;
    }

    const response = await fetch(API_BASE + '/api/extension/sync-dms', {
      method: 'POST',
      credentials: 'include', // requireAuth = session cookie du dashboard
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.apiToken}`,
      },
      body: JSON.stringify({
        messages,
        conversations
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ DMs synced: ${data.insertedMessages} messages, ${data.updatedConversations} conversations`);
    } else {
      console.error('Failed to sync DMs:', response.status);
    }
  } catch (error) {
    console.error('Error syncing DMs:', error);
  }
}

/**
 * Récupère l'historique DM stocké d'un contact (chronologique) depuis le backend.
 * Sert au scroll incrémental (frontière) et à la fusion avant analyse côté Pro.
 */
async function getDMHistory(username: string): Promise<any[]> {
  try {
    const stored = await chrome.storage.local.get('apiToken');
    if (!stored.apiToken) return [];

    const response = await fetch(
      API_BASE + `/api/extension/dm-history/${encodeURIComponent(username)}`,
      { headers: { Authorization: `Bearer ${stored.apiToken}` }, credentials: 'include' }
    );
    if (response.ok) {
      const data = await response.json();
      return data.messages || [];
    }
    console.warn(`⚠️ getDMHistory @${username} → HTTP ${response.status}`);
  } catch (error) {
    console.error('Error getting DM history:', error);
  }
  return [];
}

/**
 * Get DM conversations from backend
 */
async function getDMConversations() {
  try {
    const stored = await chrome.storage.local.get('apiToken');
    
    if (!stored.apiToken) {
      return [];
    }

    const response = await fetch(API_BASE + '/api/extension/dm-conversations', {
      headers: {
        'Authorization': `Bearer ${stored.apiToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.conversations || [];
    }
  } catch (error) {
    console.error('Error getting DM conversations:', error);
  }
  
  return [];
}

// ==================== CLASSIFICATION FUNCTIONS ====================

/**
 * Update contact score in backend
 */
async function updateContactScore(
  username: string,
  scoreBreakdown: any,
  category: string = 'lead',
  extra?: { temperature?: string; dynamics?: any; advice?: string[]; settingPhase?: string; settingSummary?: any; accountUsername?: string }
) {
  try {
    const stored = await chrome.storage.local.get(['apiToken', 'userId']);

    if (!stored.apiToken) {
      console.error('No API token found');
      return;
    }

    const response = await fetch(API_BASE + '/api/extension/analyze-contact', {
      method: 'POST',
      credentials: 'include', // requireAuth = session cookie du dashboard
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.apiToken}`,
      },
      body: JSON.stringify({
        contactUsername: username,
        scoreBreakdown,
        currentCategory: category,
        temperature: extra?.temperature,
        dynamics: extra?.dynamics,
        advice: extra?.advice,
        settingPhase: extra?.settingPhase,
        settingSummary: extra?.settingSummary,
        accountUsername: extra?.accountUsername,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`📊 Score updated for @${username}: ${data.score}/100`);
    } else {
      console.error('Failed to update contact score:', response.status);
    }
  } catch (error) {
    console.error('Error updating contact score:', error);
  }
}

/**
 * Rafraîchit le statut Pro (flag global `isPro`) depuis le backend via le
 * cookie de session. Important : en cas d'échec (réseau/DB), on NE downgrade
 * PAS le flag existant — c'est précisément un downgrade sur panne transitoire
 * qui peut figer un compte Pro en "non Pro". Renvoie l'état Pro effectif.
 */
async function refreshProStatus(): Promise<boolean> {
  const current = (await chrome.storage.local.get('isPro')).isPro === true;
  try {
    const response = await fetch(API_BASE + '/api/extension/pro-status', {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      console.warn('⚠️ refreshProStatus: HTTP', response.status, '— conserve isPro =', current);
      return current;
    }
    const data = await response.json();
    const isPro = data.isPro === true;
    await chrome.storage.local.set({
      isPro,
      subscriptionTier: data.subscriptionTier ?? null,
      subscriptionActive: data.subscriptionActive === true,
    });
    console.log(`✅ Statut Pro rafraîchi: isPro=${isPro} (tier: ${data.subscriptionTier ?? 'n/a'})`);
    return isPro;
  } catch (error) {
    console.warn('⚠️ refreshProStatus error — conserve isPro =', current, error);
    return current;
  }
}

/**
 * Persiste le nom de profil (full_name) d'un People dans circle_members.
 * Best-effort : n'écrase pas un nom déjà renseigné (géré côté serveur).
 */
async function updateContactName(username: string, fullName: string): Promise<void> {
  if (!username || !fullName) return;
  try {
    const response = await fetch(API_BASE + '/api/extension/contact-name', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactUsername: username, fullName }),
    });
    if (!response.ok) {
      console.error('Failed to update contact name:', response.status);
    }
  } catch (error) {
    console.error('Error updating contact name:', error);
  }
}

// ==================== Connexions mutuelles (API friendships) ====================
// Calcul des comptes en commun entre un People et le compte connecté, via l'API
// web interne d'Instagram (même origine + cookies de session). Sert à remplir la
// stat « Mutual connections » de la fiche au moment de la préparation du profil.

const FOLLOWING_MAX_PAGES = 20; // ~1000 abonnements lus max par compte
const MUTUAL_MAX_MEMBERS = 50; // nb max de comptes en commun listés

/** En-têtes communs pour l'API web interne (x-ig-app-id + csrf du cookie). */
async function igApiHeaders(): Promise<Record<string, string>> {
  const csrf = await chrome.cookies.get({ url: 'https://www.instagram.com', name: 'csrftoken' });
  return { 'x-ig-app-id': '936619743392459', ...(csrf?.value ? { 'x-csrftoken': csrf.value } : {}) };
}

/** Abonnements (following) d'un compte via l'API, paginé, en minuscules. */
async function fetchFollowingUsernames(userId: string): Promise<string[]> {
  const headers = await igApiHeaders();
  const out = new Set<string>();
  let maxId = '';
  for (let page = 0; page < FOLLOWING_MAX_PAGES; page++) {
    const url =
      `https://www.instagram.com/api/v1/friendships/${userId}/following/?count=50` +
      (maxId ? `&max_id=${encodeURIComponent(maxId)}` : '');
    let data: any;
    try {
      const resp = await fetch(url, { credentials: 'include', headers });
      if (!resp.ok) {
        console.warn(`⚠️ [mutuals] friendships/following HTTP ${resp.status}`);
        break;
      }
      data = await resp.json();
    } catch (e) {
      console.warn('⚠️ [mutuals] friendships/following échec:', e);
      break;
    }
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) {
      const n = String(u?.username || '').toLowerCase();
      if (n) out.add(n);
    }
    maxId = data?.next_max_id || '';
    if (!maxId || users.length === 0) break;
    await new Promise((r) => setTimeout(r, 600)); // délai humain entre pages
  }
  return Array.from(out);
}

/**
 * Abonnements du compte connecté (own following), mis en cache (coûteux à
 * paginer). TTL 6 h, ré-utilisé pour chaque collecte tant qu'il est frais.
 */
async function getOwnFollowing(ownId: string): Promise<Set<string>> {
  const KEY = 'ownFollowingCache';
  const TTL = 6 * 60 * 60 * 1000;
  try {
    const stored = await chrome.storage.local.get(KEY);
    const c = stored[KEY] as { ownId?: string; at?: number; list?: string[] } | undefined;
    if (c && c.ownId === ownId && c.at && Date.now() - c.at < TTL && Array.isArray(c.list)) {
      return new Set(c.list);
    }
  } catch {
    /* contexte invalidé */
  }
  const list = await fetchFollowingUsernames(ownId);
  try {
    await chrome.storage.local.set({ [KEY]: { ownId, at: Date.now(), list } });
  } catch {
    /* contexte invalidé */
  }
  return new Set(list);
}

/**
 * Connexions mutuelles d'un People = abonnements(People) ∩ abonnements(compte
 * connecté). Renvoie le nombre total et la liste (bornée) des comptes en commun.
 */
async function computeMutualConnections(targetId: string): Promise<{ count: number; members: string[] }> {
  const ownCookie = await chrome.cookies.get({ url: 'https://www.instagram.com', name: 'ds_user_id' });
  const ownId = ownCookie?.value;
  if (!ownId) return { count: 0, members: [] };

  const ownFollowing = await getOwnFollowing(ownId);
  if (ownFollowing.size === 0) return { count: 0, members: [] };

  const targetFollowing = await fetchFollowingUsernames(targetId);
  const members = targetFollowing.filter((u) => ownFollowing.has(u)).slice(0, MUTUAL_MAX_MEMBERS);
  const count = targetFollowing.reduce((n, u) => (ownFollowing.has(u) ? n + 1 : n), 0);
  return { count, members };
}

/**
 * Récupère le score DM quantitatif calculé côté serveur (0-20) après sync-dms.
 */
async function analyzeDMsOnServer(contactUsername: string): Promise<number> {
  try {
    const response = await fetch(API_BASE + '/api/extension/analyze-dms', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactUsername }),
    });
    if (response.ok) {
      const data = await response.json();
      return typeof data.dmScore === 'number' ? data.dmScore : 0;
    }
    console.warn('analyze-dms a répondu', response.status);
  } catch (error) {
    console.error('Error analyzing DMs on server:', error);
  }
  return 0;
}

/**
 * Create classification suggestion
 */
async function createSuggestion(username: string, transition: any, scoreBreakdown: any) {
  try {
    const stored = await chrome.storage.local.get(['apiToken', 'userId']);
    
    if (!stored.apiToken || !stored.userId) {
      console.error('No API token or user ID found');
      return null;
    }

    const suggestion = await classificationManager.createSuggestion(
      stored.userId as number,
      username,
      transition.from,
      transition.to,
      scoreBreakdown.total,
      transition.confidence,
      transition.reason,
      transition.evidence || []
    );

    if (suggestion) {
      console.log(`💡 Suggestion created: @${username} ${transition.from} → ${transition.to}`);
    }

    return suggestion;
  } catch (error) {
    console.error('Error creating suggestion:', error);
    return null;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('instagram.com')) {
    console.log('📱 Instagram tab loaded');
  }
});

console.log('✅ Waler Extension background script loaded');


