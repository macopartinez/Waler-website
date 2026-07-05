import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface PlanInfo {
  id: number;
  // NB : nom interne "base" = tier client 'premium' (routes.ts mappe
  // 'premium' → 'base'). On ne renomme pas la clé pour ne pas casser ce mapping.
  name: string;
  displayName: string;
  priceMonthly: number; // en centimes
  priceYearly: number; // en centimes
  maxAccounts: number; // 0 = illimité
  maxHistoryDays: number; // 0 = illimité
  features: string[];
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  isActive: boolean;
  trialDays: number;
}

export interface SubscriptionInfo {
  userId: number;
  planId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  billingPeriod: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

// Source de vérité statique pour les plans : les tables `plans`/`subscriptions`
// définies dans shared/schema.ts ne sont PAS provisionnées sur la base Supabase
// live (vérifié : seules app_users, followers, unfollowers, blockers, session,
// verification_codes, users existent). Le statut d'abonnement réel vit donc sur
// les colonnes app_users.subscription_tier / subscription_status / trial_ends_at
// / stripe_* (voir getUserPlan/upsertSubscription ci-dessous).
export const DEFAULT_PLANS: PlanInfo[] = [
  {
    id: 1,
    name: "base",
    displayName: "Base",
    priceMonthly: 499, // 4.99€
    priceYearly: 4799, // 47.99€ (économie de ~20%)
    maxAccounts: 1,
    maxHistoryDays: 30,
    features: [
      "1 Instagram account",
      "Personal mode only",
      "30-day change history",
      "See who unfollowed or blocked you",
      "Relationship & psychological insights",
      "Real-time unfollower alerts",
      "PDF export",
      "Email support",
    ],
    stripePriceIdMonthly: process.env.STRIPE_PRICE_BASE_MONTHLY || null,
    stripePriceIdYearly: process.env.STRIPE_PRICE_BASE_YEARLY || null,
    isActive: true,
    trialDays: 7,
  },
  {
    id: 2,
    name: "pro",
    displayName: "Pro",
    priceMonthly: 1999, // 19.99€
    priceYearly: 23988, // 239.88€ (19.99€/mois facturé annuellement)
    maxAccounts: 3,
    maxHistoryDays: 0, // 0 = illimité
    features: [
      "Everything in Base",
      "Up to 3 Instagram accounts",
      "Unlimited history",
      "Personal + Professional dual mode",
      "Client & prospect CRM (VIP / Keep / Watch)",
      "DM conversation temperature (hot / warm / cold)",
      "Lead qualification phases",
      "Interaction signal timeline",
      "Contact health & priority scoring",
      "PDF progress reports & export",
      "Waler Pro Coach badge",
    ],
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY || null,
    isActive: true,
    trialDays: 14,
  },
];

// Tier client ('premium'/'pro') <-> nom de plan serveur ('base'/'pro').
function planNameToTier(planName: string): string {
  return planName === "pro" ? "pro" : "premium";
}

function tierToPlanName(tier: string | null): string {
  return tier === "pro" ? "pro" : "base";
}

/**
 * Récupère tous les plans actifs
 */
export async function getActivePlans(): Promise<PlanInfo[]> {
  return DEFAULT_PLANS.filter((p) => p.isActive);
}

/**
 * Récupère un plan par son nom
 */
export async function getPlanByName(name: string): Promise<PlanInfo | null> {
  return DEFAULT_PLANS.find((p) => p.name === name) ?? null;
}

/**
 * Récupère un plan par son ID
 */
export async function getPlanById(id: number): Promise<PlanInfo | null> {
  return DEFAULT_PLANS.find((p) => p.id === id) ?? null;
}

/**
 * Récupère le plan et l'état d'abonnement d'un utilisateur, lus directement
 * sur app_users (voir note en tête de fichier).
 */
export async function getUserPlan(userId: number): Promise<{
  plan: PlanInfo;
  subscription: SubscriptionInfo | null;
}> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  const plan =
    (await getPlanByName(tierToPlanName(user?.subscriptionTier ?? null))) ?? DEFAULT_PLANS[0];

  const subscription: SubscriptionInfo | null = user?.stripeSubscriptionId
    ? {
        userId,
        planId: plan.id,
        stripeCustomerId: user.stripeCustomerId ?? null,
        stripeSubscriptionId: user.stripeSubscriptionId,
        status: user.subscriptionStatus || "active",
        billingPeriod: user.billingPeriod ?? null,
        currentPeriodEnd: user.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
      }
    : null;

  return { plan, subscription };
}

/**
 * Active/majore l'abonnement d'un utilisateur suite à un événement Stripe.
 * Écrit directement sur app_users (voir note en tête de fichier).
 */
export async function upsertSubscription(data: {
  userId: number;
  planId: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: string;
  billingPeriod?: string;
  currentPeriodEnd?: Date;
  trialEndsAt?: Date | null;
}): Promise<void> {
  const plan = DEFAULT_PLANS.find((p) => p.id === data.planId);

  await db
    .update(users)
    .set({
      subscriptionTier: plan ? planNameToTier(plan.name) : undefined,
      subscriptionStatus: data.status || "active",
      trialEndsAt: data.trialEndsAt ?? null,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      billingPeriod: data.billingPeriod,
      currentPeriodEnd: data.currentPeriodEnd,
    })
    .where(eq(users.id, data.userId));
}

/**
 * Vérifie si un utilisateur peut ajouter un compte
 */
export async function canAddAccount(userId: number, currentAccountCount: number): Promise<{
  allowed: boolean;
  reason?: string;
  maxAccounts: number;
}> {
  const { plan } = await getUserPlan(userId);

  // 0 = illimité
  if (plan.maxAccounts === 0) {
    return { allowed: true, maxAccounts: 0 };
  }

  if (currentAccountCount >= plan.maxAccounts) {
    return {
      allowed: false,
      reason: `Plan ${plan.displayName} limité à ${plan.maxAccounts} compte(s)`,
      maxAccounts: plan.maxAccounts,
    };
  }

  return { allowed: true, maxAccounts: plan.maxAccounts };
}
