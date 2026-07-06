-- Colonnes Stripe manquantes sur app_users. Les tables plans/subscriptions
-- définies dans shared/schema.ts ne sont pas provisionnées sur cette base ;
-- app_users est la source de vérité réelle pour le statut d'abonnement
-- (voir server/plans.ts). Additif et sans risque : toutes les colonnes sont
-- nullable.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_period TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
