export type SubscriptionTier = 'premium' | 'pro';

export interface PricingPlan {
  id: SubscriptionTier;
  name: string;
  price: number;
  currency: string;
  interval: 'month';
  trialDays: number;
  features: string[];
  cta: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'premium',
    name: 'Base',
    price: 4.99,
    currency: 'EUR',
    interval: 'month',
    trialDays: 7,
    cta: 'Start 7-Day Free Trial',
    features: [
      '1 Instagram account',
      'See who unfollowed or blocked you (RevealGate)',
      '30-day change history',
      'Relationship & psychological insights',
      'Real-time unfollower alerts',
      'Unlimited introspection questionnaires',
      'PDF export',
      'Email support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19.99,
    currency: 'EUR',
    interval: 'month',
    trialDays: 14,
    popular: true,
    cta: 'Start 14-Day Free Trial',
    features: [
      'Everything in Base',
      'Up to 3 Instagram accounts',
      'Unlimited history',
      'Personal + Professional dual mode',
      'Client & prospect CRM (VIP / Keep / Watch)',
      'DM checkpoints — temperature, momentum, priority',
      'Lead qualification phases (setting)',
      'Interaction signal timeline',
      'Contact health & priority scoring',
      'PDF progress reports & export',
      'Waler Pro Coach: signals, not scripts — you write every message'
    ]
  }
];

export function getPlanById(id: SubscriptionTier): PricingPlan | undefined {
  return PRICING_PLANS.find(plan => plan.id === id);
}

// Merges the static plan config (price, trial length, id…) with the
// localized copy (name, CTA, feature list) for the active language.
export function getLocalizedPricingPlans(t: {
  pricing: { plans: Record<SubscriptionTier, { name: string; cta: string; features: string[] }> };
}): PricingPlan[] {
  return PRICING_PLANS.map((plan) => ({
    ...plan,
    ...t.pricing.plans[plan.id],
  }));
}

export function isPremiumFeature(feature: string): boolean {
  const premiumFeatures = [
    'ai_insights',
    'reveal_gate',
    'full_history',
    'notifications'
  ];
  return premiumFeatures.includes(feature);
}

export function isProFeature(feature: string): boolean {
  const proFeatures = [
    'client_management',
    'client_analytics',
    'milestones',
    'professional_notebook',
    'reports_export',
    'messaging_hub',
    'pro_badge'
  ];
  return proFeatures.includes(feature);
}
