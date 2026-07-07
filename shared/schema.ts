import { pgTable, text, integer, boolean, timestamp, serial, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("app_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(), // @username Instagram
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Multi-compte : un login (owner) possède plusieurs comptes Instagram.
  // ownerId = null pour le login principal (créé à l'inscription), sinon id du login owner.
  ownerId: integer("owner_id"),
  // Multi-compte : dernier compte Instagram actif choisi par ce login owner.
  // Restauré en session à la connexion pour éviter de retomber sur le compte
  // owner par défaut après une déconnexion/reconnexion (perte apparente des
  // données scopées au compte, ex: mots-clés de campagne).
  lastActiveAccountId: integer("last_active_account_id"),
  instagramUserId: text("instagram_user_id"), // ds_user_id Instagram (dédoublonne un compte lié)
  platform: text("platform").notNull().default("instagram"), // Always 'instagram'
  avatarUrl: text("avatar_url"),
  isConnected: boolean("is_connected").default(true),
  isVerified: boolean("is_verified").default(false),
  verificationCode: text("verification_code"), // "VERIFY-ABC123-@username"
  verificationToken: text("verification_token"), // Code à 6 chiffres
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  verificationAttempts: integer("verification_attempts").default(0),
  subscriptionTier: text("subscription_tier"), // 'premium' or 'pro'
  subscriptionStatus: text("subscription_status"), // 'active', 'trialing', 'past_due', 'cancelled', 'expired'
  trialEndsAt: timestamp("trial_ends_at"),
  // Billing (Stripe). Source of truth for subscription state — the separate
  // `subscriptions`/`plans` tables below are NOT provisioned in the live DB,
  // so checkout/webhooks read and write these columns directly instead.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingPeriod: text("billing_period"), // 'monthly' or 'yearly'
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  // Analysis data
  followersCount: integer("followers_count"),
  followingCount: integer("following_count"),
  postsCount: integer("posts_count"),
  bio: text("bio"),
  isPrivate: boolean("is_private"),
  analysisStatus: text("analysis_status").default("pending"), // 'pending', 'analyzing', 'completed', 'failed'
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const unfollowers = pgTable("unfollowers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("unfollowed"), // unfollowed, blocked, deleted
  detectedAt: timestamp("detected_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  recoveredAt: timestamp("recovered_at"), // re-follow détecté : conservé pour affichage mais exclu du compteur
});

export const followers = pgTable("followers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  detectedAt: timestamp("detected_at").defaultNow(),
});

export const blockers = pgTable("blockers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  type: text("type").notNull().default("blocker"), // 'blocker' or 'disappeared'
  blockType: text("block_type").notNull().default("deleted_account"), // 'deleted_account' or 'manually_marked'
  detectedAt: timestamp("detected_at").defaultNow(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: serial("id").primaryKey(),
  codeToSend: text("code_to_send").notNull().unique(), // Code unique que l'utilisateur doit envoyer à Waler (ex: VERIFY-ABC123)
  code: text("code").unique(), // Code à 6 chiffres que Waler envoie en réponse (généré après réception du codeToSend)
  instagramUsername: text("instagram_username").notNull(), // Username Instagram de l'utilisateur
  userId: integer("user_id"), // Référence optionnelle à l'utilisateur (peut être null si pas encore créé)
  expiresAt: timestamp("expires_at").notNull(), // Expiration (15 minutes)
  used: boolean("used").default(false), // Si le code a été utilisé
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at"), // Quand le code a été utilisé
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // 'Free', 'Pro', 'Enterprise'
  displayName: text("display_name").notNull(), // 'Plan Gratuit', 'Plan Pro', etc.
  priceMonthly: integer("price_monthly").notNull(), // Prix en centimes (ex: 999 = 9.99€)
  priceYearly: integer("price_yearly").notNull(), // Prix en centimes
  maxAccounts: integer("max_accounts").notNull(), // Nombre de comptes trackés
  maxHistoryDays: integer("max_history_days").notNull(), // Historique conservé (0 = illimité)
  features: json("features").notNull(), // Array de features
  stripePriceIdMonthly: text("stripe_price_id_monthly"), // ID Stripe pour prix mensuel
  stripePriceIdYearly: text("stripe_price_id_yearly"), // ID Stripe pour prix annuel
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(), // Un user = une subscription
  planId: integer("plan_id").notNull(), // FK vers plans
  stripeCustomerId: text("stripe_customer_id"), // ID client Stripe
  stripeSubscriptionId: text("stripe_subscription_id"), // ID subscription Stripe
  status: text("status").notNull().default("active"), // 'active', 'canceled', 'past_due', 'trialing'
  billingPeriod: text("billing_period"), // 'monthly' ou 'yearly'
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Historique des changements de plan - pour traçabilité et audit
export const planChangeHistory = pgTable("plan_change_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // Utilisateur concerné
  previousPlanId: integer("previous_plan_id"), // Plan précédent (null si premier plan)
  newPlanId: integer("new_plan_id").notNull(), // Nouveau plan
  changeType: text("change_type").notNull(), // 'upgrade', 'downgrade', 'cancel', 'reactivate'
  reason: text("reason"), // Raison du changement (webhook, manual, etc.)
  dataPreserved: boolean("data_preserved").notNull().default(true), // Toujours true dans notre système
  warnings: json("warnings"), // Array de warnings si downgrade
  metadata: json("metadata"), // Données supplémentaires (stripe info, etc.)
  createdAt: timestamp("created_at").defaultNow(),
});

// État des agents par utilisateur - pour gérer la pause/reprise lors des changements de plan
export const agentStates = pgTable("agent_states", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // Utilisateur concerné
  agentType: text("agent_type").notNull(), // 'follow', 'prospects', 'connections', 'clients'
  status: text("status").notNull().default("active"), // 'active', 'paused', 'stopped'
  pausedAt: timestamp("paused_at"), // Quand l'agent a été mis en pause
  pauseReason: text("pause_reason"), // 'plan_downgrade', 'manual', 'error'
  lastRunAt: timestamp("last_run_at"), // Dernière exécution
  metadata: json("metadata"), // Données supplémentaires (config, stats, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true 
}).extend({
  email: z.string().email("Veuillez entrer une adresse email valide"),
});

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export const registerSchema = z.object({
  username: z.string()
    .min(1, "Le nom d'utilisateur est requis")
    .regex(/^[a-zA-Z0-9._]+$/, "Format Instagram invalide (lettres, chiffres, . et _ uniquement)"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  platform: z.literal("instagram").default("instagram"),
  usageMode: z.enum(["personal", "professional"]).optional(),
  selectedPlan: z.enum(["premium", "pro"]).optional(),
  // Propriété du compte Instagram vérifiée via l'extension pendant l'onboarding.
  instagramVerified: z.boolean().optional(),
  instagramUserId: z.string().optional(),
});

export const verifyCodeSchema = z.object({
  userId: z.number(),
  code: z.string().length(6, "Le code doit contenir 6 chiffres"),
});

export const insertUnfollowerSchema = createInsertSchema(unfollowers).omit({ 
  id: true, 
  detectedAt: true 
});

export const insertFollowerSchema = createInsertSchema(followers).omit({ 
  id: true, 
  detectedAt: true 
});

export const insertBlockerSchema = createInsertSchema(blockers).omit({ 
  id: true, 
  detectedAt: true 
});

export const insertPlanSchema = createInsertSchema(plans);

export const insertSubscriptionSchema = createInsertSchema(subscriptions);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Unfollower = typeof unfollowers.$inferSelect;
export type InsertUnfollower = z.infer<typeof insertUnfollowerSchema>;
export type Follower = typeof followers.$inferSelect;
export type InsertFollower = z.infer<typeof insertFollowerSchema>;
export type Blocker = typeof blockers.$inferSelect;
export type InsertBlocker = z.infer<typeof insertBlockerSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
