-- Script SQL pour mettre à jour le nombre de followers directement
-- À exécuter dans pgAdmin, psql, ou tout client PostgreSQL

-- Mettre à jour le nombre de followers pour l'utilisateur ID 21
UPDATE users 
SET followers_count = 211, 
    last_analyzed_at = NOW() 
WHERE id = 21 
RETURNING id, username, followers_count, last_analyzed_at;

-- Vérifier la mise à jour
SELECT id, username, followers_count, following_count, last_analyzed_at 
FROM users 
WHERE id = 21;
