import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Plan = {
  id: number;
  name: string;
  displayName: string;
  priceMonthly: number;
  priceYearly: number;
  maxAccounts: number;
  maxHistoryDays: number;
  features: string[];
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
};

type Subscription = {
  id: number;
  userId: number;
  planId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  billingPeriod: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};

type UserPlan = {
  plan: Plan;
  subscription: Subscription | null;
};

/**
 * Récupère tous les plans disponibles
 */
export function usePlans() {
  return useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) {
        throw new Error("Failed to fetch plans");
      }
      return res.json();
    },
  });
}

/**
 * Récupère le plan actuel de l'utilisateur
 */
export function useUserPlan() {
  return useQuery<UserPlan>({
    queryKey: ["subscription", "current"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/current", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch user plan");
      }
      return res.json();
    },
  });
}

/**
 * Crée une session Stripe Checkout
 */
export function useCreateCheckout() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { priceId: string; billingPeriod: "monthly" | "yearly" }) => {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create checkout session");
      }

      return res.json() as Promise<{ sessionId: string; url: string }>;
    },
    onSuccess: (data) => {
      // Rediriger vers Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Actions du portail Stripe que l'on peut cibler directement depuis /billing.
 */
export type PortalFlow =
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update";

/**
 * Ouvre le portail client Stripe. Passer un `flow` atterrit directement sur
 * l'écran voulu (carte, résiliation, changement de formule) ; sans argument on
 * ouvre l'accueil du portail (factures & reçus).
 */
export function useCustomerPortal() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (flow?: PortalFlow) => {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow ? { flow } : {}),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create portal session");
      }

      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      // Rediriger vers le portail (le return_url ramène ensuite sur /billing).
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
