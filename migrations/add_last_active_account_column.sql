-- Multi-compte : mémorise le dernier compte Instagram actif choisi par le
-- login owner, pour le restaurer en session à la reconnexion. Sans cette
-- colonne, chaque nouvelle session retombe sur le compte owner par défaut
-- (server/auth.ts::getActiveAccount), ce qui donne l'impression que les
-- données scopées à un compte lié (ex: mots-clés de campagne) ont disparu
-- après une déconnexion/reconnexion. Additif et sans risque : nullable.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS last_active_account_id INTEGER;
