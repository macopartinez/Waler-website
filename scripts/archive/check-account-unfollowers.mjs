/**
 * check-account-unfollowers.mjs
 * Lit la table Postgres `unfollowers` pour un compte Instagram donné (ds_user_id).
 * Usage: node check-account-unfollowers.mjs <ds_user_id>
 */
import 'dotenv/config';
import postgres from 'postgres';

const dsUserId = process.argv[2] || '41882402500';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 2 });

try {
  // 1. Trouver le(s) compte(s) app_users correspondant à ce ds_user_id
  const accounts = await sql`
    SELECT id, username, instagram_user_id, owner_id, followers_count
    FROM app_users
    WHERE instagram_user_id = ${dsUserId}
  `;

  if (accounts.length === 0) {
    console.log(`⚠️ Aucun compte app_users avec instagram_user_id=${dsUserId}.`);
    console.log('   → mismatch d\'IDs possible. Comptes récents :');
    const recent = await sql`SELECT id, username, instagram_user_id, followers_count FROM app_users ORDER BY id DESC LIMIT 15`;
    recent.forEach(a => console.log(`   #${a.id} @${a.username} ds=${a.instagram_user_id} followers=${a.followers_count}`));
    process.exit(0);
  }

  for (const acc of accounts) {
    console.log(`\n👤 Compte #${acc.id} @${acc.username} (ds=${acc.instagram_user_id}, owner=${acc.owner_id}, followers_count=${acc.followers_count})`);

    const rows = await sql`
      SELECT username, status, detected_at, verified_at, recovered_at
      FROM unfollowers
      WHERE user_id = ${acc.id}
      ORDER BY detected_at DESC NULLS LAST
    `;

    console.log(`   ❌ Total unfollowers enregistrés : ${rows.length}`);
    const active = rows.filter(r => r.recovered_at == null);
    console.log(`   ↳ actifs (non re-follow) : ${active.length}`);

    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const recent = rows.filter(r => r.detected_at && new Date(r.detected_at).getTime() > dayAgo);
    console.log(`\n   🆕 Dernières 24h : ${recent.length}`);
    recent.forEach((r, i) => console.log(`      ${i + 1}. @${r.username} [${r.status}] ${new Date(r.detected_at).toLocaleString()}`));

    console.log(`\n   📋 Les 15 plus récents :`);
    rows.slice(0, 15).forEach((r, i) => {
      const when = r.detected_at ? new Date(r.detected_at).toLocaleString() : 'n/a';
      const rec = r.recovered_at ? ' (RE-FOLLOW)' : '';
      console.log(`      ${i + 1}. @${r.username} [${r.status}] ${when}${rec}`);
    });
  }
} catch (e) {
  console.error('❌ Erreur:', e.message);
} finally {
  await sql.end();
}
