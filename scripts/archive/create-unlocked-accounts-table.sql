-- Table pour tracker les comptes unfollowers débloqués par l'utilisateur
CREATE TABLE IF NOT EXISTS unlocked_unfollowers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  unfollower_id INTEGER NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, unfollower_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_unlocked_unfollowers_user_id ON unlocked_unfollowers(user_id);
CREATE INDEX IF NOT EXISTS idx_unlocked_unfollowers_unfollower_id ON unlocked_unfollowers(unfollower_id);
