-- ============================================
-- Waler - Schéma de Base de Données Supabase
-- ============================================
-- 
-- Instructions :
-- 1. Ouvrez Supabase Dashboard > SQL Editor
-- 2. Créez une nouvelle requête
-- 3. Copiez-collez ce fichier
-- 4. Cliquez sur "Run" ou Ctrl+Enter
-- ============================================

-- Supprimer les tables si elles existent déjà (optionnel)
DROP TABLE IF EXISTS agent_states CASCADE;
DROP TABLE IF EXISTS plan_change_history CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS verification_codes CASCADE;
DROP TABLE IF EXISTS blockers CASCADE;
DROP TABLE IF EXISTS followers CASCADE;
DROP TABLE IF EXISTS unfollowers CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;

-- Table des utilisateurs (nom de table: app_users)
CREATE TABLE app_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  owner_id INTEGER,                 -- Multi-compte : login owner (NULL = login principal)
  instagram_user_id TEXT,           -- ds_user_id Instagram (dédoublonne un compte lié)
  platform TEXT NOT NULL DEFAULT 'instagram',
  avatar_url TEXT,
  is_connected BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verification_code TEXT,
  verification_token TEXT,
  verification_token_expiry TIMESTAMP,
  verification_attempts INTEGER DEFAULT 0,
  subscription_tier TEXT,
  subscription_status TEXT,
  trial_ends_at TIMESTAMP,
  followers_count INTEGER,
  following_count INTEGER,
  posts_count INTEGER,
  bio TEXT,
  is_private BOOLEAN,
  analysis_status TEXT DEFAULT 'pending',
  last_analyzed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table des unfollowers
CREATE TABLE unfollowers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'unfollowed',
  detected_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  recovered_at TIMESTAMP,
  CONSTRAINT fk_unfollower_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Table des followers
CREATE TABLE followers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  detected_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_follower_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Table des blockers (comptes bloqués ou supprimés)
CREATE TABLE blockers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  type TEXT NOT NULL DEFAULT 'blocker',
  block_type TEXT NOT NULL DEFAULT 'deleted_account',
  detected_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_blocker_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Table des codes de vérification
CREATE TABLE verification_codes (
  id SERIAL PRIMARY KEY,
  code_to_send TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  instagram_username TEXT NOT NULL,
  user_id INTEGER,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP,
  CONSTRAINT fk_verification_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE SET NULL
);

-- Table des plans
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  max_accounts INTEGER NOT NULL,
  max_history_days INTEGER NOT NULL,
  features JSONB NOT NULL,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table des subscriptions
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  plan_id INTEGER NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  billing_period TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_subscription_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_subscription_plan
    FOREIGN KEY (plan_id) 
    REFERENCES plans(id)
    ON DELETE RESTRICT
);

-- Table de l'historique des changements de plan
CREATE TABLE plan_change_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  previous_plan_id INTEGER,
  new_plan_id INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  reason TEXT,
  data_preserved BOOLEAN NOT NULL DEFAULT true,
  warnings JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_plan_change_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Table des états des agents
CREATE TABLE agent_states (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  paused_at TIMESTAMP,
  pause_reason TEXT,
  last_run_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_agent_state_user
    FOREIGN KEY (user_id) 
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Index pour améliorer les performances
CREATE INDEX idx_unfollowers_user_id ON unfollowers(user_id);
CREATE INDEX idx_unfollowers_detected_at ON unfollowers(detected_at DESC);
CREATE INDEX idx_followers_user_id ON followers(user_id);
CREATE INDEX idx_followers_detected_at ON followers(detected_at DESC);
CREATE INDEX idx_blockers_user_id ON blockers(user_id);
CREATE INDEX idx_blockers_detected_at ON blockers(detected_at DESC);
CREATE INDEX idx_app_users_email ON app_users(email);
CREATE INDEX idx_app_users_username ON app_users(username);
CREATE INDEX idx_verification_codes_instagram ON verification_codes(instagram_username);
CREATE INDEX idx_verification_codes_code_to_send ON verification_codes(code_to_send);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_agent_states_user_id ON agent_states(user_id);

-- Commentaires pour la documentation
COMMENT ON TABLE app_users IS 'Utilisateurs de l''application Waler';
COMMENT ON TABLE unfollowers IS 'Historique des personnes qui ont unfollow';
COMMENT ON TABLE followers IS 'Historique des followers actuels';
COMMENT ON TABLE blockers IS 'Comptes qui ont bloqué ou ont été supprimés';
COMMENT ON TABLE verification_codes IS 'Codes de vérification pour l''authentification 2FA';
COMMENT ON TABLE plans IS 'Plans d''abonnement disponibles';
COMMENT ON TABLE subscriptions IS 'Abonnements actifs des utilisateurs';

COMMENT ON COLUMN app_users.platform IS 'Plateforme sociale : instagram';
COMMENT ON COLUMN app_users.is_connected IS 'Indique si le compte est toujours connecté';
COMMENT ON COLUMN blockers.type IS 'Type : blocker ou disappeared';

-- Afficher les tables créées
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name IN ('app_users', 'unfollowers', 'followers', 'blockers', 'verification_codes', 'plans', 'subscriptions', 'plan_change_history', 'agent_states')
ORDER BY table_name;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Toutes les tables ont été créées avec succès !';
  RAISE NOTICE '📊 Tables : app_users, unfollowers, followers, blockers, verification_codes, plans, subscriptions, plan_change_history, agent_states';
  RAISE NOTICE '🔍 Index créés pour optimiser les performances';
  RAISE NOTICE '🔗 Foreign keys configurées';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Votre base de données Supabase est prête !';
END $$;
