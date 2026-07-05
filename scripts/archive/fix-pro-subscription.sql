-- Script pour vérifier et corriger le statut d'abonnement Pro

-- 1. Vérifier le statut actuel de tous les utilisateurs
SELECT 
    id,
    username,
    email,
    subscription_tier,
    subscription_status,
    trial_ends_at,
    created_at
FROM users
ORDER BY id;

-- 2. Mettre à jour un utilisateur spécifique en mode Pro
-- Remplacez YOUR_USER_ID par votre ID utilisateur
-- UPDATE users 
-- SET 
--     subscription_tier = 'pro',
--     subscription_status = 'active'
-- WHERE id = YOUR_USER_ID;

-- 3. Mettre à jour TOUS les utilisateurs en mode Pro (ATTENTION!)
-- Décommentez seulement si vous voulez que tous les utilisateurs soient Pro
-- UPDATE users 
-- SET 
--     subscription_tier = 'pro',
--     subscription_status = 'active';

-- 4. Vérifier après mise à jour
-- SELECT 
--     id,
--     username,
--     subscription_tier,
--     subscription_status
-- FROM users
-- WHERE id = YOUR_USER_ID;
