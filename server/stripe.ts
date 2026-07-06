import Stripe from "stripe";
import type { Request } from "express";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Version d'API épinglée volontairement (le SDK installé attend une version plus récente
  // qui déplace current_period_* vers les items ; on conserve l'ancienne pour ne pas casser le runtime).
  apiVersion: "2024-12-18.acacia" as any,
  typescript: true,
});

/**
 * Crée une session Stripe Checkout
 */
export async function createCheckoutSession(params: {
  userId: number;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  trialPeriodDays?: number;
}): Promise<Stripe.Checkout.Session> {
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId.toString(),
    metadata: {
      userId: params.userId.toString(),
    },
  };

  if (params.trialPeriodDays) {
    sessionParams.subscription_data = {
      trial_period_days: params.trialPeriodDays,
    };
  }

  // Utiliser customer existant ou créer nouveau
  if (params.customerId) {
    sessionParams.customer = params.customerId;
  } else {
    sessionParams.customer_email = params.userEmail;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

// Actions du portail que l'on peut cibler directement (deep-link) depuis /billing.
export type PortalFlow =
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update";

/**
 * Crée un portail client Stripe.
 *
 * `flow` permet d'atterrir directement sur l'écran voulu (changer de carte,
 * résilier, changer de formule) plutôt que sur l'accueil du portail. Les flux
 * liés à l'abonnement (`subscription_cancel`/`subscription_update`) exigent
 * l'ID de subscription ; sans lui on retombe sur l'accueil (factures incluses).
 */
export async function createCustomerPortal(params: {
  customerId: string;
  returnUrl: string;
  flow?: PortalFlow;
  subscriptionId?: string | null;
}): Promise<Stripe.BillingPortal.Session> {
  const createParams: Stripe.BillingPortal.SessionCreateParams = {
    customer: params.customerId,
    return_url: params.returnUrl,
  };

  if (params.flow === "payment_method_update") {
    createParams.flow_data = { type: "payment_method_update" };
  } else if (params.flow === "subscription_cancel" && params.subscriptionId) {
    createParams.flow_data = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: params.subscriptionId },
    };
  } else if (params.flow === "subscription_update" && params.subscriptionId) {
    createParams.flow_data = {
      type: "subscription_update",
      subscription_update: { subscription: params.subscriptionId },
    };
  }

  return stripe.billingPortal.sessions.create(createParams);
}

/**
 * Récupère une subscription Stripe
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error("Error retrieving subscription:", error);
    return null;
  }
}

/**
 * Annule une subscription Stripe
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

/**
 * Vérifie la signature d'un webhook Stripe
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Récupère un customer Stripe
 */
export async function getCustomer(
  customerId: string
): Promise<Stripe.Customer | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return null;
    }
    return customer as Stripe.Customer;
  } catch (error) {
    console.error("Error retrieving customer:", error);
    return null;
  }
}
