/**
 * account-storage.ts — Isolation des données par compte Instagram.
 *
 * Plusieurs comptes Instagram (un seul login Waler) partagent le même
 * chrome.storage.local. Pour éviter que leurs données se mélangent, toutes les
 * clés "par-compte" sont préfixées par `acct:<dsUserId>:`. Le compte actif est
 * identifié par son `ds_user_id` (cookie Instagram), mémorisé dans
 * `activeDsUserId`.
 *
 * Les wrappers accountGet/accountSet/accountRemove conservent les NOMS de clés
 * d'origine côté appelant : seul le stockage physique est préfixé. Cela limite
 * le diff dans le reste du code (on remplace chrome.storage.local.get/set par
 * accountGet/accountSet).
 */

export interface LinkedAccount {
  dsUserId: string;
  igUsername: string;
  accountId?: number; // id app_users côté backend
  avatarUrl?: string;
  linkedAt: string;
  dismissed?: boolean; // l'utilisateur a refusé la liaison (ne pas reproposer en boucle)
}

export interface AccountRegistry {
  accounts: { [dsUserId: string]: LinkedAccount };
}

// Clés stockées PAR COMPTE Instagram (préfixées).
const PER_ACCOUNT_KEYS = new Set<string>([
  'followerDatabase',
  'followersCache',
  'sessionStats',
  'lastFollowerCount',
  'lastFollowerCountSource',
  'lastFollowerCountAt',
  'lastFollowerCountOwner',
  'userInfo',
  'unfollowerDetected',
  'unfollowerCount',
  'unfollowerDetectedAt',
  'syncQueue',
  'lastNotificationCheck',
  'lastSync',
  'lastFullSync',
  'scanProgress',
  'unfollowerAnalysisProgress',
  'pendingNewFollowerScan',
  'dm_messages',
  'scanBudget',
]);

// Clés GLOBALES (liées au login owner, communes à tous les comptes Insta).
//   isAuthenticated, userId, apiToken, isPro, subscriptionTier, subscriptionActive,
//   accountRegistry, activeDsUserId, isAnalyzing, unfollowerCheckState...
// → non préfixées, lues/écrites directement.

const REGISTRY_KEY = 'accountRegistry';
const ACTIVE_KEY = 'activeDsUserId';
// Compte PRINCIPAL : le 1er compte Instagram vu (= celui avec lequel on s'est
// inscrit à Waler). Il n'est PAS isolé : il continue d'utiliser les clés
// globales historiques. Seuls les comptes SECONDAIRES sont préfixés.
const PRIMARY_KEY = 'primaryDsUserId';

function nsKey(dsUserId: string, key: string): string {
  return `acct:${dsUserId}:${key}`;
}

/**
 * Résout le nom de stockage physique d'une clé.
 * - Compte PRINCIPAL (active === primary, ou primary non encore défini) → clé
 *   GLOBALE (non préfixée) : ses données historiques restent en place.
 * - Compte SECONDAIRE (active ≠ primary) → clé préfixée `acct:<dsUserId>:`.
 */
function resolveKey(
  activeDsUserId: string | null,
  primaryDsUserId: string | null,
  key: string
): string {
  if (
    activeDsUserId &&
    primaryDsUserId &&
    activeDsUserId !== primaryDsUserId &&
    PER_ACCOUNT_KEYS.has(key)
  ) {
    return nsKey(activeDsUserId, key);
  }
  return key;
}

export async function getActiveDsUserId(): Promise<string | null> {
  const stored = await chrome.storage.local.get(ACTIVE_KEY);
  return (stored[ACTIVE_KEY] as string) ?? null;
}

export async function setActiveDsUserId(dsUserId: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_KEY]: dsUserId });
}

export async function getPrimaryDsUserId(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PRIMARY_KEY);
  return (stored[PRIMARY_KEY] as string) ?? null;
}

export async function setPrimaryDsUserId(dsUserId: string): Promise<void> {
  await chrome.storage.local.set({ [PRIMARY_KEY]: dsUserId });
}

/**
 * Désigne le compte PRINCIPAL au 1er passage (le compte d'inscription Waler).
 * Idempotent : ne change rien si déjà défini. Renvoie true si `dsUserId` EST le
 * compte principal.
 */
export async function ensurePrimaryAccount(dsUserId: string): Promise<boolean> {
  const current = await getPrimaryDsUserId();
  if (!current) {
    await setPrimaryDsUserId(dsUserId);
    // Au cas où une ancienne migration aurait déplacé les données du principal
    // vers son namespace, les rapatrier vers les clés globales (qu'il lit désormais).
    await recoverPrimaryFromNamespace(dsUserId);
    return true;
  }
  return current === dsUserId;
}

/**
 * Récupération : si les clés GLOBALES du compte principal sont vides mais que des
 * données existent sous son namespace `acct:<ds>:` (ancienne migration boguée),
 * on les ramène vers les clés globales. Évite la "réinitialisation" apparente de
 * la base du compte principal.
 */
export async function recoverPrimaryFromNamespace(dsUserId: string): Promise<void> {
  try {
    const keys = Array.from(PER_ACCOUNT_KEYS);
    const nsKeys = keys.map((k) => nsKey(dsUserId, k));
    const [globalData, nsData] = await Promise.all([
      chrome.storage.local.get(keys),
      chrome.storage.local.get(nsKeys),
    ]);
    const globalDb = globalData.followerDatabase as { totalCount?: number; isInitialized?: boolean } | undefined;
    const nsDb = nsData[nsKey(dsUserId, 'followerDatabase')] as { totalCount?: number } | undefined;
    const globalEmpty = !globalDb?.isInitialized && (globalDb?.totalCount ?? 0) === 0;
    const nsHasData = (nsDb?.totalCount ?? 0) > 0;
    if (globalEmpty && nsHasData) {
      const toSet: Record<string, any> = {};
      for (const k of keys) {
        const v = nsData[nsKey(dsUserId, k)];
        if (v !== undefined) toSet[k] = v;
      }
      if (Object.keys(toSet).length > 0) {
        await chrome.storage.local.set(toSet);
        console.log(`♻️ Données du compte principal restaurées depuis le namespace (${Object.keys(toSet).length} clés)`);
      }
    }
  } catch (e) {
    console.error('recoverPrimaryFromNamespace error:', e);
  }
}

export async function getAccountRegistry(): Promise<AccountRegistry> {
  const stored = await chrome.storage.local.get(REGISTRY_KEY);
  const reg = stored[REGISTRY_KEY] as AccountRegistry | undefined;
  if (reg && reg.accounts) return reg;
  return { accounts: {} };
}

export async function setAccountRegistry(reg: AccountRegistry): Promise<void> {
  await chrome.storage.local.set({ [REGISTRY_KEY]: reg });
}

/** Crée ou met à jour l'entrée d'un compte dans le registre. */
export async function upsertAccount(
  dsUserId: string,
  patch: Partial<LinkedAccount>
): Promise<LinkedAccount> {
  const reg = await getAccountRegistry();
  const existing = reg.accounts[dsUserId];
  const merged: LinkedAccount = {
    dsUserId,
    igUsername: patch.igUsername ?? existing?.igUsername ?? '',
    accountId: patch.accountId ?? existing?.accountId,
    avatarUrl: patch.avatarUrl ?? existing?.avatarUrl,
    linkedAt: existing?.linkedAt ?? new Date().toISOString(),
    dismissed: patch.dismissed ?? existing?.dismissed,
  };
  reg.accounts[dsUserId] = merged;
  await setAccountRegistry(reg);
  return merged;
}

export async function isAccountLinked(dsUserId: string): Promise<boolean> {
  const reg = await getAccountRegistry();
  const entry = reg.accounts[dsUserId];
  return !!entry && !!entry.accountId;
}

/**
 * Lecture namespacée. Accepte une clé ou un tableau de clés et renvoie un objet
 * indexé par les NOMS d'origine (comme chrome.storage.local.get).
 */
export async function accountGet(
  keys: string | string[]
): Promise<Record<string, any>> {
  const [active, primary] = await Promise.all([getActiveDsUserId(), getPrimaryDsUserId()]);
  const keyList = Array.isArray(keys) ? keys : [keys];
  const physicalToLogical = new Map<string, string>();
  for (const key of keyList) {
    physicalToLogical.set(resolveKey(active, primary, key), key);
  }
  const physicalKeys = Array.from(physicalToLogical.keys());
  const raw = await chrome.storage.local.get(physicalKeys);
  const out: Record<string, any> = {};
  for (const [physical, value] of Object.entries(raw)) {
    const logical = physicalToLogical.get(physical) ?? physical;
    out[logical] = value;
  }
  return out;
}

/** Écriture namespacée (noms de clés d'origine côté appelant). */
export async function accountSet(obj: Record<string, any>): Promise<void> {
  const [active, primary] = await Promise.all([getActiveDsUserId(), getPrimaryDsUserId()]);
  const physical: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    physical[resolveKey(active, primary, key)] = value;
  }
  await chrome.storage.local.set(physical);
}

/** Suppression namespacée. */
export async function accountRemove(keys: string | string[]): Promise<void> {
  const [active, primary] = await Promise.all([getActiveDsUserId(), getPrimaryDsUserId()]);
  const keyList = Array.isArray(keys) ? keys : [keys];
  await chrome.storage.local.remove(keyList.map((k) => resolveKey(active, primary, k)));
}

/**
 * Migration douce : si des données existent encore sous les anciennes clés
 * GLOBALES (avant le namespacing), les réattribue au compte `dsUserId` — mais
 * UNIQUEMENT si ces données lui appartiennent réellement, identifié par le
 * `userInfo.username` legacy comparé à `igUsername`. Sinon on ne copie RIEN (le
 * compte démarre sur une base vierge) et on laisse les clés legacy intactes pour
 * le compte auquel elles appartiennent vraiment.
 *
 * Exécuté une fois par compte (drapeau `migratedLegacyFor:<dsUserId>`).
 */
export async function migrateLegacyKeysToAccount(
  dsUserId: string,
  igUsername?: string
): Promise<void> {
  const flagKey = `migratedLegacyFor:${dsUserId}`;
  const flagStore = await chrome.storage.local.get(flagKey);
  if (flagStore[flagKey]) return;

  const legacyKeys = Array.from(PER_ACCOUNT_KEYS);
  const legacy = await chrome.storage.local.get(legacyKeys);

  // À qui appartiennent les données legacy ? On se fie au userInfo.username.
  const legacyUsername: string | undefined = legacy.userInfo?.username;
  const hasLegacyData = legacyKeys.some((k) => legacy[k] !== undefined);

  // Ne migrer que si l'on est SÛR que les données legacy appartiennent à ce
  // compte (username concordant, comparaison insensible à la casse). En cas de
  // doute (pas de username, ou username différent), on s'abstient pour éviter de
  // contaminer un autre compte.
  const belongsToThisAccount =
    hasLegacyData &&
    !!legacyUsername &&
    !!igUsername &&
    legacyUsername.toLowerCase() === igUsername.toLowerCase();

  if (belongsToThisAccount) {
    const toSet: Record<string, any> = {};
    const toRemove: string[] = [];
    for (const key of legacyKeys) {
      if (legacy[key] !== undefined) {
        const nsk = nsKey(dsUserId, key);
        toSet[nsk] = legacy[key];
        toRemove.push(key);
      }
    }
    // N'écraser que si la cible namespacée n'existe pas encore
    const existing = await chrome.storage.local.get(Object.keys(toSet));
    const filtered: Record<string, any> = {};
    for (const [nsk, value] of Object.entries(toSet)) {
      if (existing[nsk] === undefined) filtered[nsk] = value;
    }
    if (Object.keys(filtered).length > 0) {
      await chrome.storage.local.set(filtered);
    }
    await chrome.storage.local.remove(toRemove);
    console.log(`🔀 Migration legacy → @${igUsername} (${dsUserId}): ${toRemove.length} clés`);
  } else if (hasLegacyData) {
    console.log(
      `⏭️ Pas de migration pour ${dsUserId} (@${igUsername || '?'}) : ` +
        `données legacy appartiennent à @${legacyUsername || '?'} — base vierge`
    );
  }

  await chrome.storage.local.set({ [flagKey]: true });
}
