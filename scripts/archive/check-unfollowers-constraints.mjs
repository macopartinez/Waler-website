import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 2 });
try {
  console.log('=== Index/contraintes sur `unfollowers` ===');
  const idx = await sql`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'unfollowers'
  `;
  idx.forEach(i => console.log(`- ${i.indexname}: ${i.indexdef}`));

  console.log('\n=== Contraintes (constraint_type) ===');
  const cons = await sql`
    SELECT con.conname, con.contype,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'unfollowers'
  `;
  cons.forEach(c => console.log(`- ${c.conname} [${c.contype}]: ${c.def}`));

  // Test concret : est-ce que ON CONFLICT (user_id, username) est accepté ?
  console.log('\n=== Test ON CONFLICT (user_id, username) ===');
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO unfollowers (user_id, username, status, detected_at)
        VALUES (21, '__contrainte_test__', 'unfollowed', NOW())
        ON CONFLICT (user_id, username)
        DO UPDATE SET status = EXCLUDED.status
      `;
      // rollback systématique : on ne veut pas laisser la ligne de test
      throw { __rollback: true };
    });
  } catch (e) {
    if (e && e.__rollback) console.log('✅ ON CONFLICT (user_id, username) ACCEPTÉ (contrainte unique présente).');
    else console.log('❌ ON CONFLICT REJETÉ →', e.message);
  }
} catch (e) {
  console.error('Erreur:', e.message);
} finally {
  await sql.end();
}
