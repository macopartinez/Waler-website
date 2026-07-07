import bcrypt from "bcrypt";
import type { Request } from "express";
import { users, type User } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
}): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  
  const [user] = await db.insert(users).values({
    username: data.username,
    email: data.email,
    passwordHash,
    platform: "instagram", // Always Instagram
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`,
    isConnected: false, // Will be set to true after agent follow
  }).returning();
  
  return user;
}

/**
 * Multi-compte : retrouve (par ds_user_id) ou crée un compte Instagram lié à un
 * login owner. Le compte lié est une ligne app_users sans login propre (email
 * synthétique, mot de passe aléatoire).
 */
export async function findOrCreateLinkedAccount(params: {
  ownerId: number;
  igUsername: string;
  instagramUserId: string;
}): Promise<User> {
  const { ownerId, igUsername, instagramUserId } = params;

  // Déjà lié à cet owner ? (dédoublonnage par ds_user_id, qui est STABLE même
  // après un rename Instagram). Si le pseudo a changé depuis, on rafraîchit le
  // username (+ avatar dérivé) : sinon la ligne app_users garde l'ancien pseudo,
  // que /api/accounts re-pousse ensuite dans le registre de l'extension (= rename
  // « annulé »). L'id de la ligne, lui, ne change jamais.
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.ownerId, ownerId), eq(users.instagramUserId, instagramUserId)));
  if (existing[0]) {
    if (igUsername && existing[0].username !== igUsername) {
      const [updated] = await db
        .update(users)
        .set({
          username: igUsername,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${igUsername}`,
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      return updated ?? existing[0];
    }
    return existing[0];
  }

  // L'owner lui-même correspond-il à ce compte Insta ? (ne pas dupliquer)
  const owner = await getUserById(ownerId);
  if (owner && (owner.instagramUserId === instagramUserId || owner.username === igUsername)) {
    // Renseigner instagram_user_id sur l'owner si absent
    if (!owner.instagramUserId) {
      await db.update(users).set({ instagramUserId }).where(eq(users.id, ownerId));
    }
    return owner;
  }

  const passwordHash = await hashPassword(`linked-${instagramUserId}-${Date.now()}`);
  const syntheticEmail = `owner${ownerId}+${instagramUserId}@flowtrack.local`;

  const [account] = await db
    .insert(users)
    .values({
      username: igUsername,
      email: syntheticEmail,
      passwordHash,
      ownerId,
      instagramUserId,
      platform: "instagram",
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${igUsername}`,
      isConnected: false,
    })
    .returning();

  return account;
}

export function getCurrentUser(req: Request): number | null {
  return req.session?.userId ?? null;
}

export function setCurrentUser(req: Request, userId: number): void {
  req.session.userId = userId;
}

/**
 * Multi-compte : id du compte Instagram ACTIF (app_users.id) à utiliser pour
 * scoper les données (followers, unfollowers, stats, DMs...). Par défaut = le
 * login owner lui-même (qui est aussi un compte Insta).
 */
export function getActiveAccount(req: Request): number | null {
  return req.session?.activeAccountId ?? req.session?.userId ?? null;
}

export function setActiveAccount(req: Request, accountId: number): void {
  req.session.activeAccountId = accountId;
  // Persisté sur le login owner pour survivre à une déconnexion/reconnexion
  // (best-effort : ne bloque pas la bascule si l'écriture échoue).
  const ownerId = getCurrentUser(req);
  if (ownerId) {
    db.update(users).set({ lastActiveAccountId: accountId }).where(eq(users.id, ownerId)).catch((err) => {
      console.error("Persist lastActiveAccountId error:", err);
    });
  }
}

/**
 * Restaure en session le dernier compte Instagram actif du login owner
 * (persisté via `setActiveAccount`). À appeler juste après `setCurrentUser`
 * lors du login, pour éviter de retomber sur le compte owner par défaut.
 */
export async function restoreActiveAccount(req: Request, ownerId: number): Promise<void> {
  const owner = await getUserById(ownerId);
  if (owner?.lastActiveAccountId && (await isAccountOwnedBy(owner.lastActiveAccountId, ownerId))) {
    req.session.activeAccountId = owner.lastActiveAccountId;
  }
}

/**
 * Vérifie qu'un compte (app_users.id) appartient bien au login owner : soit
 * c'est l'owner lui-même, soit owner_id pointe vers lui.
 */
export async function isAccountOwnedBy(accountId: number, ownerId: number): Promise<boolean> {
  if (accountId === ownerId) return true;
  const account = await getUserById(accountId);
  return !!account && account.ownerId === ownerId;
}

/**
 * Liste tous les comptes Instagram (app_users) appartenant au login owner,
 * owner inclus.
 */
export async function getAccountsForOwner(ownerId: number): Promise<User[]> {
  const owner = await getUserById(ownerId);
  const linked = await db.select().from(users).where(eq(users.ownerId, ownerId));
  return owner ? [owner, ...linked] : linked;
}

export async function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
