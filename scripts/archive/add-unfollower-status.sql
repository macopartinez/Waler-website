-- Migration: Ajouter les colonnes status et verified_at à la table unfollowers

-- Ajouter la colonne status
ALTER TABLE unfollowers 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unfollowed';

-- Ajouter la colonne verified_at
ALTER TABLE unfollowers 
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Mettre à jour les enregistrements existants avec le status par défaut
UPDATE unfollowers 
SET status = 'unfollowed' 
WHERE status IS NULL;

-- Afficher les résultats
SELECT id, username, status, detected_at, verified_at 
FROM unfollowers 
ORDER BY detected_at DESC 
LIMIT 10;
