import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { encryptField, decryptField, decryptMessageRow } from "./crypto-fields";
import { loginSchema, registerSchema, verifyCodeSchema, unfollowers, blockers, users, planChangeHistory, followers as followersTable, agentStates } from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  getUserByEmail,
  createUser,
  verifyPassword,
  setCurrentUser,
  getCurrentUser,
  destroySession,
  getUserById,
  getActiveAccount,
  setActiveAccount,
  isAccountOwnedBy,
  getAccountsForOwner,
  findOrCreateLinkedAccount
} from "./auth";
import { maxAccountsForTier } from "@shared/accounts";
import { requireAuth, requireOwnership, rateLimit, requireVerified, requireAdmin, requireActiveSubscription, getLoginLockout, recordFailedLogin, clearLoginAttempts } from "./middleware";
import { createVerification, verifyToken, resendVerificationCode } from "./verification";
import { createCheckoutSession, createCustomerPortal, constructWebhookEvent, stripe } from "./stripe";
import { getActivePlans, getUserPlan, getPlanById, getPlanByName, upsertSubscription } from "./plans";
import { createVerificationCode } from './verification-codes';
import type Stripe from "stripe";
import fs from 'fs';

// esbuild ne polyfille PAS `import.meta.dirname` pour le format CJS (bundle de
// prod) : la propriété reste `undefined`, ce qui casse tous les chemins vers
// waler.db. `__dirname` existe nativement dans le bundle CJS de prod, et à
// défaut (ESM, dev via tsx) on retombe sur `import.meta.url`.
const moduleDir =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/**
 * Pont waler.db ↔ comptes (app_users). Un compte Instagram = une ligne `users`
 * DÉDIÉE dans waler.db, résolue par username. Toutes les données Pro
 * (circle_members, contact_scores…) sont scopées par cet id → isolation STRICTE
 * des People par compte.
 *
 * Règle d'or : quand un `accountUsername` est fourni, on NE retombe JAMAIS sur le
 * compte de session s'il est introuvable. Sinon les People d'un compte fuiraient
 * sur un autre (suppression/lecture cross-compte — bug historique où tout
 * atterrissait dans le même seau).
 *
 * - `resolveWalerUserId` : id du bucket du compte, ou null s'il n'existe pas
 *   encore (utilisé en lecture/suppression → absence = rien à faire).
 * - `ensureWalerUserId`  : idem mais crée le bucket à la volée (utilisé en
 *   écriture → chaque compte a son espace dès le 1er ajout de People).
 */
function resolveWalerUserId(sqlite: any, username: string): number | null {
  const row = sqlite
    .prepare(`SELECT id FROM users WHERE lower(username) = lower(?)`)
    .get(username) as { id: number } | undefined;
  return row?.id ?? null;
}

function ensureWalerUserId(sqlite: any, username: string): number {
  const existing = resolveWalerUserId(sqlite, username);
  if (existing) return existing;
  // Bucket synthétique : email/mot de passe factices (les colonnes sont NOT NULL
  // / UNIQUE). Ce compte n'est qu'un conteneur de données Pro, pas un login.
  const info = sqlite
    .prepare(
      `INSERT INTO users (username, email, password_hash, platform)
       VALUES (?, ?, 'x', 'instagram')`
    )
    .run(username, `${username.toLowerCase()}@account.local`);
  return Number(info.lastInsertRowid);
}

/**
 * Convertit un timestamp Stripe (secondes epoch) en Date, ou undefined si
 * absent/invalide. Sans cette garde, `new Date(undefined * 1000)` produit une
 * date invalide qui fait planter Drizzle (`toISOString` → RangeError).
 */
function stripeTs(sec: number | null | undefined): Date | undefined {
  if (!sec) return undefined;
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Lit `current_period_end` de façon robuste aux versions d'API Stripe : dans les
 * versions récentes (celle du compte) le champ a migré de la racine de la
 * subscription vers le premier item. On lit les deux emplacements.
 */
function subscriptionPeriodEnd(sub: any): Date | undefined {
  return stripeTs(sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end);
}

// Garantit (une fois par process) la présence de la colonne keyword_hits, lue par
// computeRelationshipScore. Cette fonction est appelée aussi depuis le mode Base
// (emitRelationshipSignal), dont les routes n'exécutent pas les ALTER de /pro-engagement.
let keywordHitsColumnEnsured = false;
function ensureKeywordHitsColumn(sqlite: any): void {
  if (keywordHitsColumnEnsured) return;
  try {
    sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN keyword_hits INTEGER DEFAULT 0`).run();
  } catch {
    /* colonne déjà existante */
  }
  keywordHitsColumnEnsured = true;
}

/**
 * Calcule le score de relation (0-100) d'un membre du cercle à partir de ses
 * stats et de sa timeline. Portage de calculate_relationship_score() de
 * l'ancien agent Python (agent_pro_circle.py).
 */
function computeRelationshipScore(sqlite: any, memberId: number): number {
  ensureKeywordHitsColumn(sqlite);
  const m = sqlite.prepare(`
    SELECT total_likes_given, total_likes_received,
           consecutive_likes_streak, days_since_first_like,
           mutual_followers_count, keyword_hits
    FROM circle_members WHERE id = ?
  `).get(memberId) as any;
  if (!m) return 0;

  let score = 0;
  score += Math.min((m.total_likes_given || 0) * 2, 30);      // likes donnés (max 30)
  score += Math.min((m.total_likes_received || 0) * 2, 20);   // likes reçus (max 20)
  score += Math.min((m.consecutive_likes_streak || 0) * 4, 20); // streak (max 20)
  score += Math.min(Math.floor((m.days_since_first_like || 0) / 7), 15); // ancienneté (max 15)
  score += Math.min(m.mutual_followers_count || 0, 15);       // connexions mutuelles (max 15)
  // Commentaire mot-clé de campagne (« commente GUIDE ») = signal d'INTENTION
  // fort (lead magnet) : gros bonus, juste après une conversation qualifiée.
  score += Math.min((m.keyword_hits || 0) * 12, 30);          // hits mot-clé (max 30)

  const events = sqlite.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM timeline_events
    WHERE circle_member_id = ? AND detected_at >= datetime('now', '-30 days')
    GROUP BY event_type
  `).all(memberId) as Array<{ event_type: string; count: number }>;

  if (events.length > 3) score += 10; // bonus interactions variées
  for (const e of events) {
    if (e.event_type === 'unfollow') score -= 20;          // a unfollow
    else if (e.event_type === 'ghost') score -= 25;        // legacy : bloqué/supprimé fusionnés
    else if (e.event_type === 'blocked') score -= 30;      // t'a bloqué (rupture forte)
    else if (e.event_type === 'deleted') score -= 25;      // compte supprimé/désactivé
    else if (e.event_type === 'refollow') score += 15;     // s'est réabonné
    else if (e.event_type === 'follow' || e.event_type === 'follow_back') score += 10; // (re)follow
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Émet un "signal de relation" (follow / unfollow / blocked / deleted / ghost /
 * refollow) sur la
 * fiche Pro (circle_members) correspondant au username donné, puis recalcule son
 * score. No-op si la personne n'est pas suivie en Pro (aucun circle_member).
 *
 * Déduplication : on n'insère pas deux fois le même type d'événement pour un
 * même membre dans les dernières 24 h (les scans renvoient les listes complètes
 * à chaque passage).
 */
function emitRelationshipSignal(
  sqlite: any,
  userId: number,
  username: string,
  eventType: 'follow' | 'unfollow' | 'blocked' | 'deleted' | 'ghost' | 'refollow'
): void {
  try {
    const member = sqlite.prepare(
      `SELECT id FROM circle_members WHERE user_id = ? AND LOWER(member_username) = LOWER(?)`
    ).get(userId, username) as { id: number } | undefined;
    if (!member) return; // personne non suivie en Pro

    const recent = sqlite.prepare(
      `SELECT 1 FROM timeline_events
       WHERE circle_member_id = ? AND event_type = ?
         AND detected_at >= datetime('now', '-1 day')
       LIMIT 1`
    ).get(member.id, eventType);
    if (recent) return; // déjà émis récemment → pas de doublon

    sqlite.prepare(
      `INSERT INTO timeline_events (circle_member_id, event_type, event_data, detected_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(member.id, eventType, JSON.stringify({ kind: 'relationship' }));

    const score = computeRelationshipScore(sqlite, member.id);
    sqlite.prepare(
      `UPDATE circle_members SET relationship_score = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(score, member.id);
  } catch (error) {
    console.error(`emitRelationshipSignal(${eventType}, ${username}) error:`, error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  pgPool?: any
): Promise<Server> {
  
  // Migration idempotente : colonne recovered_at (re-follow détecté). On conserve
  // la ligne d'unfollow/ghost pour l'affichage mais on l'exclut du compteur.
  if (pgPool) {
    try {
      await pgPool.query(`ALTER TABLE unfollowers ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMP`);
    } catch (error) {
      console.error('Migration recovered_at error:', error);
    }
  }

  // ==================== AUTH ROUTES ====================
  
  // Register
  app.post("/api/auth/register", rateLimit(5, 60000), async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await getUserByEmail(input.email);
      if (existingUser) {
        // En mode développement, supprimer l'ancien compte pour permettre de retester
        if (process.env.NODE_ENV === 'development') {
          console.log(`🗑️ Deleting existing user with email ${input.email} for re-testing`);
          await db.delete(users).where(eq(users.id, existingUser.id));
        } else {
          return res.status(400).json({ message: "Cet email est déjà utilisé" });
        }
      }
      
      // Create user with hashed password
      const user = await createUser({
        username: input.username,
        email: input.email,
        password: input.password,
      });
      
      // Compte vérifié via l'extension pendant l'onboarding : on marque le compte
      // comme vérifié (débloque requireVerified) et on enregistre le ds_user_id IG.
      if (input.instagramVerified) {
        // Anti-usurpation : on refuse de rattacher un ds_user_id Instagram déjà
        // associé à un autre compte (sinon on pourrait revendiquer l'identité
        // Instagram vérifiée de quelqu'un d'autre).
        if (input.instagramUserId) {
          const [taken] = await db
            .select()
            .from(users)
            .where(eq(users.instagramUserId, input.instagramUserId));
          if (taken && taken.id !== user.id) {
            await db.delete(users).where(eq(users.id, user.id));
            return res.status(409).json({ message: "Ce compte Instagram est déjà lié à un autre utilisateur" });
          }
        }

        await db.update(users)
          .set({
            isVerified: true,
            instagramUserId: input.instagramUserId ?? null,
          })
          .where(eq(users.id, user.id));
        console.log(`✅ User ${user.id} verified via extension (ds_user_id: ${input.instagramUserId ?? 'n/a'})`);
      }

      // Store the intended plan but do NOT activate — activation happens after Stripe payment.
      if (input.selectedPlan) {
        const tier = input.selectedPlan === 'pro' ? 'pro' : 'premium';
        await db.update(users)
          .set({
            subscriptionTier: tier,
            subscriptionStatus: 'pending_payment',
          })
          .where(eq(users.id, user.id));
        console.log(`📋 Set user ${user.id} intended plan ${tier} (pending Stripe payment)`);
      }
      
      // Generate verification code (before establishing the session)
      const verification = await createVerification(user.id);

      const { passwordHash, ...safeUser } = user;

      // Establish a FRESH authenticated session for the new user — mirror the
      // login flow. Without regenerate(), register reused a previously logged-in
      // user's session (e.g. an old account still connected), so /api/auth/me
      // kept returning the old id and the dashboard redirected to the wrong user
      // (→ 403). save() guarantees it's persisted before the client's next call.
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error (register):", err);
          return res.status(500).json({ message: "Erreur de session" });
        }

        setCurrentUser(req, user.id);

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error (register):", saveErr);
            return res.status(500).json({ message: "Erreur de sauvegarde de session" });
          }

          console.log(`✅ User ${user.id} registered, session saved`);
          res.json({
            user: safeUser,
            verificationCode: verification.verificationCode,
            verificationRequired: true,
          });
        });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error("Register error:", err);
        res.status(500).json({
          message: "Erreur lors de l'inscription",
          // Dev only: surface the real cause so it shows in the browser console.
          ...(process.env.NODE_ENV === 'development'
            ? { detail: err instanceof Error ? err.message : String(err) }
            : {}),
        });
      }
    }
  });
  
  // Login
  app.post("/api/auth/login", rateLimit(5, 60000), async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);

      // Verrouillage anti-brute-force par email (en plus du rate-limit IP).
      const lockedUntil = getLoginLockout(input.email);
      if (lockedUntil) {
        const minutes = Math.ceil((lockedUntil - Date.now()) / 60000);
        return res.status(429).json({
          message: `Trop de tentatives. Réessayez dans ${minutes} minute(s).`,
        });
      }

      const user = await getUserByEmail(input.email);
      if (!user) {
        recordFailedLogin(input.email);
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        recordFailedLogin(input.email);
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      // Login réussi : on réinitialise le compteur d'échecs.
      clearLoginAttempts(input.email);

      // Regenerate session to prevent fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Erreur de session" });
        }
        
        setCurrentUser(req, user.id);
        
        // Explicitly save session to ensure it's persisted
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Erreur de sauvegarde de session" });
          }
          
          console.log(`✅ User ${user.id} logged in successfully, session saved`);
          const { passwordHash, ...safeUser } = user;
          res.json(safeUser);
        });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error("Login error:", err);
        res.status(500).json({ message: "Erreur lors de la connexion" });
      }
    }
  });
  
  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      await destroySession(req);
      res.clearCookie("connect.sid");
      res.json({ message: "Déconnexion réussie" });
    } catch (err) {
      res.status(500).json({ message: "Erreur lors de la déconnexion" });
    }
  });
  
  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    console.log("🔍 /api/auth/me called", {
      sessionID: req.sessionID,
      hasSession: !!req.session,
      userId: req.session?.userId,
    });

    const userId = getCurrentUser(req);
    if (!userId) {
      console.log("❌ No userId in session");
      return res.status(401).json({ message: "Non authentifié" });
    }
    
    const user = await getUserById(userId);
    if (!user) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }
    
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  // ==================== MULTI-COMPTE INSTAGRAM ====================

  // Liste des comptes Instagram du login (owner inclus) + compte actif.
  app.get("/api/accounts", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) return res.status(401).json({ message: "Non authentifié" });

      const activeId = getActiveAccount(req);
      const accounts = await getAccountsForOwner(ownerId);

      // Compteurs réels dérivés de la table followers (source de vérité), en une
      // seule requête groupée. Repli sur la colonne cache si aucune ligne.
      const followerCounts = new Map<number, number>();
      if (pgPool && accounts.length > 0) {
        try {
          const ids = accounts.map((a) => a.id);
          const counts = await pgPool.query(
            `SELECT user_id, COUNT(*)::int AS n FROM followers WHERE user_id = ANY($1::int[]) GROUP BY user_id`,
            [ids]
          );
          for (const row of counts.rows) followerCounts.set(Number(row.user_id), Number(row.n));
        } catch (e) {
          console.error("Account follower counts error:", e);
        }
      }

      res.json({
        accounts: accounts.map((a) => ({
          id: a.id,
          username: a.username,
          avatarUrl: a.avatarUrl,
          instagramUserId: a.instagramUserId,
          isOwner: a.id === ownerId,
          active: a.id === activeId,
          followersCount: followerCounts.get(a.id) ?? a.followersCount ?? 0,
        })),
        activeAccountId: activeId,
        ownerId,
      });
    } catch (error: any) {
      console.error("Get accounts error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Bascule le compte Instagram actif (vérifie l'appartenance à l'owner).
  app.post("/api/accounts/switch", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) return res.status(401).json({ message: "Non authentifié" });

      const accountId = Number(req.body.accountId);
      if (!accountId) return res.status(400).json({ message: "accountId requis" });

      if (!(await isAccountOwnedBy(accountId, ownerId))) {
        return res.status(403).json({ message: "Compte non autorisé" });
      }

      setActiveAccount(req, accountId);
      const account = await getUserById(accountId);
      res.json({ success: true, activeAccountId: accountId, account: account && { id: account.id, username: account.username, avatarUrl: account.avatarUrl } });
    } catch (error: any) {
      console.error("Switch account error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Lie un compte Instagram (depuis l'extension) au login owner et le rend actif.
  app.post("/api/accounts/link", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) return res.status(401).json({ message: "Non authentifié" });

      // Validation stricte des entrées (l'extension peut envoyer dsUserId en nombre).
      const igUsername = typeof req.body?.igUsername === "string" ? req.body.igUsername.trim() : "";
      const dsUserId = String(req.body?.dsUserId ?? "").trim();
      if (!igUsername || !dsUserId || igUsername.length > 100 || dsUserId.length > 64) {
        return res.status(400).json({ message: "igUsername et dsUserId requis" });
      }

      // Anti-fragmentation d'abonnement : l'extension est globale au navigateur et
      // voit TOUS les comptes Instagram connectés. Sans garde-fou, ouvrir un compte
      // appartenant déjà à un AUTRE login (ex. un compte Pro) pendant qu'on est
      // connecté à un login différent (ex. basic) le re-rattache en doublon sous ce
      // login → le compte « passe en basic ». On refuse si le ds_user_id est déjà
      // rattaché à un autre groupe de login. Le login propriétaire d'une ligne est
      // owner_id (compte lié) ou id (le login owner lui-même).
      const existingRows = await db
        .select()
        .from(users)
        .where(eq(users.instagramUserId, String(dsUserId)));
      const conflict = existingRows.find((r) => (r.ownerId ?? r.id) !== ownerId);
      if (conflict) {
        return res.status(409).json({
          message:
            `Le compte Instagram @${conflict.username} est déjà rattaché à un autre ` +
            `compte Waler. Connecte-toi à ce compte pour y accéder, ou détache-le ` +
            `d'abord avant de le lier ici.`,
        });
      }

      // Plafond de comptes selon le plan : on ne bloque que la création d'un
      // NOUVEAU compte (un compte déjà lié peut toujours être ré-ouvert).
      const owner = await getUserById(ownerId);
      const max = maxAccountsForTier(owner?.subscriptionTier as any);
      const existingAccounts = await getAccountsForOwner(ownerId);
      const alreadyLinked = existingAccounts.some(
        (a) => a.instagramUserId === String(dsUserId) || a.username === String(igUsername)
      );
      if (!alreadyLinked && existingAccounts.length >= max) {
        return res.status(403).json({
          message:
            `Limite de ${max} compte(s) atteinte pour votre plan. ` +
            `Passez au plan Pro pour suivre un nombre illimité de comptes.`,
          code: "ACCOUNT_LIMIT_REACHED",
        });
      }

      const account = await findOrCreateLinkedAccount({
        ownerId,
        igUsername: String(igUsername),
        instagramUserId: String(dsUserId),
      });

      // L'owner a désormais connecté/vérifié son compte de référence via
      // l'extension : on le marque comme connecté (lève le gate post-paiement).
      await db.update(users).set({ isConnected: true }).where(eq(users.id, ownerId));
      if (account.id !== ownerId) {
        await db.update(users).set({ isConnected: true }).where(eq(users.id, account.id));
      }

      // Rendre ce compte actif pour la session courante.
      setActiveAccount(req, account.id);

      res.json({
        success: true,
        accountId: account.id,
        username: account.username,
        avatarUrl: account.avatarUrl,
      });
    } catch (error: any) {
      console.error("Link account error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Supprime un compte Instagram LIÉ (jamais le principal) et ses données.
  app.delete("/api/accounts/:id", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) return res.status(401).json({ message: "Non authentifié" });

      const accountId = Number(req.params.id);
      if (!accountId) return res.status(400).json({ message: "id requis" });

      if (accountId === ownerId) {
        return res.status(400).json({
          message:
            "Impossible de supprimer le compte principal. Définissez d'abord un " +
            "autre compte comme principal, puis supprimez celui-ci.",
        });
      }
      if (!(await isAccountOwnedBy(accountId, ownerId))) {
        return res.status(403).json({ message: "Compte non autorisé" });
      }

      // Données scopées par compte (user_id) — nettoyage avant suppression.
      await db.delete(followersTable).where(eq(followersTable.userId, accountId));
      await db.delete(unfollowers).where(eq(unfollowers.userId, accountId));
      await db.delete(blockers).where(eq(blockers.userId, accountId));
      await db.delete(agentStates).where(eq(agentStates.userId, accountId));
      await db.delete(users).where(eq(users.id, accountId));

      // Si le compte supprimé était actif, revenir au principal.
      if (getActiveAccount(req) === accountId) setActiveAccount(req, ownerId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Réinitialise le compte : supprime tous les comptes Instagram LIÉS (et leurs
  // données) et purge les données du compte PRINCIPAL (login/abonnement
  // conservés). Confirmation obligatoire par saisie exacte du username du login.
  app.post("/api/accounts/reset", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) return res.status(401).json({ message: "Non authentifié" });

      const owner = await getUserById(ownerId);
      if (!owner) return res.status(404).json({ message: "Utilisateur non trouvé" });

      const confirmUsername = typeof req.body?.confirmUsername === "string" ? req.body.confirmUsername.trim() : "";
      if (!confirmUsername || confirmUsername.toLowerCase() !== owner.username.toLowerCase()) {
        return res.status(400).json({ message: "Confirmation invalide : le nom d'utilisateur ne correspond pas." });
      }

      const accounts = await getAccountsForOwner(ownerId);
      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const purgeWalerData = (username: string) => {
        const walerUserId = resolveWalerUserId(sqlite, username);
        if (!walerUserId) return;
        try {
          sqlite.prepare(`
            DELETE FROM liked_posts WHERE circle_member_id IN
              (SELECT id FROM circle_members WHERE user_id = ?)
          `).run(walerUserId);
          sqlite.prepare(`
            DELETE FROM timeline_events WHERE circle_member_id IN
              (SELECT id FROM circle_members WHERE user_id = ?)
          `).run(walerUserId);
          sqlite.prepare(`DELETE FROM contact_scores WHERE user_id = ?`).run(walerUserId);
          sqlite.prepare(`DELETE FROM circle_members WHERE user_id = ?`).run(walerUserId);
          sqlite.prepare(`DELETE FROM users WHERE id = ?`).run(walerUserId);
        } catch (e) {
          console.error(`Reset: waler.db purge failed for @${username}:`, e);
        }
      };

      // Chaque table est vidée indépendamment : certaines (ex. agent_states) du
      // schéma Drizzle ne sont pas forcément provisionnées dans la base réelle
      // (drift connu, cf. plans/subscriptions) — une table absente ne doit pas
      // empêcher la purge des autres.
      const safeDelete = async (label: string, fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (e) {
          console.error(`Reset: purge ${label} failed:`, e);
        }
      };

      for (const account of accounts) {
        // Données Postgres scopées par compte (owner ET comptes liés).
        await safeDelete("followers", () => db.delete(followersTable).where(eq(followersTable.userId, account.id)));
        await safeDelete("unfollowers", () => db.delete(unfollowers).where(eq(unfollowers.userId, account.id)));
        await safeDelete("blockers", () => db.delete(blockers).where(eq(blockers.userId, account.id)));
        await safeDelete("agentStates", () => db.delete(agentStates).where(eq(agentStates.userId, account.id)));
        purgeWalerData(account.username);

        if (account.id !== ownerId) {
          // Compte lié : on le retire complètement (jamais le principal).
          await safeDelete("linked account row", () => db.delete(users).where(eq(users.id, account.id)));
        }
      }
      sqlite.close();

      // Le principal garde son login/abonnement mais ses compteurs d'analyse
      // en cache sont remis à zéro (les vraies données viennent d'être purgées).
      await db.update(users).set({
        followersCount: null,
        followingCount: null,
        postsCount: null,
        bio: null,
        isPrivate: null,
        analysisStatus: "pending",
        lastAnalyzedAt: null,
      }).where(eq(users.id, ownerId));

      setActiveAccount(req, ownerId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Reset account error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get subscription status
  app.get("/api/subscription/status", async (req, res) => {
    const userId = getCurrentUser(req);
    if (!userId) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    
    const response = {
      tier: user.subscriptionTier || null,
      status: user.subscriptionStatus || null,
      trialEndsAt: user.trialEndsAt || null
    };
    
    console.log(`📊 Subscription status for user ${userId}:`, response);
    res.json(response);
  });
  
  // DEV ONLY: Force Pro mode for current user
  app.post("/api/subscription/force-pro", requireAuth, async (req, res) => {
    // Réservé au développement : en production, n'importe quel compte connecté
    // pourrait sinon se passer Pro gratuitement.
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Indisponible" });
    }

    const userId = getCurrentUser(req);
    if (!userId) {
      return res.status(401).json({ message: "Non authentifié" });
    }

    try {
      await db.update(users)
        .set({ 
          subscriptionTier: 'pro',
          subscriptionStatus: 'active'
        })
        .where(eq(users.id, userId));
      
      console.log(`✅ User ${userId} upgraded to Pro (DEV MODE)`);
      res.json({ 
        success: true, 
        message: "Upgraded to Pro successfully",
        tier: "pro",
        status: "active"
      });
    } catch (error) {
      console.error("Error forcing Pro mode:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour" });
    }
  });
  
  // ==================== EXTENSION AUTH TOKEN ====================
  
  // Temporary token storage (in-memory)
  const extensionTokens = new Map<string, { userId: number; expiresAt: number }>();
  
  // Generate temporary token for extension authentication
  app.post("/api/extension/generate-token", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      // Generate a temporary token (valid for 5 minutes)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      
      // Store token in memory
      extensionTokens.set(token, { userId, expiresAt });
      
      // Clean up expired tokens
      extensionTokens.forEach((value, key) => {
        if (value.expiresAt < Date.now()) {
          extensionTokens.delete(key);
        }
      });
      
      console.log(`🔑 Generated extension token for user ${userId}`);
      
      res.json({ 
        token,
        userId,
        expiresAt: new Date(expiresAt)
      });
    } catch (err) {
      console.error("Generate extension token error:", err);
      res.status(500).json({ message: "Erreur lors de la génération du token" });
    }
  });
  
  // Validate extension token
  app.post("/api/extension/validate-token", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: "Token requis" });
      }
      
      const tokenData = extensionTokens.get(token);
      
      if (!tokenData) {
        return res.status(401).json({ message: "Token invalide" });
      }
      
      if (tokenData.expiresAt < Date.now()) {
        extensionTokens.delete(token);
        return res.status(401).json({ message: "Token expiré" });
      }
      
      // Token is valid, delete it (one-time use)
      extensionTokens.delete(token);

      console.log(`✅ Token validated for user ${tokenData.userId}`);

      // Récupérer le tier d'abonnement pour gérer la section Pro de l'extension.
      // La source de vérité ici est la colonne users.subscriptionTier (la table
      // subscriptions n'existe pas dans cette base).
      let subscriptionTier: string | null = null;
      let isActive = false;
      try {
        const [user] = await db.select().from(users).where(eq(users.id, tokenData.userId));
        subscriptionTier = user?.subscriptionTier ?? null;
        isActive = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
      } catch (e) {
        console.error("Impossible de lire subscriptionTier:", e);
      }

      res.json({
        valid: true,
        userId: tokenData.userId,
        subscriptionTier,
        subscriptionActive: isActive,
        isPro: subscriptionTier === 'pro' && isActive,
      });
    } catch (err) {
      console.error("Validate token error:", err);
      res.status(500).json({ message: "Erreur lors de la validation du token" });
    }
  });

  // Statut Pro courant — lu par l'extension (cookie de session) pour rafraîchir
  // le flag `isPro`, qui sinon reste figé à la valeur du handshake initial. Sert
  // notamment à auto-réparer un `isPro=false` figé par une panne DB transitoire
  // au moment du handshake. Le Pro est lié au login owner (app_users du owner).
  app.get("/api/extension/pro-status", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const tier = user?.subscriptionTier ?? null;
      const active =
        user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
      res.json({ success: true, subscriptionTier: tier, isPro: tier === 'pro' && active, subscriptionActive: active });
    } catch (err: any) {
      console.error("pro-status error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Extension authentication page
  app.get("/extension-auth", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentification requise</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
              * { box-sizing: border-box; }
              body {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: radial-gradient(1200px 600px at 50% -10%, rgba(34,197,94,0.12), transparent 60%), linear-gradient(135deg, #0a0a0a 0%, #111111 100%);
                color: #fff;
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; margin: 0; padding: 24px;
              }
              .container {
                text-align: center; width: 100%; max-width: 420px;
                padding: 40px 32px;
                background: rgba(255, 255, 255, 0.04);
                border-radius: 24px;
                border: 1px solid rgba(34, 197, 94, 0.18);
                box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
              }
              .badge {
                width: 72px; height: 72px; margin: 0 auto 22px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                color: #22c55e;
                background: rgba(34, 197, 94, 0.10);
                border: 1px solid rgba(34, 197, 94, 0.35);
              }
              .badge svg { width: 34px; height: 34px; }
              h1 { font-family: 'Outfit', sans-serif; font-size: 24px; margin: 0 0 10px; color: #fff; }
              p { color: rgba(255, 255, 255, 0.6); font-size: 14px; margin: 0 0 24px; line-height: 1.6; }
              a {
                display: inline-block;
                padding: 12px 24px;
                background: #22c55e; color: #0a0a0a;
                font-weight: 700; font-size: 14px;
                border-radius: 12px; text-decoration: none;
                transition: background 0.2s ease;
              }
              a:hover { background: #4ade80; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1>Authentification requise</h1>
              <p>Veuillez vous connecter à Waler pour continuer.</p>
              <a href="/">Retour à l'accueil</a>
            </div>
          </body>
          </html>
        `);
      }
      
      // Generate a temporary token (valid for 5 minutes)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 5 * 60 * 1000;
      
      extensionTokens.set(token, { userId, expiresAt });
      
      console.log(`🔑 Generated extension auth token for user ${userId}`);
      
      // Return HTML page that will communicate with the extension
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connexion à l'extension Waler</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
            * { box-sizing: border-box; }
            body {
              font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: radial-gradient(1200px 600px at 50% -10%, rgba(34,197,94,0.12), transparent 60%), linear-gradient(135deg, #0a0a0a 0%, #111111 100%);
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 24px;
            }
            .container {
              text-align: center;
              width: 100%;
              max-width: 420px;
              padding: 40px 32px;
              background: rgba(255, 255, 255, 0.04);
              border-radius: 24px;
              border: 1px solid rgba(34, 197, 94, 0.18);
              box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
            }
            .badge {
              width: 72px;
              height: 72px;
              margin: 0 auto 22px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #22c55e;
              background: rgba(34, 197, 94, 0.10);
              border: 1px solid rgba(34, 197, 94, 0.35);
              transition: all 0.35s ease;
            }
            .badge svg { width: 34px; height: 34px; }
            .badge.success {
              color: #0a0a0a;
              background: #22c55e;
              border-color: #22c55e;
              box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.15);
            }
            .brand {
              font-family: 'Outfit', sans-serif;
              font-size: 30px;
              font-weight: 800;
              letter-spacing: -0.5px;
              background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            .subtitle {
              font-size: 13px;
              color: rgba(255, 255, 255, 0.45);
              margin-top: 4px;
              font-weight: 500;
            }
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.08);
              border-top-color: #22c55e;
              border-radius: 50%;
              width: 34px;
              height: 34px;
              animation: spin 0.9s linear infinite;
              margin: 28px auto 0;
            }
            .spinner.hidden { display: none; }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            .status {
              margin-top: 18px;
              font-size: 14px;
              color: rgba(255, 255, 255, 0.65);
              line-height: 1.6;
            }
            .status small { color: rgba(255, 255, 255, 0.4); font-size: 12px; }
            .success {
              color: #22c55e;
              font-weight: 700;
              font-size: 16px;
            }
            .error {
              color: #ef4444;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="badge" id="badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <div class="brand">Waler</div>
            <div class="subtitle">Connexion de l'extension</div>
            <div class="spinner" id="spinner"></div>
            <div class="status" id="status">Authentification en cours…</div>
          </div>
          
          <script>
            const token = "${token}";
            const userId = ${userId};
            
            // Attendre que la page soit chargée
            window.addEventListener('load', () => {
              // Ajouter les paramètres à l'URL pour que le content script les capture
              const url = new URL(window.location.href);
              url.searchParams.set('waler_token', token);
              url.searchParams.set('waler_user_id', userId.toString());
              
              // Remplacer l'URL sans recharger la page
              window.history.replaceState({}, '', url.toString());
              
              // Attendre un peu pour que le content script ait le temps de capturer les paramètres
              setTimeout(() => {
                document.getElementById('spinner').classList.add('hidden');
                const badge = document.getElementById('badge');
                badge.classList.add('success');
                badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-4-4"/></svg>';
                document.getElementById('status').innerHTML = '<span class="success">Authentification réussie !</span><br><small>Vous pouvez fermer cet onglet.</small>';

                // Fermer automatiquement après 2 secondes
                setTimeout(() => {
                  window.close();
                }, 2000);
              }, 1000);
            });
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      console.error("Extension auth error:", err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Erreur</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500&display=swap');
            * { box-sizing: border-box; }
            body {
              font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: radial-gradient(1200px 600px at 50% -10%, rgba(239,68,68,0.12), transparent 60%), linear-gradient(135deg, #0a0a0a 0%, #111111 100%);
              color: #fff;
              display: flex; align-items: center; justify-content: center;
              min-height: 100vh; margin: 0; padding: 24px;
            }
            .container {
              text-align: center; width: 100%; max-width: 420px;
              padding: 40px 32px;
              background: rgba(255, 255, 255, 0.04);
              border-radius: 24px;
              border: 1px solid rgba(239, 68, 68, 0.2);
              box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
            }
            .badge {
              width: 72px; height: 72px; margin: 0 auto 22px;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              color: #ef4444;
              background: rgba(239, 68, 68, 0.10);
              border: 1px solid rgba(239, 68, 68, 0.35);
            }
            .badge svg { width: 34px; height: 34px; }
            h1 { font-family: 'Outfit', sans-serif; font-size: 24px; margin: 0 0 10px; color: #fff; }
            p { color: rgba(255, 255, 255, 0.6); font-size: 14px; margin: 0; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </div>
            <h1>Échec de l'authentification</h1>
            <p>Une erreur est survenue lors de la connexion de l'extension. Réessayez depuis le dashboard.</p>
          </div>
        </body>
        </html>
      `);
    }
  });
  
  // ==================== VERIFICATION ROUTES ====================
  
  // Generate verification code
  app.post("/api/auth/verification/generate", requireAuth, rateLimit(3, 60000), async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      const verification = await createVerification(userId);
      const user = await getUserById(userId);
      
      res.json({
        verificationCode: verification.verificationCode,
        username: user?.username,
        expiresAt: verification.expiresAt,
      });
    } catch (err) {
      console.error("Verification generation error:", err);
      res.status(500).json({ message: "Erreur lors de la génération du code" });
    }
  });
  
  // Verify code
  app.post("/api/auth/verification/verify", requireAuth, rateLimit(10, 60000), async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      const input = verifyCodeSchema.parse(req.body);
      
      if (input.userId !== userId) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      
      const result = await verifyToken(userId, input.code);
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error("Verification error:", err);
        res.status(500).json({ message: "Erreur lors de la vérification" });
      }
    }
  });
  
  // Resend verification code
  app.post("/api/auth/verification/resend", requireAuth, rateLimit(3, 60000), async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      const verification = await resendVerificationCode(userId);
      const user = await getUserById(userId);
      
      res.json({
        verificationCode: verification.verificationCode,
        username: user?.username,
        expiresAt: verification.expiresAt,
      });
    } catch (err) {
      console.error("Resend verification error:", err);
      res.status(500).json({ message: "Erreur lors du renvoi du code" });
    }
  });
  
  // ==================== PLANS & SUBSCRIPTION ROUTES ====================
  
  // Get all plans
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await getActivePlans();
      res.json(plans);
    } catch (err) {
      console.error("Get plans error:", err);
      res.status(500).json({ message: "Erreur lors de la récupération des plans" });
    }
  });
  
  // Get user's current plan
  app.get("/api/subscription/current", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      const { plan, subscription } = await getUserPlan(userId);
      res.json({ plan, subscription });
    } catch (err) {
      console.error("Get user plan error:", err);
      res.status(500).json({ message: "Erreur lors de la récupération du plan" });
    }
  });
  
  // Create Stripe checkout session
  app.post("/api/checkout", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { priceId: directPriceId, billingPeriod, planName } = req.body;

      // DISABLE_STRIPE=true : bypass Stripe, activate subscription directly and
      // redirect to dashboard. Used during Chrome Web Store review period.
      if (process.env.DISABLE_STRIPE === 'true') {
        const tier = planName === 'pro' ? 'pro' : 'premium';
        await db.update(users)
          .set({ subscriptionTier: tier, subscriptionStatus: 'active', isVerified: true })
          .where(eq(users.id, userId));
        const baseUrl = process.env.CLIENT_URL || 'http://localhost:5000';
        return res.json({ url: `${baseUrl}/dashboard/${userId}?checkout=success` });
      }

      // Allow lookup by planName + billingPeriod (used during onboarding).
      // 'premium' maps to the 'base' plan; 'pro' maps to 'pro'.
      let priceId = directPriceId;
      let plan = null as Awaited<ReturnType<typeof getPlanByName>>;
      if (!priceId && planName) {
        const serverPlanName = planName === 'premium' ? 'base' : planName;
        plan = await getPlanByName(serverPlanName);
        if (plan) {
          priceId = billingPeriod === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
        }
      } else if (priceId) {
        const allPlans = await getActivePlans();
        plan = allPlans.find(p => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId) || null;
      }

      if (!priceId) {
        return res.status(400).json({ message: "priceId requis (ou planName + billingPeriod)" });
      }

      const user = await getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Récupérer customerId si existe
      const { subscription } = await getUserPlan(userId);

      // L'essai gratuit n'est accordé qu'aux nouveaux abonnés (pas déjà de
      // subscription Stripe) — évite de le réoffrir à chaque changement de plan.
      const trialPeriodDays = !subscription?.stripeSubscriptionId ? plan?.trialDays : undefined;

      const session = await createCheckoutSession({
        userId,
        userEmail: user.email,
        priceId,
        successUrl: `${process.env.CLIENT_URL || 'http://localhost:5000'}/dashboard/${userId}?checkout=success`,
        cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:5000'}/pricing?checkout=canceled`,
        customerId: subscription?.stripeCustomerId || undefined,
        trialPeriodDays,
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({ message: "Erreur lors de la création de la session" });
    }
  });
  
  // Create Stripe customer portal session
  app.post("/api/portal", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      
      const { subscription } = await getUserPlan(userId);

      if (!subscription?.stripeCustomerId) {
        return res.status(400).json({ message: "Aucun abonnement actif" });
      }

      // Deep-link optionnel vers un écran précis du portail (carte, résiliation,
      // changement de formule). On filtre pour n'accepter que les flux connus.
      const allowedFlows = ['payment_method_update', 'subscription_cancel', 'subscription_update'] as const;
      const requestedFlow = req.body?.flow;
      const flow = allowedFlows.includes(requestedFlow) ? requestedFlow : undefined;

      const portalSession = await createCustomerPortal({
        customerId: subscription.stripeCustomerId,
        returnUrl: `${process.env.CLIENT_URL || 'http://localhost:5000'}/billing`,
        flow,
        subscriptionId: subscription.stripeSubscriptionId,
      });

      res.json({ url: portalSession.url });
    } catch (err) {
      console.error("Portal error:", err);
      res.status(500).json({ message: "Erreur lors de la création du portail" });
    }
  });

  // Annuler l'abonnement (résiliation en fin de période — l'accès est conservé
  // jusqu'à `current_period_end`). Alternative in-app au flux du portail Stripe.
  app.post("/api/subscription/cancel", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { subscription } = await getUserPlan(userId);
      if (!subscription?.stripeSubscriptionId) {
        return res.status(400).json({ message: "Aucun abonnement actif" });
      }

      // Résiliation douce côté Stripe : cancel_at_period_end (pas de suppression
      // immédiate). Le webhook customer.subscription.updated confirmera l'état,
      // mais on persiste le flag tout de suite pour un retour UI immédiat.
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await db
        .update(users)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    } catch (err) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({ message: "Erreur lors de l'annulation de l'abonnement" });
    }
  });

  // Réactiver un abonnement résilié avant la fin de période (annule le
  // cancel_at_period_end). Symétrique de /api/subscription/cancel.
  app.post("/api/subscription/reactivate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { subscription } = await getUserPlan(userId);
      if (!subscription?.stripeSubscriptionId) {
        return res.status(400).json({ message: "Aucun abonnement actif" });
      }

      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await db
        .update(users)
        .set({ cancelAtPeriodEnd: false })
        .where(eq(users.id, userId));

      res.json({ success: true, cancelAtPeriodEnd: false });
    } catch (err) {
      console.error("Reactivate subscription error:", err);
      res.status(500).json({ message: "Erreur lors de la réactivation de l'abonnement" });
    }
  });

  // Stripe webhooks
  app.post("/api/webhooks/stripe", async (req, res) => {
    const signature = req.headers["stripe-signature"];
    
    if (!signature || Array.isArray(signature)) {
      return res.status(400).send("Missing or invalid stripe-signature header");
    }
    
    try {
      // Stripe exige le corps BRUT pour vérifier la signature. express.json()
      // s'applique globalement mais capture le buffer d'origine dans req.rawBody
      // (callback verify dans server/index.ts) — c'est lui qu'il faut passer, pas
      // req.body (déjà parsé en objet, ce qui casse la vérification de signature).
      const rawBody = (req as any).rawBody ?? req.body;
      const event = constructWebhookEvent(rawBody as Buffer, signature);

      console.log(`Webhook received: ${event.type}`);
      
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = parseInt(session.metadata?.userId || "0");

          if (!userId || !session.subscription) break;

          const stripeSubscriptionId = session.subscription as string;
          // Récupérer la vraie subscription Stripe (statut réel — 'trialing' pendant
          // l'essai gratuit, 'active' une fois facturée — et priceId).
          const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          const allPlans = await getActivePlans();
          const priceId = stripeSubscription.items.data[0]?.price?.id;
          const plan = allPlans.find(
            (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
          );

          if (!plan) {
            console.error(`No plan found for priceId: ${priceId}`);
            break;
          }

          await upsertSubscription({
            userId,
            planId: plan.id,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId,
            status: stripeSubscription.status,
            billingPeriod:
              stripeSubscription.items.data[0]?.price?.recurring?.interval === "year"
                ? "yearly"
                : "monthly",
            currentPeriodEnd: subscriptionPeriodEnd(stripeSubscription),
            trialEndsAt: stripeTs(stripeSubscription.trial_end) ?? null,
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          });

          console.log(`✅ Subscription ${stripeSubscription.status} for user ${userId}, plan ${plan.name}`);

          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`Subscription updated: ${subscription.id} -> ${subscription.status}`);

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.stripeCustomerId, subscription.customer as string));

          if (user) {
            const priceId = subscription.items.data[0]?.price?.id;
            const allPlans = await getActivePlans();
            const plan = allPlans.find(
              (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
            );

            await upsertSubscription({
              userId: user.id,
              planId: plan?.id ?? (user.subscriptionTier === "pro" ? 2 : 1),
              stripeCustomerId: subscription.customer as string,
              stripeSubscriptionId: subscription.id,
              status: subscription.status,
              billingPeriod:
                subscription.items.data[0]?.price?.recurring?.interval === "year"
                  ? "yearly"
                  : "monthly",
              currentPeriodEnd: subscriptionPeriodEnd(subscription),
              trialEndsAt: stripeTs(subscription.trial_end) ?? null,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

            console.log(`✅ Subscription status updated for user ${user.id}: ${subscription.status} (cancel_at_period_end=${subscription.cancel_at_period_end})`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`Subscription deleted: ${subscription.id}`);

          // Statut seulement — on ne supprime jamais les données utilisateur.
          await db
            .update(users)
            .set({ subscriptionStatus: "cancelled" })
            .where(eq(users.stripeSubscriptionId, subscription.id));

          console.log(`✅ Subscription ${subscription.id} marked cancelled (data preserved)`);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`Payment failed for invoice: ${invoice.id}`);

          const failedSubscriptionId = (invoice as any).subscription as string | undefined;
          if (failedSubscriptionId) {
            await db
              .update(users)
              .set({ subscriptionStatus: "past_due" })
              .where(eq(users.stripeSubscriptionId, failedSubscriptionId));

            console.log(`⚠️ Payment failed for subscription ${failedSubscriptionId} - status set to past_due (data preserved)`);
          }
          break;
        }
      }
      
      res.json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });
  
  // ==================== MARK UNFOLLOWER AS BLOCKER ====================
  
  app.post("/api/unfollowers/:id/mark-as-blocker", async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const unfollowerId = parseInt(req.params.id);
      if (isNaN(unfollowerId)) {
        return res.status(400).json({ message: "Invalid unfollower ID" });
      }
      
      // Get the unfollower
      const [unfollower] = await db
        .select()
        .from(unfollowers)
        .where(eq(unfollowers.id, unfollowerId))
        .limit(1);
      
      if (!unfollower) {
        return res.status(404).json({ message: "Unfollower not found" });
      }
      
      // Verify ownership
      if (unfollower.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      // Create blocker entry
      const [blocker] = await db
        .insert(blockers)
        .values({
          userId: unfollower.userId,
          username: unfollower.username,
          avatarUrl: unfollower.avatarUrl,
          type: "blocker",
          blockType: "manually_marked",
          detectedAt: new Date(),
        })
        .returning();
      
      // Delete from unfollowers
      await db
        .delete(unfollowers)
        .where(eq(unfollowers.id, unfollowerId));
      
      res.json({ 
        success: true, 
        blocker,
        message: "Marked as blocker successfully" 
      });
    } catch (err) {
      console.error("Mark as blocker error:", err);
      res.status(500).json({ 
        message: "Error marking as blocker",
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  });
  
  // ==================== LEGACY CONNECT (redirect to register) ====================
  
  app.post(api.users.connect.path, rateLimit(5, 60000), async (req, res) => {
    try {
      const input = api.users.connect.input.parse(req.body);
      
      // Check if email already exists - if so, try login
      const existingUser = await getUserByEmail(input.email);
      if (existingUser) {
        const isValid = await verifyPassword(input.password, existingUser.passwordHash);
        if (isValid) {
          setCurrentUser(req, existingUser.id);
          const { passwordHash, ...safeUser } = existingUser;
          return res.json(safeUser);
        }
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }
      
      // Create new user
      const user = await createUser({
        username: input.username,
        email: input.email,
        password: input.password,
      });
      
      setCurrentUser(req, user.id);
      await seedMockData(user.id);
      
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error("Connect error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // ==================== PROTECTED ROUTES ====================

  app.get(api.users.get.path, requireAuth, async (req, res) => {
    const userId = getCurrentUser(req);
    const requestedId = Number(req.params.id);

    // Multi-compte : l'owner peut accéder à ses comptes Instagram liés.
    if (!userId || !(await isAccountOwnedBy(requestedId, userId))) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const user = await getUserById(requestedId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get(api.stats.get.path, requireAuth, async (req, res) => {
    const currentUserId = getCurrentUser(req);
    const requestedUserId = Number(req.params.userId);

    // Multi-compte : l'owner peut consulter les stats de ses comptes Insta liés.
    if (!currentUserId || !(await isAccountOwnedBy(requestedUserId, currentUserId))) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    // Get user's Instagram stats from database
    const user = await getUserById(requestedUserId);
    
    // Get followers from SQLite (old system) — fallback legacy
    let recentFollowers = await storage.getFollowers(requestedUserId);

    // Get unfollowers and ghost from PostgreSQL (new system)
    let recentUnfollowers: any[] = [];
    let recentBlockers: any[] = [];

    if (pgPool) {
      try {
        // Followers (nouveau système Postgres) — SOURCE DE VÉRITÉ du compteur.
        // L'ancien storage.getFollowers (SQLite) est souvent vide ; on privilégie
        // la table Postgres `followers` quand elle contient des données.
        const followersResult = await pgPool.query(`
          SELECT id, username, avatar_url as "avatarUrl", detected_at as "detectedAt"
          FROM followers
          WHERE user_id = $1
          ORDER BY detected_at DESC
        `, [requestedUserId]);
        if (followersResult.rows.length > 0) {
          recentFollowers = followersResult.rows;
        }

        // Get unfollowers (status = 'unfollowed')
        const unfollowersResult = await pgPool.query(`
          SELECT id, username, avatar_url as "avatarUrl", status, detected_at as "detectedAt", verified_at as "verifiedAt"
          FROM unfollowers
          WHERE user_id = $1 AND status = 'unfollowed'
          ORDER BY detected_at DESC
        `, [requestedUserId]);
        
        // Get ghost followers (status = 'blocked' OR 'deleted')
        const ghostResult = await pgPool.query(`
          SELECT id, username, avatar_url as "avatarUrl", status, detected_at as "detectedAt", verified_at as "verifiedAt"
          FROM unfollowers
          WHERE user_id = $1 AND status IN ('blocked', 'deleted')
          ORDER BY detected_at DESC
        `, [requestedUserId]);
        
        recentUnfollowers = unfollowersResult.rows;
        recentBlockers = ghostResult.rows;
      } catch (error) {
        console.error('Error fetching unfollowers from PostgreSQL:', error);
        // Fallback to SQLite if PostgreSQL fails
        recentUnfollowers = await storage.getUnfollowers(requestedUserId);
        recentBlockers = await storage.getBlockers(requestedUserId);
      }
    } else {
      // Fallback to SQLite if pgPool not available
      recentUnfollowers = await storage.getUnfollowers(requestedUserId);
      recentBlockers = await storage.getBlockers(requestedUserId);
    }

    // Generate chart data for current month (31 days) based on real data
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const chartData = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      
      // Count actual followers/unfollowers for this day
      const dayFollowers = recentFollowers.filter(f => {
        const d = new Date(f.detectedAt || new Date());
        return d.getDate() === day && d.getMonth() === now.getMonth();
      }).length;
      
      const dayUnfollowers = recentUnfollowers.filter(u => {
        const d = new Date(u.detectedAt || new Date());
        return d.getDate() === day && d.getMonth() === now.getMonth();
      }).length;
      
      const dayBlockers = recentBlockers.filter(b => {
        const d = new Date(b.detectedAt || new Date());
        return d.getDate() === day && d.getMonth() === now.getMonth();
      }).length;
      
      return { 
        day, 
        followers: dayFollowers,
        unfollowers: dayUnfollowers,
        blockers: dayBlockers
      };
    });

    res.json({
      // Real Instagram stats from database — `user.followersCount` (synchronisé à
      // chaque scan via UPDATE_USER_INFO) est la source de vérité : la table
      // `followers` est append-only (jamais purgée des départs avant la fix
      // anti-dérive de /api/extension/verify-missing-followers) et peut dériver
      // AU-DESSUS du total réel si des comptes partis ne sont jamais nettoyés.
      instagramFollowers: user?.followersCount || recentFollowers.length || 0,
      instagramFollowing: user?.followingCount || 0,
      instagramPosts: user?.postsCount || 0,
      instagramBio: user?.bio || '',
      isPrivate: user?.isPrivate || false,
      analysisStatus: user?.analysisStatus || 'pending',
      lastAnalyzedAt: user?.lastAnalyzedAt || null,
      // Activity tracking stats
      totalUnfollowers: recentUnfollowers.length,
      totalFollowers: recentFollowers.length,
      totalBlockers: recentBlockers.length,
      recentUnfollowers,
      recentFollowers,
      recentBlockers,
      chartData,
      growthRate: recentFollowers.length > 0 ? ((recentFollowers.length - recentUnfollowers.length) / Math.max(recentFollowers.length, 1)) * 100 : -2.4,
    });
  });

  // Generate code to send for onboarding
  app.post("/api/verification/generate-code", async (req, res) => {
    try {
      const { instagramUsername } = req.body;
      
      if (!instagramUsername) {
        return res.status(400).json({ success: false, message: "Instagram username required" });
      }

      const codeToSend = await createVerificationCode(instagramUsername);
      
      res.json({ 
        success: true,
        codeToSend,
        message: `Send this code to @waler.web on Instagram: ${codeToSend}`
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Analyze a person from Pro mode (people/client)
  app.post("/api/pro/analyze-person", async (req, res) => {
    try {
      const { instagramUsername, accountUsername, fromSuggestion } = req.body;
      let userId = getActiveAccount(req);

      if (!instagramUsername) {
        return res.status(400).json({ success: false, message: "Instagram username required" });
      }

      console.log(`🔍 Starting Pro analysis for @${instagramUsername}`);

      // Sauvegarder le prospect dans circle_members
      const prospectId = Date.now();
      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Rattacher la personne au COMPTE CHOISI dans le dashboard, pas au compte
      // de session de l'extension. Le compte obtient (ou crée) son propre bucket
      // waler.db → ses People restent isolées des autres comptes.
      if (accountUsername) {
        userId = ensureWalerUserId(sqlite, accountUsername);
      }

      if (!userId) {
        sqlite.close();
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      // Vérifier que l'utilisateur existe
      const userExists = sqlite.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
      
      if (!userExists) {
        sqlite.close();
        return res.status(400).json({ 
          success: false, 
          message: `User ID ${userId} not found in database. Please re-login.` 
        });
      }
      
      // Colonne de statut d'analyse (suivi par l'overlay « Analyse en cours »).
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN analysis_status TEXT DEFAULT 'pending'`).run();
      } catch {
        /* colonne déjà existante */
      }
      // Provenance : 1 = ajoutée depuis une suggestion (engagement déjà connu, on
      // saute la collecte de profil) ; 0 = ajout manuel (collecte de profil via
      // 1 appel API au 1er « Analyze » dans l'extension).
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN from_suggestion INTEGER DEFAULT 0`).run();
      } catch {
        /* colonne déjà existante */
      }

      const fromSuggestionFlag = fromSuggestion ? 1 : 0;
      sqlite.prepare(`
        INSERT OR IGNORE INTO circle_members (
          id, user_id, member_username, category, analysis_status, from_suggestion, created_at
        ) VALUES (?, ?, ?, 'prospect', 'analyzing', ?, datetime('now'))
      `).run(prospectId, userId, instagramUsername, fromSuggestionFlag);

      // Marquer (re)analyse en cours, que la ligne vienne d'être créée ou existait déjà.
      sqlite.prepare(`
        UPDATE circle_members SET analysis_status = 'analyzing'
        WHERE user_id = ? AND member_username = ?
      `).run(userId, instagramUsername);

      sqlite.close();

      console.log(`💾 Prospect @${instagramUsername} sauvegardé avec ID ${prospectId}`);

      // Note: L'analyse d'engagement du cercle/prospects se fait désormais dans
      // l'extension (bouton Pro → /api/extension/pro-engagement).
      
      res.json({ 
        success: true,
        status: 'analyzing',
        message: `Analysis started for @${instagramUsername}`,
        prospectId
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Supprime définitivement un People (circle_members) côté serveur. Sans ça,
  // la suppression dans le dashboard ne touche que le localStorage : l'extension
  // (qui lit GET /api/extension/people, donc circle_members) continue de l'afficher.
  app.post("/api/pro/delete-person", requireAuth, async (req, res) => {
    try {
      const { instagramUsername, accountUsername } = req.body;
      let userId = getActiveAccount(req);

      if (!instagramUsername) {
        return res.status(400).json({ success: false, message: "Instagram username required" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Isolation stricte : on supprime UNIQUEMENT dans le bucket du compte visé.
      // Si ce compte n'a pas (encore) de bucket waler.db, il n'a aucune People —
      // on ne retombe PAS sur le compte de session (sinon on effacerait la People
      // d'un AUTRE compte : c'était la cause de la suppression cross-compte).
      if (accountUsername) {
        const resolved = resolveWalerUserId(sqlite, accountUsername);
        if (!resolved) {
          sqlite.close();
          return res.json({ success: true, deleted: 0 });
        }
        userId = resolved;
      }

      if (!userId) {
        sqlite.close();
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      // Récupérer l'id du membre pour nettoyer ses lignes enfants.
      const member = sqlite
        .prepare(`SELECT id FROM circle_members WHERE user_id = ? AND lower(member_username) = lower(?)`)
        .get(userId, instagramUsername) as { id: number } | undefined;

      if (member?.id) {
        try { sqlite.prepare(`DELETE FROM liked_posts WHERE circle_member_id = ?`).run(member.id); } catch {}
        try { sqlite.prepare(`DELETE FROM timeline_events WHERE circle_member_id = ?`).run(member.id); } catch {}
      }
      try {
        sqlite.prepare(`DELETE FROM contact_scores WHERE user_id = ? AND lower(contact_username) = lower(?)`)
          .run(userId, instagramUsername);
      } catch {}

      const result = sqlite
        .prepare(`DELETE FROM circle_members WHERE user_id = ? AND lower(member_username) = lower(?)`)
        .run(userId, instagramUsername);

      sqlite.close();

      console.log(`🗑️ People @${instagramUsername} supprimé (user ${userId}, ${result.changes} ligne(s))`);
      res.json({ success: true, deleted: result.changes });
    } catch (error: any) {
      console.error("Delete person error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Statut d'analyse d'un prospect/people (circle_members) — interrogé par
  // l'overlay « Analyse en cours » du dashboard Pro pour savoir quand fermer.
  app.get("/api/pro/person-analysis-status/:username", requireAuth, async (req, res) => {
    try {
      let userId = getActiveAccount(req);

      const { username } = req.params;
      if (!username) {
        return res.status(400).json({ success: false, message: "Username required" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Même compte que l'insertion (analyze-person), isolation stricte : statut
      // lu dans le bucket du compte visé uniquement, jamais celui d'un autre.
      const accountUsername = req.query.accountUsername ? String(req.query.accountUsername) : null;
      if (accountUsername) {
        const resolved = resolveWalerUserId(sqlite, accountUsername);
        if (!resolved) {
          sqlite.close();
          return res.status(404).json({ success: false, status: 'pending', message: "Account bucket not found" });
        }
        userId = resolved;
      }

      if (!userId) {
        sqlite.close();
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN analysis_status TEXT DEFAULT 'pending'`).run();
      } catch {
        /* colonne déjà existante */
      }

      const row = sqlite.prepare(`
        SELECT analysis_status, relationship_score, total_likes_given, updated_at
        FROM circle_members
        WHERE user_id = ? AND member_username = ?
      `).get(userId, username) as
        | { analysis_status: string | null; relationship_score: number | null; total_likes_given: number | null; updated_at: string | null }
        | undefined;

      sqlite.close();

      if (!row) {
        return res.status(404).json({ success: false, status: 'pending', message: "Person not found" });
      }

      res.json({
        success: true,
        status: row.analysis_status || 'pending',
        score: row.relationship_score ?? 0,
        totalLikesGiven: row.total_likes_given ?? 0,
        updatedAt: row.updated_at || null,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });


  // NB: Les routes Pro « Clients » (gestion des clients de coaching, agent
  // agent_pro_clients.py, métriques client_metrics) ont été extraites du projet.
  // Voir _archive-clients/ pour le code réutilisable. Le Mode Pro ne gère plus
  // que les « People » (prospects / connexions), traitées via l'extension et
  // /api/extension/pro-engagement.

  // ==================== EXTENSION API ROUTES ====================
  
  // Sync data from extension
  app.post("/api/extension/sync", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { data } = req.body;

      if (!Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid data format" });
      }

      // Borne anti-abus : on ignore les payloads démesurés.
      if (data.length > 50000) {
        return res.status(413).json({ message: "Trop d'éléments" });
      }

      console.log(`📥 Extension sync: ${data.length} items from user ${userId}`);

      // Nettoie/borne les champs texte d'un item (username, avatarUrl).
      const cleanUsername = (v: unknown): string =>
        (typeof v === "string" ? v.trim() : "").slice(0, 100);
      const cleanUrl = (v: unknown): string | undefined =>
        typeof v === "string" ? v.slice(0, 2000) : undefined;

      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const username = cleanUsername(item.username);
        const avatarUrl = cleanUrl(item.avatarUrl);

        switch (item.type) {
          case 'follower':
            if (!username) break;
            await storage.createFollower({ userId, username, avatarUrl });
            console.log(`➕ Follower added: @${username}`);
            break;

          case 'unfollower':
            if (!username) break;
            await storage.createUnfollower({ userId, username, avatarUrl });
            console.log(`➖ Unfollower added: @${username}`);
            break;

          case 'blocker':
            if (!username) break;
            await storage.createBlocker({ userId, username, avatarUrl, type: 'blocker' });
            console.log(`🚫 Blocker added: @${username}`);
            break;

          case 'engagement':
            console.log(`💫 Engagement tracked: ${item.metadata?.action} by @${username}`);
            break;
        }
      }

      res.json({ 
        success: true,
        synced: data.length,
        message: `${data.length} items synchronized`
      });
    } catch (error: any) {
      console.error("Extension sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Sync full database from extension
  app.post("/api/extension/sync-full", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      // Cibler le compte envoyé par l'extension (accountId) plutôt que de faire
      // confiance à session.activeAccountId, qui peut être désaligné si la bascule
      // de compte (/api/accounts/switch) n'a pas (encore) eu lieu. On valide que
      // l'accountId appartient bien au login owner avant de l'utiliser.
      const ownerId = getCurrentUser(req);
      const bodyAccountId = Number(req.body.accountId);
      let userId = getActiveAccount(req);
      if (ownerId && bodyAccountId && (await isAccountOwnedBy(bodyAccountId, ownerId))) {
        userId = bodyAccountId;
      }
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { followers, totalCount, lastScanDate } = req.body;
      
      if (!Array.isArray(followers)) {
        return res.status(400).json({ message: "Invalid data format" });
      }

      // Borne anti-abus sur la taille du payload.
      if (followers.length > 200000) {
        return res.status(413).json({ message: "Trop de followers" });
      }

      console.log(`📥 Full database sync: ${followers.length} followers from user ${userId}`);

      let added = 0;
      let skipped = 0;
      let recovered = 0;

      // SQLite pour émettre les signaux Pro (follow / refollow) sur les fiches suivies.
      const sqlite = new Database(path.join(moduleDir, "waler.db"));
      try {
        for (const follower of followers) {
          try {
            // Ignore les entrées sans username valide (robustesse + anti-données corrompues).
            if (!follower || typeof follower !== "object" || typeof follower.username !== "string" || !follower.username.trim()) {
              skipped++;
              continue;
            }

            // Re-follow : la personne était dans unfollowers (perdue) et revient.
            // On garde la ligne (historique) mais on la marque « réabonnée ».
            if (pgPool) {
              const prev = await pgPool.query(
                `SELECT id FROM unfollowers
                 WHERE user_id = $1 AND LOWER(username) = LOWER($2)
                   AND status IN ('unfollowed', 'blocked', 'deleted')
                   AND recovered_at IS NULL`,
                [userId, follower.username]
              );
              if (prev.rows.length > 0) {
                await pgPool.query(
                  `UPDATE unfollowers SET recovered_at = NOW() WHERE id = $1`,
                  [prev.rows[0].id]
                );
                emitRelationshipSignal(sqlite, userId, follower.username, 'refollow');
                recovered++;
              }
            }

            // Vérifier si le follower existe déjà
            const existing = await db
              .select()
              .from(followersTable)
              .where(
                and(
                  eq(followersTable.userId, userId),
                  eq(followersTable.username, follower.username)
                )
              )
              .limit(1);

            if (existing.length === 0) {
              await storage.createFollower({
                userId,
                username: follower.username,
                avatarUrl: follower.avatarUrl,
              });
              added++;
              // Nouveau follower : signal Pro si la personne est suivie en Pro.
              emitRelationshipSignal(sqlite, userId, follower.username, 'follow');
            } else {
              skipped++;
            }
          } catch (error: any) {
            console.error(`Error adding follower @${follower.username}:`, error.message);
          }
        }
      } finally {
        sqlite.close();
      }

      console.log(`✅ Full sync complete: ${added} added, ${skipped} skipped, ${recovered} recovered`);

      // Maintenir la colonne cache app_users.followers_count alignée sur le count
      // réel de la table followers (cohérence dashboard + switcher).
      let followersCount = followers.length;
      if (pgPool) {
        try {
          const c = await pgPool.query(
            `SELECT COUNT(*)::int AS n FROM followers WHERE user_id = $1`,
            [userId]
          );
          followersCount = Number(c.rows[0]?.n ?? followersCount);
          await db.update(users).set({ followersCount }).where(eq(users.id, userId));
        } catch (e) {
          console.error("Failed to refresh followers_count after sync:", e);
        }
      }

      res.json({
        success: true,
        added,
        skipped,
        recovered,
        total: followers.length,
        followersCount,
        message: `Full sync complete: ${added} new followers added, ${recovered} recovered`
      });
    } catch (error: any) {
      console.error("Full sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Restauration : renvoie les followers du compte actif (depuis Postgres) pour
  // que l'extension reconstruise sa base locale sans re-scanner Instagram.
  app.get("/api/extension/followers", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);

      // Cible explicite (accountId) prioritaire sur le compte actif de la session :
      // évite que la restauration récupère les followers du mauvais compte si la
      // session backend n'est pas alignée. On vérifie l'appartenance à l'owner.
      const requestedAccountId = req.query.accountId ? Number(req.query.accountId) : null;
      if (requestedAccountId && ownerId && (await isAccountOwnedBy(requestedAccountId, ownerId))) {
        userId = requestedAccountId;
      }

      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const rows = await db
        .select()
        .from(followersTable)
        .where(eq(followersTable.userId, userId));

      const followers = rows.map((f) => ({
        username: f.username,
        avatarUrl: f.avatarUrl ?? undefined,
        detectedAt: (f.detectedAt ?? new Date()).toISOString?.() ?? String(f.detectedAt),
      }));

      res.json({ success: true, followers, totalCount: followers.length });
    } catch (error: any) {
      console.error("Get extension followers error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get extension auth token
  app.post("/api/extension/auth", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const user = await getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      const token = Buffer.from(`${userId}:${Date.now()}`).toString('base64');

      res.json({
        success: true,
        userId,
        username: user.username,
        token,
      });
    } catch (error: any) {
      console.error("Extension auth error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update user info from extension
  app.post("/api/extension/update-user-info", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { followersCount, followingCount, postsCount, bio, isPrivate } = req.body;

      await db.update(users)
        .set({
          followersCount,
          followingCount,
          postsCount,
          bio,
          isPrivate,
          lastAnalyzedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`📊 User info updated from extension for user ${userId}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update user info error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Liste des "people" (circle_members) de l'utilisateur — utilisée par la
  // section Pro de l'extension pour savoir quelles conversations analyser.
  app.get("/api/extension/people", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);

      // Cible explicite (accountId) prioritaire sur le compte actif de la session.
      const requestedAccountId = req.query.accountId ? Number(req.query.accountId) : null;
      if (requestedAccountId && ownerId && (await isAccountOwnedBy(requestedAccountId, ownerId))) {
        userId = requestedAccountId;
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Résolution PAR USERNAME (priorité maximale) : les id Supabase (auth) et
      // waler.db (données Pro) peuvent différer pour un même compte. Or
      // `circle_members` et `users` vivent tous deux dans waler.db, donc résoudre
      // l'id depuis le username Instagram actif est la voie fiable.
      const reqUsername = req.query.username ? String(req.query.username) : null;
      if (reqUsername) {
        // Isolation stricte : People du compte EXACT. Pas de bucket pour ce
        // compte = liste vide, jamais les People d'un autre compte par fallback.
        const resolved = resolveWalerUserId(sqlite, reqUsername);
        if (!resolved) {
          sqlite.close();
          return res.json({ success: true, people: [] });
        }
        userId = resolved;
      }

      if (!userId) {
        sqlite.close();
        return res.status(401).json({ message: "Non authentifié" });
      }

      // Colonnes de profil (créées par /api/extension/person-profile et
      // /api/pro/analyze-person) — garanties présentes pour ne pas faire échouer
      // le SELECT sur une base antérieure à cette fonctionnalité.
      for (const ddl of [
        `ALTER TABLE circle_members ADD COLUMN profile_collected_at TEXT`,
        `ALTER TABLE circle_members ADD COLUMN from_suggestion INTEGER DEFAULT 0`,
      ]) {
        try { sqlite.prepare(ddl).run(); } catch { /* colonne déjà existante */ }
      }

      const rows = sqlite.prepare(`
        SELECT member_username, full_name, profile_pic_url, category, relationship_score,
               profile_collected_at, from_suggestion
        FROM circle_members
        WHERE user_id = ?
        ORDER BY relationship_score DESC, member_username ASC
      `).all(userId) as any[];

      sqlite.close();

      const people = rows.map((r) => ({
        memberUsername: r.member_username,
        fullName: r.full_name || '',
        avatarUrl: r.profile_pic_url || '',
        category: r.category || 'prospect',
        relationshipScore: r.relationship_score ?? 0,
        // null tant que le profil n'a pas été collecté → la popup propose alors la
        // collecte au 1er « Analyze » ; sinon « Analyze » = conversation directe.
        profileCollectedAt: r.profile_collected_at || null,
        fromSuggestion: !!r.from_suggestion,
      }));

      res.json({ success: true, people });
    } catch (error: any) {
      console.error("Get people error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ===== Mots-clés de campagne (mécanique « commente GUIDE ») =====
  // Liste de mots-clés PAR COMPTE Instagram. L'extension matche EN LOCAL les
  // commentaires des People contre cette liste (fuzzy) et ne renvoie que le
  // mot-clé détecté. La table vit dans waler.db (comme circle_members), scopée
  // par le bucket du compte (users.id).
  const KEYWORD_MAX = 30; // plafond de mots-clés par compte
  const KEYWORD_MAXLEN = 40;
  const ensureKeywordTable = (sqlite: any) => {
    sqlite.prepare(`
      CREATE TABLE IF NOT EXISTS pro_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        keyword TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(account_id, keyword)
      )
    `).run();
  };
  // Résout le bucket waler.db du compte visé : username explicite prioritaire
  // (accountUsername ou username), puis accountId possédé, puis compte de session.
  // `create` = crée le bucket si absent (écriture) ; sinon renvoie null (lecture).
  const resolveKeywordAccount = async (
    req: any,
    sqlite: any,
    create: boolean
  ): Promise<number | null> => {
    const ownerId = getCurrentUser(req);
    let userId = getActiveAccount(req) as number | null;
    const rawId = req.query.accountId ?? req.body?.accountId;
    const acctId = rawId != null ? Number(rawId) : null;
    if (acctId && ownerId && (await isAccountOwnedBy(acctId, ownerId))) userId = acctId;
    const uname = req.query.accountUsername || req.query.username || req.body?.accountUsername || req.body?.username;
    if (uname) {
      const name = String(uname);
      return create ? ensureWalerUserId(sqlite, name) : resolveWalerUserId(sqlite, name);
    }
    return userId || null;
  };
  const listKeywords = (sqlite: any, accountId: number) =>
    (sqlite.prepare(
      `SELECT id, keyword FROM pro_keywords WHERE account_id = ? ORDER BY created_at ASC, id ASC`
    ).all(accountId) as Array<{ id: number; keyword: string }>);

  app.get("/api/extension/pro-keywords", requireAuth, async (req, res) => {
    try {
      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);
      ensureKeywordTable(sqlite);
      const accountId = await resolveKeywordAccount(req, sqlite, false);
      if (!accountId) {
        sqlite.close();
        return res.json({ success: true, keywords: [] });
      }
      const keywords = listKeywords(sqlite, accountId);
      sqlite.close();
      res.json({ success: true, keywords });
    } catch (error: any) {
      console.error("List pro-keywords error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/extension/pro-keywords", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const raw = String(req.body?.keyword || "").trim().replace(/\s+/g, " ");
      if (!raw) return res.status(400).json({ success: false, message: "keyword required" });
      if (raw.length > KEYWORD_MAXLEN) {
        return res.status(400).json({ success: false, message: "keyword too long" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);
      ensureKeywordTable(sqlite);
      const accountId = await resolveKeywordAccount(req, sqlite, true);
      if (!accountId) {
        sqlite.close();
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      const count = (sqlite.prepare(`SELECT COUNT(*) AS n FROM pro_keywords WHERE account_id = ?`).get(accountId) as { n: number }).n;
      // Dédup insensible à la casse (on garde la casse CANONIQUE saisie pour l'UI).
      const dup = sqlite.prepare(
        `SELECT 1 FROM pro_keywords WHERE account_id = ? AND lower(keyword) = lower(?) LIMIT 1`
      ).get(accountId, raw);
      if (!dup) {
        if (count >= KEYWORD_MAX) {
          sqlite.close();
          return res.status(400).json({ success: false, message: `Max ${KEYWORD_MAX} keywords` });
        }
        sqlite.prepare(`INSERT INTO pro_keywords (account_id, keyword) VALUES (?, ?)`).run(accountId, raw);
      }
      const keywords = listKeywords(sqlite, accountId);
      sqlite.close();
      res.json({ success: true, keywords });
    } catch (error: any) {
      console.error("Add pro-keyword error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/extension/pro-keywords/:id", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: "invalid id" });

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);
      ensureKeywordTable(sqlite);
      const accountId = await resolveKeywordAccount(req, sqlite, false);
      if (!accountId) {
        sqlite.close();
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }
      // Suppression scopée au compte : on ne peut pas supprimer le mot-clé d'un autre.
      sqlite.prepare(`DELETE FROM pro_keywords WHERE id = ? AND account_id = ?`).run(id, accountId);
      const keywords = listKeywords(sqlite, accountId);
      sqlite.close();
      res.json({ success: true, keywords });
    } catch (error: any) {
      console.error("Delete pro-keyword error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Stats d'engagement des "people" (circle_members) — lues par le dashboard Pro
  // pour refléter les likes/commentaires collectés par l'extension
  // (/api/extension/pro-engagement). Renvoie score, likes, connexions mutuelles
  // et la liste des signaux (likes + commentaires), par username.
  app.get("/api/pro/circle-stats", requireAuth, async (req, res) => {
    try {
      let userId = getActiveAccount(req);

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Stats du COMPTE affiché dans le dashboard (et non du compte de session de
      // l'extension), isolation stricte : bucket du compte visé uniquement. Pas
      // de bucket = pas de People → stats vides (jamais celles d'un autre compte).
      const accountUsername = req.query.accountUsername ? String(req.query.accountUsername) : null;
      if (accountUsername) {
        const resolved = resolveWalerUserId(sqlite, accountUsername);
        if (!resolved) {
          sqlite.close();
          return res.json({ success: true, stats: [] });
        }
        userId = resolved;
      }

      if (!userId) {
        sqlite.close();
        return res.status(401).json({ message: "Non authentifié" });
      }

      // S'assurer que la colonne existe (créée aussi par /pro-engagement).
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN engagement_pattern TEXT`).run();
      } catch {
        /* colonne déjà existante */
      }
      // Liste des comptes en commun (créée aussi par /pro-engagement) — garantie
      // ici pour que le SELECT ne casse pas avant un premier sync.
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN mutual_followers_list TEXT`).run();
      } catch {
        /* colonne déjà existante */
      }
      // Connection status collecté par /person-profile — garanti pour le SELECT.
      for (const col of ['follows_you INTEGER', 'you_follow INTEGER']) {
        try {
          sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN ${col}`).run();
        } catch {
          /* colonne déjà existante */
        }
      }
      // Compteur de commentaires « mot-clé » (créé par /pro-engagement) — garanti ici.
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN keyword_hits INTEGER DEFAULT 0`).run();
      } catch {
        /* colonne déjà existante */
      }
      // Colonnes de l'axe « température » sur contact_scores (créées par
      // /analyze-contact) — garanties ici pour que le JOIN ne casse pas.
      for (const col of ['temperature TEXT', 'dynamics TEXT', 'advice TEXT', 'setting_phase TEXT', 'setting_summary TEXT']) {
        try {
          sqlite.prepare(`ALTER TABLE contact_scores ADD COLUMN ${col}`).run();
        } catch {
          /* colonne déjà existante */
        }
      }

      const members = sqlite.prepare(`
        SELECT cm.id, cm.member_username, cm.relationship_score, cm.total_likes_given,
               cm.last_like_given_at, cm.mutual_followers_count, cm.mutual_followers_list,
               cm.consecutive_likes_streak, cm.keyword_hits,
               cm.engagement_pattern, cm.follows_you, cm.you_follow,
               cs.temperature, cs.dynamics, cs.advice, cs.setting_phase, cs.setting_summary
        FROM circle_members cm
        LEFT JOIN contact_scores cs
          ON cs.user_id = cm.user_id AND cs.contact_username = cm.member_username
        WHERE cm.user_id = ?
      `).all(userId) as any[];

      const likesStmt = sqlite.prepare(
        `SELECT post_url, liked_at FROM liked_posts WHERE circle_member_id = ? ORDER BY liked_at DESC LIMIT 20`
      );
      const commentsStmt = sqlite.prepare(
        `SELECT event_data, detected_at FROM timeline_events WHERE circle_member_id = ? AND event_type = 'comment' ORDER BY detected_at DESC LIMIT 20`
      );
      // Signaux de relation (follow / unfollow / blocked / deleted / ghost /
      // refollow) émis par le mode Base — affichés dans la timeline Pro.
      // 'ghost' reste supporté pour les lignes historiques (avant la séparation
      // bloqué/supprimé).
      const relationStmt = sqlite.prepare(
        `SELECT event_type, detected_at FROM timeline_events
         WHERE circle_member_id = ? AND event_type IN ('follow','unfollow','blocked','deleted','ghost','refollow')
         ORDER BY detected_at DESC LIMIT 20`
      );
      const RELATION_LABELS: Record<string, string> = {
        follow: 'Vous a suivi',
        unfollow: 'Vous a unfollow',
        blocked: 'Vous a bloqué',
        deleted: 'Compte supprimé ou désactivé',
        ghost: 'Est passé en ghost (bloqué/supprimé)',
        refollow: "S'est réabonné",
      };
      // Date de la 1ʳᵉ interaction (like ou commentaire) → durée de connexion.
      const firstInteractionStmt = sqlite.prepare(`
        SELECT MIN(t) AS first FROM (
          SELECT MIN(liked_at) AS t FROM liked_posts WHERE circle_member_id = ?
          UNION ALL
          SELECT MIN(detected_at) AS t FROM timeline_events WHERE circle_member_id = ? AND event_type = 'comment'
        )
      `);

      const stats = members.map((m) => {
        const likes = likesStmt.all(m.id) as any[];
        const comments = commentsStmt.all(m.id) as any[];
        const signals = [
          ...likes.map((l) => ({
            type: 'like' as const,
            timestamp: l.liked_at,
            description: 'A liké une de vos publications',
            postUrl: l.post_url || null,
          })),
          ...comments.map((c) => {
            let postUrl: string | null = null;
            let keyword: string | null = null;
            try {
              const parsed = JSON.parse(c.event_data || '{}');
              postUrl = parsed.postUrl || null;
              keyword = parsed.keyword || null;
            } catch {
              /* event_data non JSON */
            }
            return {
              type: 'comment' as const,
              timestamp: c.detected_at,
              // Commentaire mot-clé de campagne → libellé dédié (signal d'intention).
              description: keyword ? `A commenté le mot-clé « ${keyword} »` : 'A commenté une de vos publications',
              postUrl,
              keyword,
            };
          }),
          ...(relationStmt.all(m.id) as any[]).map((r) => ({
            type: r.event_type as 'follow' | 'unfollow' | 'blocked' | 'deleted' | 'ghost' | 'refollow',
            timestamp: r.detected_at,
            description: RELATION_LABELS[r.event_type] || r.event_type,
            postUrl: null,
            keyword: null as string | null,
          })),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Durée de connexion = jours écoulés depuis la 1ʳᵉ interaction détectée.
        const firstRow = firstInteractionStmt.get(m.id, m.id) as { first: string | null } | undefined;
        let connectionDays = 0;
        if (firstRow?.first) {
          const firstMs = new Date(firstRow.first).getTime();
          if (!isNaN(firstMs)) {
            connectionDays = Math.max(0, Math.floor((Date.now() - firstMs) / 86400000));
          }
        }

        // Séquence d'engagement (timeline streak avec ruptures) calculée par
        // /pro-engagement et stockée en JSON.
        let engagementPattern: any[] = [];
        try {
          const parsed = JSON.parse(m.engagement_pattern || '[]');
          if (Array.isArray(parsed)) engagementPattern = parsed;
        } catch {
          /* JSON invalide */
        }

        // Axe « température » (dynamique de conversation) issu de contact_scores.
        let dynamics: any = null;
        let advice: string[] = [];
        let settingSummary: any = null;
        try {
          if (m.dynamics) dynamics = JSON.parse(m.dynamics);
        } catch {
          /* JSON invalide */
        }
        try {
          const parsed = JSON.parse(m.advice || '[]');
          if (Array.isArray(parsed)) advice = parsed;
        } catch {
          /* JSON invalide */
        }
        try {
          if (m.setting_summary) settingSummary = JSON.parse(m.setting_summary);
        } catch {
          /* JSON invalide */
        }

        let mutualConnectionsList: string[] = [];
        try {
          const parsed = JSON.parse(m.mutual_followers_list || '[]');
          if (Array.isArray(parsed)) mutualConnectionsList = parsed;
        } catch {
          /* JSON invalide */
        }

        return {
          username: m.member_username,
          score: m.relationship_score ?? 0,
          totalLikesGiven: m.total_likes_given ?? 0,
          lastLikeGivenAt: m.last_like_given_at || null,
          mutualConnections: m.mutual_followers_count ?? 0,
          mutualConnectionsList,
          // null tant que non collecté → le dashboard conserve alors la valeur
          // saisie manuellement plutôt que de l'écraser.
          followsYou: m.follows_you === null || m.follows_you === undefined ? null : !!m.follows_you,
          youFollow: m.you_follow === null || m.you_follow === undefined ? null : !!m.you_follow,
          connectionDays,
          streak: m.consecutive_likes_streak ?? 0,
          keywordHits: m.keyword_hits ?? 0,
          engagementPattern,
          signals,
          temperature: m.temperature || null,
          dynamics,
          advice,
          settingPhase: m.setting_phase || null,
          settingSummary,
        };
      });

      sqlite.close();
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error("Circle stats error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Suggestions de People : engageurs récurrents (≥ 2 posts) pas encore suivis
  // et non ignorés. Alimenté par /api/extension/pro-engagement (engager_stats).
  app.get("/api/pro/people-suggestions", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // Multi-compte : on remonte les suggestions de TOUS les comptes Instagram
      // du login, chacune taguée avec son compte (accountId/accountUsername) pour
      // que le dashboard puisse les filtrer comme la grille People.
      const accounts = await getAccountsForOwner(ownerId);
      const usernameById = new Map<number, string>(
        accounts.map((a) => [a.id, a.username]),
      );
      const accountIds = accounts.map((a) => a.id);

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // La table peut ne pas exister si aucun run n'a eu lieu.
      let rows: any[] = [];
      try {
        const placeholders = accountIds.map(() => "?").join(",");
        rows = sqlite.prepare(`
          SELECT user_id, engager_username, posts_count, liked, commented
          FROM engager_stats es
          WHERE user_id IN (${placeholders})
            AND dismissed = 0
            AND posts_count >= 2
            AND engager_username NOT IN (
              SELECT LOWER(member_username) FROM circle_members WHERE user_id = es.user_id
            )
          ORDER BY posts_count DESC, last_seen_at DESC
          LIMIT 50
        `).all(...accountIds) as any[];
      } catch {
        /* table absente → aucune suggestion */
      }

      sqlite.close();

      const suggestions = rows.map((r) => ({
        username: r.engager_username,
        postsCount: r.posts_count,
        liked: !!r.liked,
        commented: !!r.commented,
        accountId: r.user_id,
        accountUsername: usernameById.get(r.user_id) ?? "",
      }));
      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("People suggestions error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Ignorer une suggestion de People.
  app.post("/api/pro/people-suggestions/dismiss", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) {
        return res.status(401).json({ message: "Non authentifié" });
      }
      const username = String(req.body?.username || "").trim().toLowerCase();
      if (!username) {
        return res.status(400).json({ message: "username requis" });
      }
      // La suggestion appartient à un compte précis (pas forcément l'actif) :
      // on cible ce compte après avoir vérifié qu'il fait partie du login.
      const accountId = Number(req.body?.accountId);
      const targetId =
        Number.isFinite(accountId) && (await isAccountOwnedBy(accountId, ownerId))
          ? accountId
          : getActiveAccount(req);
      if (!targetId) {
        return res.status(400).json({ message: "compte invalide" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);
      try {
        sqlite.prepare(
          `UPDATE engager_stats SET dismissed = 1 WHERE user_id = ? AND engager_username = ?`
        ).run(targetId, username);
      } catch {
        /* table absente */
      }
      sqlite.close();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Dismiss suggestion error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Verify missing followers (unfollowers not found on Instagram)
  app.post("/api/extension/verify-missing-followers", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { missingUsernames, unfollowedUsernames, blockedUsernames } = req.body;

      if (!Array.isArray(missingUsernames)) {
        return res.status(400).json({ message: "missingUsernames must be an array" });
      }

      // Sauvegarde PostgreSQL + émission des signaux Pro (timeline + score).
      if (pgPool) {
        // SQLite = signaux Pro (best-effort). Son ouverture ne doit JAMAIS bloquer
        // la sauvegarde Postgres (sur certains déploiements le FS/`moduleDir`
        // peut faire échouer `new Database()` → ça nuquait toute la sauvegarde).
        let sqlite: any = null;
        try {
          sqlite = new Database(path.join(moduleDir, "waler.db"));
        } catch (e: any) {
          console.error("⚠️ SQLite indisponible (signaux Pro ignorés, sauvegarde PG maintenue):", e?.message);
        }
        try {
          const saveLost = async (
            usernames: string[] | undefined,
            status: 'deleted' | 'blocked' | 'unfollowed',
            signalType: 'unfollow' | 'blocked' | 'deleted'
          ) => {
            if (!Array.isArray(usernames) || usernames.length === 0) return;
            let saved = 0;
            for (const username of usernames) {
              try {
                const prev = await pgPool.query(
                  `SELECT status, recovered_at FROM unfollowers WHERE user_id = $1 AND username = $2`,
                  [userId, username]
                );
                const row = prev.rows[0];
                const isNew = !row || row.recovered_at != null || row.status !== status;

                await pgPool.query(`
                  INSERT INTO unfollowers (user_id, username, status, detected_at)
                  VALUES ($1, $2, $3, NOW())
                  ON CONFLICT (user_id, username)
                  DO UPDATE SET
                    status = EXCLUDED.status,
                    -- PRÉSERVER la date d'origine d'un départ DÉJÀ enregistré : sinon
                    -- chaque ré-analyse repousse detected_at à aujourd'hui et décale
                    -- toutes les stats du dashboard. On ne re-date QUE si la personne
                    -- était revenue (recovered_at non nul) puis est repartie.
                    detected_at = CASE
                      WHEN unfollowers.recovered_at IS NOT NULL THEN NOW()
                      ELSE unfollowers.detected_at
                    END,
                    recovered_at = NULL
                `, [userId, username, status]);
                saved++;

                // Signal Pro best-effort : son échec ne doit pas faire échouer le save.
                if (isNew && sqlite) {
                  try {
                    emitRelationshipSignal(sqlite, userId, username, signalType);
                  } catch (sigErr: any) {
                    console.error(`Signal Pro échoué pour @${username}:`, sigErr?.message);
                  }
                }
              } catch (error) {
                console.error(`Error saving ${status} account @${username} to PostgreSQL:`, error);
              }
            }
            // Log le nombre RÉELLEMENT sauvé (et non la taille du lot) pour ne plus
            // masquer un échec silencieux.
            console.log(`✅ Saved ${saved}/${usernames.length} ${status} accounts to PostgreSQL`);
          };

          await saveLost(missingUsernames, 'deleted', 'deleted');
          await saveLost(blockedUsernames, 'blocked', 'blocked');
          await saveLost(unfollowedUsernames, 'unfollowed', 'unfollow');

          // ANTI-DÉRIVE (backend) : miroir de pruneFromDatabase côté extension.
          // La table `followers` est append-only — sans ce nettoyage, elle ne
          // reflète jamais les départs et gonfle indéfiniment (cause du
          // dashboard affichant un total AU-DESSUS du vrai compte Instagram,
          // ex. "221" alors que le compte réel est ~210). On retire les
          // comptes CONFIRMÉS non-followers (comparaison insensible à la casse,
          // les usernames peuvent différer en casse entre DOM/API).
          const toPrune = [
            ...(Array.isArray(unfollowedUsernames) ? unfollowedUsernames : []),
            ...(Array.isArray(blockedUsernames) ? blockedUsernames : []),
            ...(Array.isArray(missingUsernames) ? missingUsernames : []),
          ].map((u: string) => String(u).toLowerCase());
          if (toPrune.length > 0) {
            try {
              const pruneResult = await pgPool.query(
                `DELETE FROM followers WHERE user_id = $1 AND LOWER(username) = ANY($2::text[])`,
                [userId, toPrune]
              );
              console.log(`🧹 [Backend] ${pruneResult.rowCount ?? 0} compte(s) retiré(s) de followers (anti-dérive)`);
            } catch (e) {
              console.error("Error pruning followers table:", e);
            }
          }
        } finally {
          if (sqlite) {
            try { sqlite.close(); } catch { /* noop */ }
          }
        }
      }

      res.json({
        success: true,
        message: `Processed ${missingUsernames.length} missing followers`,
      });
    } catch (error: any) {
      console.error("Verify missing followers error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== CLASSIFICATION SYSTEM ROUTES ====================
  
  // Analyze contact and return score
  app.post("/api/extension/analyze-contact", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const sessionUserId = getActiveAccount(req);
      if (!sessionUserId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, scoreBreakdown, currentCategory, temperature, dynamics, advice, settingPhase, settingSummary, accountUsername } = req.body;

      if (!contactUsername || !scoreBreakdown) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Upsert contact score in database
      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // BUCKET du compte : `circle_members`/`contact_scores` sont clés par l'id
      // waler.db, qui DIFFÈRE de l'id Supabase `app_users` renvoyé par
      // getActiveAccount (collision d'ids entre les deux bases). Si l'extension
      // fournit le username Instagram du compte actif, on résout/crée le bucket
      // waler.db PAR USERNAME (comme les endpoints de lecture) — sinon le score
      // atterrit dans le mauvais seau et la carte People ne le voit jamais
      // (JOIN circle_members×contact_scores sur user_id). Repli legacy : session.
      const userId = accountUsername
        ? ensureWalerUserId(sqlite, accountUsername)
        : sessionUserId;

      // Axe « température » + coaching setting — colonnes ajoutées à la volée
      // pour les bases existantes (pas de migration séparée requise).
      for (const col of ['temperature TEXT', 'dynamics TEXT', 'advice TEXT', 'setting_phase TEXT', 'setting_summary TEXT']) {
        try {
          sqlite.prepare(`ALTER TABLE contact_scores ADD COLUMN ${col}`).run();
        } catch {
          /* colonne déjà existante */
        }
      }

      const temperatureVal = temperature ?? null;
      const dynamicsVal = dynamics ? JSON.stringify(dynamics) : null;
      const adviceVal = advice ? JSON.stringify(advice) : null;
      const settingPhaseVal = settingPhase ?? null;
      const settingSummaryVal = settingSummary ? JSON.stringify(settingSummary) : null;

      sqlite.prepare(`
        INSERT INTO contact_scores (
          user_id, contact_username, dm_score, engagement_score,
          activity_score, seniority_score, reciprocity_score, total_score,
          current_category, temperature, dynamics, advice, setting_phase, setting_summary, last_calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, contact_username) DO UPDATE SET
          dm_score = excluded.dm_score,
          engagement_score = excluded.engagement_score,
          activity_score = excluded.activity_score,
          seniority_score = excluded.seniority_score,
          reciprocity_score = excluded.reciprocity_score,
          total_score = excluded.total_score,
          current_category = excluded.current_category,
          temperature = excluded.temperature,
          dynamics = excluded.dynamics,
          advice = excluded.advice,
          setting_phase = excluded.setting_phase,
          setting_summary = excluded.setting_summary,
          last_calculated_at = datetime('now')
      `).run(
        userId,
        contactUsername,
        scoreBreakdown.dms,
        scoreBreakdown.engagement,
        scoreBreakdown.activity,
        scoreBreakdown.seniority,
        scoreBreakdown.reciprocity,
        scoreBreakdown.total,
        currentCategory || 'lead',
        temperatureVal,
        dynamicsVal,
        adviceVal,
        settingPhaseVal,
        settingSummaryVal
      );

      // Refléter le score dans circle_members (lu par la section Pro de
      // l'extension via GET /api/extension/people). No-op si le contact n'y est
      // pas. On ne touche pas à `category` (CHECK limité à cercle/prospect).
      sqlite.prepare(`
        UPDATE circle_members
        SET relationship_score = ?, updated_at = datetime('now')
        WHERE user_id = ? AND member_username = ?
      `).run(scoreBreakdown.total, userId, contactUsername);

      sqlite.close();

      console.log(`📊 Contact score updated: @${contactUsername} = ${scoreBreakdown.total}/100`);

      res.json({
        success: true,
        score: scoreBreakdown.total,
        breakdown: scoreBreakdown
      });
    } catch (error: any) {
      console.error("Analyze contact error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Renseigne le nom de profil (full_name) d'un People quand l'extension l'a
  // résolu depuis Instagram : l'ajout d'une personne ne saisit que l'id, donc
  // full_name reste null. On NE remplace PAS un nom déjà renseigné.
  app.post("/api/extension/contact-name", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, fullName } = req.body;
      if (!contactUsername || !fullName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);
      const result = sqlite.prepare(`
        UPDATE circle_members
        SET full_name = ?, updated_at = datetime('now')
        WHERE user_id = ? AND member_username = ?
          AND (full_name IS NULL OR full_name = '')
      `).run(fullName, userId, contactUsername);
      sqlite.close();

      console.log(`👤 Contact name ${result.changes ? 'set' : 'unchanged'}: @${contactUsername} → ${fullName}`);
      res.json({ success: true, updated: result.changes > 0 });
    } catch (error: any) {
      console.error("Set contact name error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Profil d'un People collecté par l'extension : uniquement les données qui
  // remplissent les stats de la fiche — connection status (follows-you / you-follow)
  // et connexions mutuelles (comptes en commun) — + nom/avatar. Étape « préparation
  // du profil » faite au 1er « Analyze » d'un nouveau People (ou via « Refresh
  // profile »). `profile_collected_at` distingue ensuite, côté popup, un nouveau
  // People (collecte d'abord) d'un People déjà préparé. Les mutuals sont écrites
  // dans les MÊMES colonnes que /pro-engagement (lues par /circle-stats).
  app.post("/api/extension/person-profile", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const {
        contactUsername,
        accountUsername,
        followsYou,
        youFollow,
        mutualConnections,
        mutualConnectionsList,
        fullName,
        profilePicUrl,
      } = req.body;

      if (!contactUsername) {
        return res.status(400).json({ message: "contactUsername required" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Cibler le bucket du compte concerné (l'id Supabase de session peut différer
      // de l'id waler.db) : accountUsername prioritaire, repli sur le compte actif.
      let userId = accountUsername
        ? ensureWalerUserId(sqlite, accountUsername)
        : getActiveAccount(req);
      if (!userId) {
        sqlite.close();
        return res.status(401).json({ message: "Non authentifié" });
      }

      // Colonnes utiles (best-effort : créées à la volée si absentes). Les colonnes
      // mutual_followers_* sont partagées avec /pro-engagement.
      const cols: Array<[string, string]> = [
        ["follows_you", "INTEGER"],
        ["you_follow", "INTEGER"],
        ["mutual_followers_count", "INTEGER"],
        ["mutual_followers_list", "TEXT"],
        ["profile_collected_at", "TEXT"],
      ];
      for (const [name, type] of cols) {
        try {
          sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN ${name} ${type}`).run();
        } catch {
          /* colonne déjà existante */
        }
      }

      const mutualList = Array.isArray(mutualConnectionsList) ? mutualConnectionsList : [];
      const mutualCount = Number.isFinite(mutualConnections)
        ? mutualConnections
        : mutualList.length;

      const result = sqlite.prepare(`
        UPDATE circle_members
        SET follows_you = ?,
            you_follow = ?,
            mutual_followers_count = ?,
            mutual_followers_list = ?,
            full_name = COALESCE(NULLIF(?, ''), full_name),
            profile_pic_url = COALESCE(NULLIF(?, ''), profile_pic_url),
            profile_collected_at = datetime('now'),
            updated_at = datetime('now')
        WHERE user_id = ? AND LOWER(member_username) = LOWER(?)
      `).run(
        followsYou ? 1 : 0,
        youFollow ? 1 : 0,
        mutualCount,
        JSON.stringify(mutualList),
        fullName || "",
        profilePicUrl || "",
        userId,
        contactUsername,
      );
      sqlite.close();

      console.log(
        `📇 Person profile ${result.changes ? "saved" : "no-op"}: @${contactUsername} ` +
          `(follows-you=${!!followsYou}, you-follow=${!!youFollow}, mutuals=${mutualCount})`,
      );
      res.json({ success: true, updated: result.changes > 0 });
    } catch (error: any) {
      console.error("Person profile error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Engagement Pro collecté par l'extension (likes + commentaires des People sur
  // les posts de l'utilisateur Pro). Remplace l'ancien agent Python Playwright
  // (agent_pro_circle.py) : on enregistre les posts likés + les commentaires en
  // timeline, on recalcule total_likes_given / last_like_given_at et le
  // relationship_score (logique portée de calculate_relationship_score).
  app.post("/api/extension/pro-engagement", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      if (!ownerId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { engagements, analyzedPosts, engagers, mutuals, partialLikePosts, partialCommentPosts, ownUsername } = req.body as {
        engagements?: Array<{
          username: string;
          likedPosts?: Array<{ postId: string; postUrl?: string; likedAt?: string }>;
          comments?: Array<{ postId: string; postUrl?: string; commentedAt?: string; keyword?: string }>;
        }>;
        analyzedPosts?: string[]; // ids des posts analysés, du + récent au + ancien
        engagers?: Array<{ username: string; posts: number; liked?: boolean; commented?: boolean }>;
        mutuals?: Array<{ username: string; count: number; members?: string[] }>;
        // Posts dont la liste des likers / des commentaires était TRONQUÉE (plafond
        // IG). Sur ces posts, ne pas avoir vu une People ne prouve PAS qu'elle n'a
        // pas interagi : on traite l'absence comme incertaine (ni rupture de streak,
        // ni gap de timeline).
        partialLikePosts?: string[];
        partialCommentPosts?: string[];
        ownUsername?: string; // compte (profil) réellement analysé par l'extension
      };

      // Attribuer l'engagement au compte RÉELLEMENT analysé (profil scanné), et
      // non au compte actif de la session : sinon, analyser @eth4n pendant que
      // @pako est actif ferait atterrir les suggestions sur @pako (mauvais compte).
      const analyzed = String(ownUsername || "").trim().toLowerCase().replace(/^@/, "");
      const ownerAccounts = await getAccountsForOwner(ownerId);
      const matchedAccount = analyzed
        ? ownerAccounts.find((a) => a.username.toLowerCase() === analyzed)
        : undefined;
      const userId = matchedAccount?.id ?? getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!Array.isArray(engagements)) {
        return res.status(400).json({ message: "engagements must be an array" });
      }
      const orderedPosts = Array.isArray(analyzedPosts) ? analyzedPosts : [];
      const engagerList = Array.isArray(engagers) ? engagers : [];
      // Posts à liste de likers OU de commentaires incomplète → l'absence d'une
      // People y est incertaine (like et commentaire concourent tous deux au
      // calcul "a interagi"). On unit les deux dimensions.
      const partialSet = new Set<string>([
        ...(Array.isArray(partialLikePosts) ? partialLikePosts : []),
        ...(Array.isArray(partialCommentPosts) ? partialCommentPosts : []),
      ]);
      // Map username (minuscule) → nb de connexions mutuelles + liste des comptes en commun.
      const mutualByUser = new Map<string, number>();
      const mutualMembersByUser = new Map<string, string[]>();
      if (Array.isArray(mutuals)) {
        for (const m of mutuals) {
          const u = String(m?.username || "").trim().toLowerCase();
          if (!u) continue;
          mutualByUser.set(u, Number(m.count) || 0);
          if (Array.isArray(m.members)) {
            mutualMembersByUser.set(u, m.members.map((x) => String(x).trim()).filter(Boolean));
          }
        }
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Colonne pour la séquence d'engagement (timeline streak avec ruptures).
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN engagement_pattern TEXT`).run();
      } catch {
        /* colonne déjà existante */
      }

      // Colonne de statut d'analyse (suivi par l'overlay « Analyse en cours »).
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN analysis_status TEXT DEFAULT 'pending'`).run();
      } catch {
        /* colonne déjà existante */
      }

      // Colonne pour la LISTE des comptes en commun (JSON), en plus du compteur.
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN mutual_followers_list TEXT`).run();
      } catch {
        /* colonne déjà existante */
      }

      // Compteur de commentaires « mot-clé » (campagne lead magnet) — alimente le
      // score (signal d'intention). Recalculé à chaque sync depuis timeline_events.
      try {
        sqlite.prepare(`ALTER TABLE circle_members ADD COLUMN keyword_hits INTEGER DEFAULT 0`).run();
      } catch {
        /* colonne déjà existante */
      }

      // Table des engageurs récurrents (suggestions de People).
      sqlite.prepare(`
        CREATE TABLE IF NOT EXISTS engager_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          engager_username TEXT NOT NULL,
          posts_count INTEGER DEFAULT 0,
          liked INTEGER DEFAULT 0,
          commented INTEGER DEFAULT 0,
          dismissed INTEGER DEFAULT 0,
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, engager_username)
        )
      `).run();
      const upsertEngager = sqlite.prepare(`
        INSERT INTO engager_stats (user_id, engager_username, posts_count, liked, commented, last_seen_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, engager_username) DO UPDATE SET
          posts_count = excluded.posts_count,
          liked = excluded.liked,
          commented = excluded.commented,
          last_seen_at = datetime('now')
      `);

      const findMember = sqlite.prepare(
        `SELECT id FROM circle_members WHERE user_id = ? AND member_username = ?`
      );
      const insertLike = sqlite.prepare(`
        INSERT OR IGNORE INTO liked_posts
          (circle_member_id, post_id, post_url, post_owner_username, liked_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertEvent = sqlite.prepare(`
        INSERT INTO timeline_events (circle_member_id, event_type, event_data, detected_at)
        VALUES (?, 'comment', ?, ?)
      `);
      // Évite de dupliquer un commentaire déjà enregistré (même post) à chaque run.
      const commentExists = sqlite.prepare(
        `SELECT 1 FROM timeline_events WHERE circle_member_id = ? AND event_type = 'comment' AND event_data LIKE ? LIMIT 1`
      );
      const updateLikeStats = sqlite.prepare(`
        UPDATE circle_members
        SET total_likes_given = (SELECT COUNT(*) FROM liked_posts WHERE circle_member_id = ?),
            last_like_given_at = (SELECT MAX(liked_at) FROM liked_posts WHERE circle_member_id = ?),
            updated_at = datetime('now')
        WHERE id = ?
      `);
      const updateStreak = sqlite.prepare(
        `UPDATE circle_members SET consecutive_likes_streak = ? WHERE id = ?`
      );
      const updatePattern = sqlite.prepare(
        `UPDATE circle_members SET engagement_pattern = ? WHERE id = ?`
      );
      const updateMutual = sqlite.prepare(
        `UPDATE circle_members SET mutual_followers_count = ? WHERE user_id = ? AND member_username = ?`
      );
      const updateMutualList = sqlite.prepare(
        `UPDATE circle_members SET mutual_followers_list = ? WHERE user_id = ? AND member_username = ?`
      );
      // Applique compteur + liste (si fournie) des connexions mutuelles d'un People.
      const applyMutual = (uname: string) => {
        const key = uname.toLowerCase();
        if (mutualByUser.has(key)) {
          updateMutual.run(mutualByUser.get(key), userId, uname);
          mutualByUser.delete(key);
        }
        if (mutualMembersByUser.has(key)) {
          updateMutualList.run(JSON.stringify(mutualMembersByUser.get(key)), userId, uname);
          mutualMembersByUser.delete(key);
        }
      };

      const results: Array<{ username: string; memberId?: number; likes: number; comments: number; streak?: number; score?: number }> = [];

      const run = sqlite.transaction(() => {
        for (const eng of engagements) {
          const username = (eng?.username || "").trim();
          if (!username) continue;

          const member = findMember.get(userId, username) as { id: number } | undefined;
          if (!member) {
            results.push({ username, likes: 0, comments: 0 });
            continue;
          }
          const memberId = member.id;

          let likes = 0;
          for (const p of eng.likedPosts || []) {
            if (!p?.postId) continue;
            insertLike.run(memberId, p.postId, p.postUrl || null, null, p.likedAt || new Date().toISOString());
            likes++;
          }

          let comments = 0;
          // Mot-clé de campagne détecté (en local par l'extension) par post → sert
          // aussi à annoter la timeline d'engagement plus bas.
          const keywordByPost = new Map<string, string>();
          for (const c of eng.comments || []) {
            if (!c?.postId) continue;
            const keyword = typeof c.keyword === "string" && c.keyword.trim() ? c.keyword.trim() : null;
            if (keyword) keywordByPost.set(c.postId, keyword);
            // Dédoublonnage : un seul événement "comment" par (membre, post).
            if (commentExists.get(memberId, `%"postId":"${c.postId}"%`)) continue;
            insertEvent.run(
              memberId,
              JSON.stringify({ postId: c.postId, postUrl: c.postUrl || null, keyword }),
              c.commentedAt || new Date().toISOString()
            );
            comments++;
          }

          updateLikeStats.run(memberId, memberId, memberId);

          // Recalcule le nombre de commentaires « mot-clé » (event_data porte une
          // clé "keyword" non nulle) → nourrit le score comme signal d'intention.
          const kwHits = (sqlite.prepare(
            `SELECT COUNT(*) AS n FROM timeline_events
             WHERE circle_member_id = ? AND event_type = 'comment'
               AND event_data LIKE '%"keyword":"%'`
          ).get(memberId) as { n: number }).n;
          sqlite.prepare(`UPDATE circle_members SET keyword_hits = ? WHERE id = ?`).run(kwHits, memberId);

          // Streak de présence : nombre de posts CONSÉCUTIFS (du + récent au +
          // ancien) où la personne a interagi (like OU commentaire), jusqu'au
          // premier post sans interaction. Nourrit le score (streak × 4, max 20).
          const interacted = new Set<string>([
            ...(eng.likedPosts || []).map((p) => p.postId),
            ...(eng.comments || []).map((c) => c.postId),
          ]);
          let streak = 0;
          for (const pid of orderedPosts) {
            if (interacted.has(pid)) streak++;
            // Post à liste de likers/commentaires tronquée sans interaction VUE :
            // on ne peut pas affirmer l'absence → on n'interrompt pas le streak
            // (mais on ne le crédite pas non plus, faute de preuve).
            else if (partialSet.has(pid)) continue;
            else break;
          }
          updateStreak.run(streak, memberId);

          // Séquence d'engagement pour la timeline (ligne verticale + ruptures) :
          // pour chaque post où la personne a interagi (ordre du + récent au +
          // ancien), on note le type (like/commentaire) et le nombre de posts
          // sautés avant lui (gapBefore > 0 = rupture du streak).
          const likedSet = new Set((eng.likedPosts || []).map((p) => p.postId));
          const commentSet = new Set((eng.comments || []).map((c) => c.postId));
          const urlById = new Map<string, string>();
          (eng.likedPosts || []).forEach((p) => p.postUrl && urlById.set(p.postId, p.postUrl));
          (eng.comments || []).forEach((c) => c.postUrl && urlById.set(c.postId, c.postUrl));
          const tsById = new Map<string, string>();
          (eng.likedPosts || []).forEach((p) => p.likedAt && tsById.set(p.postId, p.likedAt));
          (eng.comments || []).forEach((c) => {
            if (!tsById.has(c.postId) && c.commentedAt) tsById.set(c.postId, c.commentedAt);
          });

          const pattern: Array<any> = [];
          let gap = 0;
          for (const pid of orderedPosts) {
            const liked = likedSet.has(pid);
            const commented = commentSet.has(pid);
            if (liked || commented) {
              pattern.push({
                postId: pid,
                postUrl: urlById.get(pid) || `https://www.instagram.com/p/${pid}/`,
                liked,
                commented,
                // Mot-clé de campagne détecté dans le commentaire de ce post (si présent).
                keyword: keywordByPost.get(pid) || null,
                timestamp: tsById.get(pid) || null,
                gapBefore: gap,
              });
              gap = 0;
            } else if (partialSet.has(pid)) {
              // Liste des likers/commentaires incomplète : on ne compte PAS ce post
              // comme une rupture (une interaction a pu nous échapper) — gap inchangé.
            } else {
              gap++;
            }
          }
          updatePattern.run(JSON.stringify(pattern), memberId);

          // Connexions mutuelles (abonnements communs avec le Pro), si fournies.
          applyMutual(username);

          const score = computeRelationshipScore(sqlite, memberId);
          sqlite.prepare(`UPDATE circle_members SET relationship_score = ?, analysis_status = 'completed', updated_at = datetime('now') WHERE id = ?`).run(score, memberId);

          results.push({ username, memberId, likes, comments, streak, score });
        }

        // Connexions mutuelles non encore appliquées (People sans interaction ce
        // run mais dont les mutuelles ont été calculées). On part de l'union des
        // deux maps pour appliquer compteur ET liste.
        const leftover = new Set<string>(
          Array.from(mutualByUser.keys()).concat(Array.from(mutualMembersByUser.keys()))
        );
        leftover.forEach((uname) => applyMutual(uname));

        // Engageurs récurrents (suggestions de People).
        for (const e of engagerList) {
          const username = (e?.username || "").trim().toLowerCase();
          if (!username) continue;
          upsertEngager.run(userId, username, e.posts || 0, e.liked ? 1 : 0, e.commented ? 1 : 0);
        }
      });
      run();

      sqlite.close();

      console.log(`📊 Pro engagement reçu pour ${results.length} personne(s), ${engagerList.length} engageur(s) suggéré(s)`, results);
      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Pro engagement error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create classification suggestion
  app.post("/api/extension/suggest-transition", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, fromCategory, toCategory, score, confidence, reason, evidence } = req.body;

      if (!contactUsername || !fromCategory || !toCategory) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const result = sqlite.prepare(`
        INSERT INTO classification_suggestions (
          user_id, contact_username, from_category, to_category,
          score, confidence, reason, evidence, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).run(
        userId,
        contactUsername,
        fromCategory,
        toCategory,
        score,
        confidence,
        reason,
        JSON.stringify(evidence || [])
      );

      const suggestionId = result.lastInsertRowid;

      sqlite.close();

      console.log(`💡 Suggestion created: @${contactUsername} ${fromCategory} → ${toCategory} (ID: ${suggestionId})`);

      res.json({
        success: true,
        suggestionId,
        created: true
      });
    } catch (error: any) {
      console.error("Create suggestion error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Validate suggestion (accept or reject)
  app.post("/api/extension/validate-suggestion", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { suggestionId, action, reason } = req.body;

      if (!suggestionId || !action) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Get suggestion
      const suggestion = sqlite.prepare(`
        SELECT * FROM classification_suggestions 
        WHERE id = ? AND user_id = ?
      `).get(suggestionId, userId) as any;

      if (!suggestion) {
        sqlite.close();
        return res.status(404).json({ message: "Suggestion not found" });
      }

      if (action === 'accept') {
        // Update suggestion status
        sqlite.prepare(`
          UPDATE classification_suggestions 
          SET status = 'accepted', validated_at = datetime('now')
          WHERE id = ?
        `).run(suggestionId);

        // Update contact score category
        sqlite.prepare(`
          UPDATE contact_scores 
          SET current_category = ?, suggested_category = NULL
          WHERE user_id = ? AND contact_username = ?
        `).run(suggestion.to_category, userId, suggestion.contact_username);

        // Update circle_members if exists
        sqlite.prepare(`
          UPDATE circle_members 
          SET category_v2 = ?
          WHERE user_id = ? AND member_username = ?
        `).run(suggestion.to_category, userId, suggestion.contact_username);

        // Log transition
        sqlite.prepare(`
          INSERT INTO classification_history (
            user_id, contact_username, from_category, to_category,
            score_at_transition, trigger_type, created_at
          ) VALUES (?, ?, ?, ?, ?, 'auto_accepted', datetime('now'))
        `).run(
          userId,
          suggestion.contact_username,
          suggestion.from_category,
          suggestion.to_category,
          suggestion.score
        );

        sqlite.close();

        console.log(`✅ Suggestion ${suggestionId} accepted: @${suggestion.contact_username} → ${suggestion.to_category}`);

        res.json({
          success: true,
          newCategory: suggestion.to_category
        });
      } else if (action === 'reject') {
        // Update suggestion status
        sqlite.prepare(`
          UPDATE classification_suggestions 
          SET status = 'rejected', validated_at = datetime('now'), rejection_reason = ?
          WHERE id = ?
        `).run(reason || '', suggestionId);

        sqlite.close();

        console.log(`❌ Suggestion ${suggestionId} rejected`);

        res.json({ success: true });
      } else {
        sqlite.close();
        res.status(400).json({ message: "Invalid action" });
      }
    } catch (error: any) {
      console.error("Validate suggestion error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get pending suggestions
  app.get("/api/extension/pending-suggestions", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const suggestions = sqlite.prepare(`
        SELECT 
          s.*,
          cs.total_score as current_score
        FROM classification_suggestions s
        LEFT JOIN contact_scores cs ON s.user_id = cs.user_id AND s.contact_username = cs.contact_username
        WHERE s.user_id = ? AND s.status = 'pending'
        ORDER BY s.created_at DESC
      `).all(userId);

      sqlite.close();

      // Parse JSON fields
      const parsedSuggestions = suggestions.map((s: any) => ({
        ...s,
        evidence: JSON.parse(s.evidence || '[]')
      }));

      res.json({ suggestions: parsedSuggestions });
    } catch (error: any) {
      console.error("Get pending suggestions error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Log classification transition
  app.post("/api/extension/log-transition", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, fromCategory, toCategory, score, triggerType, notes } = req.body;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      sqlite.prepare(`
        INSERT INTO classification_history (
          user_id, contact_username, from_category, to_category,
          score_at_transition, trigger_type, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        userId,
        contactUsername,
        fromCategory || null,
        toCategory,
        score || null,
        triggerType,
        notes || null
      );

      sqlite.close();

      console.log(`📝 Transition logged: @${contactUsername} ${fromCategory} → ${toCategory}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Log transition error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== DM COLLECTION ROUTES ====================

  // Sync DMs from extension
  app.post("/api/extension/sync-dms", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { messages, conversations } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ message: "Invalid messages data" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      let insertedMessages = 0;
      let updatedConversations = 0;

      // Insérer les messages
      const insertMessage = sqlite.prepare(`
        INSERT INTO dm_messages (
          user_id, conversation_with, message_id, message_text,
          media_urls, is_sent, is_read, reactions, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
        ON CONFLICT(user_id, message_id) DO UPDATE SET
          is_read = excluded.is_read,
          reactions = excluded.reactions
      `);

      messages.forEach((msg: any) => {
        insertMessage.run(
          userId,
          msg.conversationWith,
          msg.messageId,
          encryptField(msg.text),
          encryptField(JSON.stringify(msg.mediaUrls || [])),
          msg.isSent ? 1 : 0,
          msg.isRead ? 1 : 0,
          JSON.stringify(msg.reactions || []),
          Math.floor(msg.timestamp / 1000)
        );
        insertedMessages++;
      });

      // Mettre à jour les conversations
      if (conversations && Array.isArray(conversations)) {
        const upsertConversation = sqlite.prepare(`
          INSERT INTO dm_conversations (
            user_id, conversation_with, full_name, avatar_url,
            is_verified, total_messages, unread_count, last_message_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
          ON CONFLICT(user_id, conversation_with) DO UPDATE SET
            full_name = excluded.full_name,
            avatar_url = excluded.avatar_url,
            total_messages = excluded.total_messages,
            unread_count = excluded.unread_count,
            last_message_at = excluded.last_message_at,
            updated_at = datetime('now')
        `);

        conversations.forEach((conv: any) => {
          upsertConversation.run(
            userId,
            conv.username,
            conv.fullName || null,
            conv.avatarUrl || null,
            conv.isVerified ? 1 : 0,
            conv.messageCount || 0,
            conv.unreadCount || 0,
            Math.floor(conv.lastMessageAt / 1000)
          );
          updatedConversations++;
        });
      }

      // Calculer les statistiques DMs
      sqlite.prepare(`
        INSERT OR REPLACE INTO dm_stats (
          user_id, contact_username, messages_sent, messages_received,
          total_messages, first_message_at, last_message_at, last_calculated_at
        )
        SELECT 
          user_id,
          conversation_with,
          SUM(CASE WHEN is_sent = 1 THEN 1 ELSE 0 END) as messages_sent,
          SUM(CASE WHEN is_sent = 0 THEN 1 ELSE 0 END) as messages_received,
          COUNT(*) as total_messages,
          MIN(sent_at) as first_message_at,
          MAX(sent_at) as last_message_at,
          datetime('now') as last_calculated_at
        FROM dm_messages
        WHERE user_id = ?
        GROUP BY conversation_with
      `).run(userId);

      sqlite.close();

      console.log(`💬 DMs synced: ${insertedMessages} messages, ${updatedConversations} conversations`);

      res.json({
        success: true,
        insertedMessages,
        updatedConversations
      });
    } catch (error: any) {
      console.error("Sync DMs error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get DM conversations
  app.get("/api/extension/dm-conversations", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const conversations = (sqlite.prepare(`
        SELECT * FROM v_recent_conversations
        WHERE user_id = ?
        ORDER BY last_message_at DESC
        LIMIT 50
      `).all(userId) as any[]).map((c) => ({
        ...c,
        last_message_text: decryptField(c.last_message_text),
      }));

      sqlite.close();

      res.json({ conversations });
    } catch (error: any) {
      console.error("Get DM conversations error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get full stored DM history for a contact (chronological order).
  // Utilisé par le collector Pro : frontière du scroll incrémental + base de
  // fusion pour que l'analyse porte sur toute la conversation.
  app.get("/api/extension/dm-history/:username", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { username } = req.params;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const rows = sqlite.prepare(`
        SELECT message_id, message_text, is_sent, reactions,
               CAST(strftime('%s', sent_at) AS INTEGER) AS sent_epoch
        FROM dm_messages
        WHERE user_id = ? AND conversation_with = ?
        ORDER BY sent_at ASC, id ASC
      `).all(userId, username) as any[];

      sqlite.close();

      const messages = rows.map((r) => ({
        messageId: r.message_id,
        text: decryptField(r.message_text),
        isSent: !!r.is_sent,
        timestamp: r.sent_epoch ? r.sent_epoch * 1000 : null,
        reactions: r.reactions ? JSON.parse(r.reactions) : [],
      }));

      res.json({ messages });
    } catch (error: any) {
      console.error("Get DM history error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get DM stats for a contact
  app.get("/api/extension/dm-stats/:username", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { username } = req.params;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const stats = sqlite.prepare(`
        SELECT * FROM dm_stats
        WHERE user_id = ? AND contact_username = ?
      `).get(userId, username);

      const messages = (sqlite.prepare(`
        SELECT * FROM dm_messages
        WHERE user_id = ? AND conversation_with = ?
        ORDER BY sent_at DESC
        LIMIT 100
      `).all(userId, username) as any[]).map(decryptMessageRow);

      sqlite.close();

      res.json({
        stats: stats || null,
        messages: messages || []
      });
    } catch (error: any) {
      console.error("Get DM stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== CLASSIFICATION DASHBOARD ROUTES ====================

  // Get dashboard stats
  app.get("/api/classification/dashboard-stats", requireAuth, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Pending suggestions
      const pendingSuggestions = sqlite.prepare(`
        SELECT COUNT(*) as count FROM classification_suggestions
        WHERE user_id = ? AND status = 'pending'
      `).get(userId) as any;

      // Accepted today
      const acceptedToday = sqlite.prepare(`
        SELECT COUNT(*) as count FROM classification_suggestions
        WHERE user_id = ? AND status = 'accepted' 
        AND DATE(validated_at) = DATE('now')
      `).get(userId) as any;

      // Total contacts
      const totalContacts = sqlite.prepare(`
        SELECT COUNT(*) as count, AVG(total_score) as avgScore 
        FROM contact_scores
        WHERE user_id = ?
      `).get(userId) as any;

      // DM conversations
      const dmConversations = sqlite.prepare(`
        SELECT 
          COUNT(*) as count,
          SUM(total_messages) as totalMessages
        FROM dm_conversations
        WHERE user_id = ?
      `).get(userId) as any;

      sqlite.close();

      res.json({
        pendingSuggestions: pendingSuggestions?.count || 0,
        acceptedToday: acceptedToday?.count || 0,
        totalContacts: totalContacts?.count || 0,
        avgScore: Math.round(totalContacts?.avgScore || 0),
        dmConversations: dmConversations?.count || 0,
        messagesAnalyzed: dmConversations?.totalMessages || 0
      });
    } catch (error: any) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get all suggestions
  app.get("/api/classification/suggestions", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const suggestions = sqlite.prepare(`
        SELECT 
          s.*,
          cs.total_score as current_score
        FROM classification_suggestions s
        LEFT JOIN contact_scores cs ON s.user_id = cs.user_id AND s.contact_username = cs.contact_username
        WHERE s.user_id = ? AND s.status = 'pending'
        ORDER BY s.created_at DESC
      `).all(userId);

      sqlite.close();

      res.json({ suggestions });
    } catch (error: any) {
      console.error("Get suggestions error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Validate suggestion (for dashboard)
  app.post("/api/classification/validate-suggestion", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { suggestionId, action, reason } = req.body;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const suggestion = sqlite.prepare(`
        SELECT * FROM classification_suggestions 
        WHERE id = ? AND user_id = ?
      `).get(suggestionId, userId) as any;

      if (!suggestion) {
        sqlite.close();
        return res.status(404).json({ message: "Suggestion not found" });
      }

      if (action === 'accept') {
        sqlite.prepare(`
          UPDATE classification_suggestions 
          SET status = 'accepted', validated_at = datetime('now')
          WHERE id = ?
        `).run(suggestionId);

        sqlite.prepare(`
          UPDATE contact_scores 
          SET current_category = ?
          WHERE user_id = ? AND contact_username = ?
        `).run(suggestion.to_category, userId, suggestion.contact_username);

        sqlite.prepare(`
          INSERT INTO classification_history (
            user_id, contact_username, from_category, to_category,
            score_at_transition, trigger_type, created_at
          ) VALUES (?, ?, ?, ?, ?, 'auto_accepted', datetime('now'))
        `).run(
          userId,
          suggestion.contact_username,
          suggestion.from_category,
          suggestion.to_category,
          suggestion.score
        );

        sqlite.close();
        res.json({ success: true });
      } else if (action === 'reject') {
        sqlite.prepare(`
          UPDATE classification_suggestions 
          SET status = 'rejected', validated_at = datetime('now'), rejection_reason = ?
          WHERE id = ?
        `).run(reason || '', suggestionId);

        sqlite.close();
        res.json({ success: true });
      } else {
        sqlite.close();
        res.status(400).json({ message: "Invalid action" });
      }
    } catch (error: any) {
      console.error("Validate suggestion error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get contact scores
  app.get("/api/classification/contact-scores", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const scores = sqlite.prepare(`
        SELECT * FROM contact_scores
        WHERE user_id = ?
        ORDER BY total_score DESC
        LIMIT 100
      `).all(userId);

      sqlite.close();

      res.json({ scores });
    } catch (error: any) {
      console.error("Get contact scores error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get classification stats
  app.get("/api/classification/stats", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Category distribution
      const categoryDistribution = sqlite.prepare(`
        SELECT current_category as category, COUNT(*) as count
        FROM contact_scores
        WHERE user_id = ?
        GROUP BY current_category
      `).all(userId);

      // Transition history (last 30 days)
      const transitionHistory = sqlite.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM classification_history
        WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `).all(userId);

      // Acceptance rate
      const acceptanceStats = sqlite.prepare(`
        SELECT 
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          COUNT(*) as total
        FROM classification_suggestions
        WHERE user_id = ? AND status IN ('accepted', 'rejected')
      `).get(userId) as any;

      const acceptanceRate = acceptanceStats?.total > 0
        ? (acceptanceStats.accepted / acceptanceStats.total) * 100
        : 0;

      // Average score by category
      const avgScoreByCategory = sqlite.prepare(`
        SELECT current_category as category, AVG(total_score) as avgScore
        FROM contact_scores
        WHERE user_id = ?
        GROUP BY current_category
      `).all(userId);

      // Total transitions
      const totalTransitions = sqlite.prepare(`
        SELECT COUNT(*) as count FROM classification_history
        WHERE user_id = ?
      `).get(userId) as any;

      sqlite.close();

      res.json({
        categoryDistribution,
        transitionHistory,
        acceptanceRate,
        totalTransitions: totalTransitions?.count || 0,
        avgScoreByCategory
      });
    } catch (error: any) {
      console.error("Get classification stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get DM conversations (for dashboard)
  app.get("/api/classification/dm-conversations", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const conversations = (sqlite.prepare(`
        SELECT * FROM v_recent_conversations
        WHERE user_id = ?
        ORDER BY last_message_at DESC
        LIMIT 50
      `).all(userId) as any[]).map((c) => ({
        ...c,
        last_message_text: decryptField(c.last_message_text),
      }));

      sqlite.close();

      res.json({ conversations });
    } catch (error: any) {
      console.error("Get DM conversations error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== PRIVACY & SECURITY ROUTES ====================

  // Get privacy data overview
  app.get("/api/classification/privacy-data", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const dmCount = sqlite.prepare(`
        SELECT COUNT(*) as count FROM dm_messages WHERE user_id = ?
      `).get(userId) as any;

      const conversationCount = sqlite.prepare(`
        SELECT COUNT(*) as count FROM dm_conversations WHERE user_id = ?
      `).get(userId) as any;

      const scoreCount = sqlite.prepare(`
        SELECT COUNT(*) as count FROM contact_scores WHERE user_id = ?
      `).get(userId) as any;

      // Calculer la taille approximative
      const totalSize = (dmCount?.count || 0) * 500 + (conversationCount?.count || 0) * 200;
      const sizeKB = Math.round(totalSize / 1024);

      sqlite.close();

      res.json({
        dmCount: dmCount?.count || 0,
        conversationCount: conversationCount?.count || 0,
        scoreCount: scoreCount?.count || 0,
        totalSize: sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
        encryptionEnabled: true,
      });
    } catch (error: any) {
      console.error("Get privacy data error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get privacy settings
  app.get("/api/classification/privacy-settings", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Créer table si n'existe pas
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS privacy_settings (
          user_id INTEGER PRIMARY KEY,
          dm_collection BOOLEAN DEFAULT 1,
          score_calculation BOOLEAN DEFAULT 1,
          data_storage BOOLEAN DEFAULT 1,
          analytics BOOLEAN DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      let settings = sqlite.prepare(`
        SELECT * FROM privacy_settings WHERE user_id = ?
      `).get(userId) as any;

      if (!settings) {
        // Créer paramètres par défaut
        sqlite.prepare(`
          INSERT INTO privacy_settings (user_id) VALUES (?)
        `).run(userId);

        settings = {
          dm_collection: 1,
          score_calculation: 1,
          data_storage: 1,
          analytics: 0,
        };
      }

      sqlite.close();

      res.json({
        dmCollection: Boolean(settings.dm_collection),
        scoreCalculation: Boolean(settings.score_calculation),
        dataStorage: Boolean(settings.data_storage),
        analytics: Boolean(settings.analytics),
      });
    } catch (error: any) {
      console.error("Get privacy settings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update privacy settings
  app.post("/api/classification/privacy-settings", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { dmCollection, scoreCalculation, dataStorage, analytics } = req.body;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      sqlite.prepare(`
        INSERT INTO privacy_settings (
          user_id, dm_collection, score_calculation, data_storage, analytics, updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          dm_collection = COALESCE(?, dm_collection),
          score_calculation = COALESCE(?, score_calculation),
          data_storage = COALESCE(?, data_storage),
          analytics = COALESCE(?, analytics),
          updated_at = datetime('now')
      `).run(
        userId,
        dmCollection !== undefined ? (dmCollection ? 1 : 0) : null,
        scoreCalculation !== undefined ? (scoreCalculation ? 1 : 0) : null,
        dataStorage !== undefined ? (dataStorage ? 1 : 0) : null,
        analytics !== undefined ? (analytics ? 1 : 0) : null,
        dmCollection !== undefined ? (dmCollection ? 1 : 0) : null,
        scoreCalculation !== undefined ? (scoreCalculation ? 1 : 0) : null,
        dataStorage !== undefined ? (dataStorage ? 1 : 0) : null,
        analytics !== undefined ? (analytics ? 1 : 0) : null
      );

      sqlite.close();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update privacy settings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export user data (RGPD)
  app.get("/api/classification/export-data", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Collecter toutes les données (déchiffrées pour la portabilité RGPD)
      const messages = (sqlite.prepare(`
        SELECT * FROM dm_messages WHERE user_id = ?
      `).all(userId) as any[]).map(decryptMessageRow);

      const conversations = sqlite.prepare(`
        SELECT * FROM dm_conversations WHERE user_id = ?
      `).all(userId);

      const scores = sqlite.prepare(`
        SELECT * FROM contact_scores WHERE user_id = ?
      `).all(userId);

      const suggestions = sqlite.prepare(`
        SELECT * FROM classification_suggestions WHERE user_id = ?
      `).all(userId);

      const history = sqlite.prepare(`
        SELECT * FROM classification_history WHERE user_id = ?
      `).all(userId);

      sqlite.close();

      const exportData = {
        exportDate: new Date().toISOString(),
        userId,
        data: {
          messages,
          conversations,
          scores,
          suggestions,
          history,
        },
        metadata: {
          messageCount: messages.length,
          conversationCount: conversations.length,
          scoreCount: scores.length,
        },
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="waler-data-${userId}-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error: any) {
      console.error("Export data error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete all user data (RGPD)
  app.delete("/api/classification/delete-data", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Supprimer toutes les données
      sqlite.prepare(`DELETE FROM dm_messages WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM dm_conversations WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM dm_stats WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM contact_scores WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM classification_suggestions WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM classification_history WHERE user_id = ?`).run(userId);
      sqlite.prepare(`DELETE FROM privacy_settings WHERE user_id = ?`).run(userId);

      sqlite.close();

      console.log(`🗑️ All data deleted for user ${userId}`);

      res.json({ success: true, message: "Toutes vos données ont été supprimées" });
    } catch (error: any) {
      console.error("Delete data error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SURVEILLANCE ROUTES ====================

  // Get surveillance configuration for all contacts
  app.get("/api/surveillance/config", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const configs = sqlite.prepare(`
        SELECT * FROM surveillance_config
        WHERE user_id = ? AND is_active = 1
        ORDER BY priority ASC, next_check_at ASC
      `).all(userId);

      sqlite.close();

      res.json({ configs });
    } catch (error: any) {
      console.error("Get surveillance config error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get contacts to check now (by priority)
  app.get("/api/surveillance/to-check", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const contacts = sqlite.prepare(`
        SELECT * FROM v_contacts_to_check
        WHERE user_id = ? AND should_check_now = 1
        ORDER BY priority ASC
        LIMIT 50
      `).all(userId);

      sqlite.close();

      res.json({ contacts });
    } catch (error: any) {
      console.error("Get contacts to check error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update surveillance configuration
  app.post("/api/surveillance/config", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, category, checkInterval, priority } = req.body;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Calculer next_check_at
      const nextCheckAt = new Date(Date.now() + checkInterval * 60 * 1000).toISOString();

      sqlite.prepare(`
        INSERT INTO surveillance_config (
          user_id, contact_username, category, check_interval, priority, next_check_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, contact_username) DO UPDATE SET
          category = ?,
          check_interval = ?,
          priority = ?,
          next_check_at = ?,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        userId, contactUsername, category, checkInterval, priority, nextCheckAt,
        category, checkInterval, priority, nextCheckAt
      );

      sqlite.close();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update surveillance config error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Record surveillance check
  app.post("/api/surveillance/record-check", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername, category, status, changesDetected, details, durationMs } = req.body;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      sqlite.prepare(`
        INSERT INTO surveillance_history (
          user_id, contact_username, category, check_type, status, 
          changes_detected, details, duration_ms
        ) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?)
      `).run(
        userId, contactUsername, category, status,
        changesDetected || 0, details ? JSON.stringify(details) : null, durationMs || 0
      );

      sqlite.close();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Record surveillance check error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get surveillance alerts
  app.get("/api/surveillance/alerts", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const alerts = sqlite.prepare(`
        SELECT * FROM v_unread_alerts
        WHERE user_id = ?
        LIMIT 50
      `).all(userId);

      sqlite.close();

      res.json({ alerts });
    } catch (error: any) {
      console.error("Get surveillance alerts error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Mark alert as read
  app.post("/api/surveillance/alerts/:alertId/read", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { alertId } = req.params;

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      sqlite.prepare(`
        UPDATE surveillance_alerts
        SET is_read = 1
        WHERE id = ? AND user_id = ?
      `).run(alertId, userId);

      sqlite.close();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark alert as read error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get surveillance statistics
  app.get("/api/surveillance/stats", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      const statsByCategory = sqlite.prepare(`
        SELECT * FROM v_surveillance_stats_by_category
        WHERE user_id = ?
      `).all(userId);

      const trends = sqlite.prepare(`
        SELECT * FROM v_surveillance_trends
        WHERE user_id = ?
        ORDER BY total_changes DESC
        LIMIT 10
      `).all(userId);

      const totalAlerts = sqlite.prepare(`
        SELECT COUNT(*) as count FROM surveillance_alerts
        WHERE user_id = ? AND is_read = 0
      `).get(userId) as any;

      sqlite.close();

      res.json({
        byCategory: statsByCategory,
        trends,
        unreadAlerts: totalAlerts?.count || 0,
      });
    } catch (error: any) {
      console.error("Get surveillance stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Sync surveillance with classification
  app.post("/api/surveillance/sync-with-classification", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUser(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Récupérer tous les contacts avec scores
      const contacts = sqlite.prepare(`
        SELECT contact_username, current_category FROM contact_scores
        WHERE user_id = ?
      `).all(userId) as any[];

      // Créer/mettre à jour la config de surveillance pour chaque contact
      for (const contact of contacts) {
        const intervals: Record<string, number> = {
          'client': 15,
          'prospect': 60,
          'network': 240,
          'lead': 1440,
        };

        const priorities: Record<string, number> = {
          'client': 1,
          'prospect': 2,
          'network': 3,
          'lead': 4,
        };

        const checkInterval = intervals[contact.current_category] || 1440;
        const priority = priorities[contact.current_category] || 4;
        const nextCheckAt = new Date(Date.now() + checkInterval * 60 * 1000).toISOString();

        sqlite.prepare(`
          INSERT INTO surveillance_config (
            user_id, contact_username, category, check_interval, priority, next_check_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, contact_username) DO UPDATE SET
            category = ?,
            check_interval = ?,
            priority = ?,
            next_check_at = ?,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          userId, contact.contact_username, contact.current_category, checkInterval, priority, nextCheckAt,
          contact.current_category, checkInterval, priority, nextCheckAt
        );
      }

      sqlite.close();

      res.json({ 
        success: true, 
        synced: contacts.length,
        message: `Surveillance configurée pour ${contacts.length} contacts`
      });
    } catch (error: any) {
      console.error("Sync surveillance error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze DMs and trigger classification
  app.post("/api/extension/analyze-dms", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const { contactUsername } = req.body;

      if (!contactUsername) {
        return res.status(400).json({ message: "Missing contact username" });
      }

      const dbPath = path.join(moduleDir, "waler.db");
      const sqlite = new Database(dbPath);

      // Récupérer les messages (déchiffrés pour l'analyse de scoring)
      const messages = (sqlite.prepare(`
        SELECT * FROM dm_messages
        WHERE user_id = ? AND conversation_with = ?
        ORDER BY sent_at ASC
      `).all(userId, contactUsername) as any[]).map(decryptMessageRow);

      // Récupérer les stats
      const stats = sqlite.prepare(`
        SELECT * FROM dm_stats
        WHERE user_id = ? AND contact_username = ?
      `).get(userId, contactUsername) as any;

      sqlite.close();

      // Calculer le score DMs basé sur les statistiques
      let dmScore = 0;

      if (stats) {
        // Fréquence des messages (0-5 points)
        const messageFrequency = Math.min(Math.floor(stats.total_messages / 5), 5);

        // Temps de réponse (0-5 points)
        let responseTimeScore = 0;
        if (stats.avg_response_time_received_minutes < 60) responseTimeScore = 5;
        else if (stats.avg_response_time_received_minutes < 360) responseTimeScore = 4;
        else if (stats.avg_response_time_received_minutes < 1440) responseTimeScore = 3;
        else if (stats.avg_response_time_received_minutes < 2880) responseTimeScore = 2;
        else responseTimeScore = 1;

        // Initiateur (0-5 points)
        const initiatorScore = Math.min(
          Math.floor(stats.conversations_initiated_by_contact / 2),
          5
        );

        // Longueur des messages (0-5 points)
        let lengthScore = 0;
        if (stats.avg_message_length_received > 200) lengthScore = 5;
        else if (stats.avg_message_length_received > 100) lengthScore = 4;
        else if (stats.avg_message_length_received > 50) lengthScore = 3;
        else if (stats.avg_message_length_received > 20) lengthScore = 2;
        else lengthScore = 1;

        // Note: Les mots-clés (0-10 points) sont analysés côté extension
        // Ici on calcule seulement les métriques quantitatives

        dmScore = messageFrequency + responseTimeScore + initiatorScore + lengthScore;
      }

      res.json({
        success: true,
        dmScore,
        messageCount: messages.length,
        stats
      });
    } catch (error: any) {
      console.error("Analyze DMs error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== UNFOLLOWERS API ROUTES ====================

  // Get unfollowers (simple unfollows only)
  app.get("/api/unfollowers", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);
      const reqAccountId = Number(req.query.accountId);
      if (ownerId && reqAccountId && (await isAccountOwnedBy(reqAccountId, ownerId))) {
        userId = reqAccountId;
      }
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      const result = await pgPool.query(`
        SELECT id, username, avatar_url, status, detected_at, verified_at, recovered_at
        FROM unfollowers
        WHERE user_id = $1 AND status = 'unfollowed'
        ORDER BY detected_at DESC
      `, [userId]);

      // Convertir snake_case en camelCase
      const unfollowers = result.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        avatarUrl: row.avatar_url,
        status: row.status,
        detectedAt: row.detected_at,
        verifiedAt: row.verified_at,
        recoveredAt: row.recovered_at
      }));

      res.json({ unfollowers });
    } catch (error: any) {
      console.error("Get unfollowers error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get ghost followers (blocked + deleted)
  app.get("/api/ghost-followers", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);
      const reqAccountId = Number(req.query.accountId);
      if (ownerId && reqAccountId && (await isAccountOwnedBy(reqAccountId, ownerId))) {
        userId = reqAccountId;
      }
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      const result = await pgPool.query(`
        SELECT id, username, avatar_url, status, detected_at, verified_at, recovered_at
        FROM unfollowers
        WHERE user_id = $1 AND status IN ('blocked', 'deleted')
        ORDER BY detected_at DESC
      `, [userId]);

      // Convertir snake_case en camelCase
      const ghostFollowers = result.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        avatarUrl: row.avatar_url,
        status: row.status,
        detectedAt: row.detected_at,
        verifiedAt: row.verified_at,
        recoveredAt: row.recovered_at
      }));

      res.json({ ghostFollowers });
    } catch (error: any) {
      console.error("Get ghost followers error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Check if an unfollower is unlocked
  app.get("/api/unfollowers/:unfollowerId/unlocked", requireAuth, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      const unfollowerId = parseInt(String(req.params.unfollowerId));
      const result = await pgPool.query(`
        SELECT id FROM unlocked_unfollowers
        WHERE user_id = $1 AND unfollower_id = $2
      `, [userId, unfollowerId]);

      res.json({ unlocked: result.rows.length > 0 });
    } catch (error: any) {
      console.error("Check unlocked error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Unlock an unfollower (after completing questionnaire)
  app.post("/api/unfollowers/:unfollowerId/unlock", requireAuth, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      const unfollowerId = parseInt(String(req.params.unfollowerId));
      
      // Insert or ignore if already unlocked
      await pgPool.query(`
        INSERT INTO unlocked_unfollowers (user_id, unfollower_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, unfollower_id) DO NOTHING
      `, [userId, unfollowerId]);

      res.json({ success: true, message: "Compte débloqué" });
    } catch (error: any) {
      console.error("Unlock unfollower error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get all unlocked unfollowers for a user
  app.get("/api/unfollowers/unlocked/list", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);
      const reqAccountId = Number(req.query.accountId);
      if (ownerId && reqAccountId && (await isAccountOwnedBy(reqAccountId, ownerId))) {
        userId = reqAccountId;
      }
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      const result = await pgPool.query(`
        SELECT unfollower_id FROM unlocked_unfollowers
        WHERE user_id = $1
      `, [userId]);

      const unlockedIds = result.rows.map((row: any) => row.unfollower_id);
      res.json({ unlockedIds });
    } catch (error: any) {
      console.error("Get unlocked list error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Unlock ALL unfollowers for a user (after completing Your Circle questionnaire)
  app.post("/api/unfollowers/unlock-all", requireAuth, async (req, res) => {
    try {
      const userId = getActiveAccount(req);
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      // Get all unfollower IDs for this user
      const unfollowersResult = await pgPool.query(`
        SELECT id FROM unfollowers
        WHERE user_id = $1
      `, [userId]);

      // Insert all unfollower IDs into unlocked_unfollowers
      const values = unfollowersResult.rows.map((row: any) => `(${userId}, ${row.id})`).join(',');
      
      if (values) {
        await pgPool.query(`
          INSERT INTO unlocked_unfollowers (user_id, unfollower_id)
          VALUES ${values}
          ON CONFLICT (user_id, unfollower_id) DO NOTHING
        `);
      }

      res.json({ 
        success: true, 
        message: "Tous les comptes débloqués",
        count: unfollowersResult.rows.length
      });
    } catch (error: any) {
      console.error("Unlock all unfollowers error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get unfollower stats
  app.get("/api/unfollowers/stats", requireAuth, async (req, res) => {
    try {
      const ownerId = getCurrentUser(req);
      let userId = getActiveAccount(req);
      const reqAccountId = Number(req.query.accountId);
      if (ownerId && reqAccountId && (await isAccountOwnedBy(reqAccountId, ownerId))) {
        userId = reqAccountId;
      }
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      if (!pgPool) {
        return res.status(500).json({ message: "Database pool not available" });
      }

      // Les comptes « réabonnés » (recovered_at non nul) restent affichés dans les
      // listes mais sont exclus des compteurs.
      const result = await pgPool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'unfollowed') as unfollowed_count,
          COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
          COUNT(*) FILTER (WHERE status = 'deleted') as deleted_count,
          COUNT(*) as total_count
        FROM unfollowers
        WHERE user_id = $1 AND recovered_at IS NULL
      `, [userId]);

      const stats = result.rows[0];

      res.json({
        unfollowed: parseInt(stats.unfollowed_count) || 0,
        blocked: parseInt(stats.blocked_count) || 0,
        deleted: parseInt(stats.deleted_count) || 0,
        ghost: (parseInt(stats.blocked_count) || 0) + (parseInt(stats.deleted_count) || 0),
        total: parseInt(stats.total_count) || 0
      });
    } catch (error: any) {
      console.error("Get unfollower stats error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}

async function seedMockData(userId: number) {
  const names = ["thomas_95", "marie_photo", "alex_dev", "julia_art", "kevin_fit", "sophie_travel", "lucas_music", "emma_cook", "noah_sport", "lea_mode"];
  const now = new Date();

  for (let i = 0; i < 10; i++) {
    const detectedAt = new Date(now.getFullYear(), now.getMonth(), Math.floor(Math.random() * 28) + 1);
    await storage.createUnfollower({
      userId,
      username: names[i],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${names[i]}`,
    });
  }

  const followerNames = ["camille_b", "pierre_v", "sarah_m", "antoine_r", "chloe_d", "maxime_l", "ines_p", "romain_g"];
  for (let i = 0; i < 8; i++) {
    await storage.createFollower({
      userId,
      username: followerNames[i],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${followerNames[i]}`,
    });
  }

  const blockerNames = ["ghost_user_1", "deleted_acc", "block_me_99", "vanished_x"];
  for (let i = 0; i < 4; i++) {
    await storage.createBlocker({
      userId,
      username: blockerNames[i],
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${blockerNames[i]}`,
      type: i < 2 ? "blocker" : "disappeared",
    });
  }
}
