/**
 * Script pour mettre à jour le nombre de followers directement dans la DB
 * À exécuter avec: node update-db-followers.js
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/waler';

async function updateFollowerCount() {
  console.log('🔄 Connexion à la base de données...');
  
  const client = postgres(connectionString);
  const db = drizzle(client);
  
  try {
    // Mettre à jour l'utilisateur avec l'ID 21
    const result = await db
      .update(users)
      .set({
        followersCount: 211,
        lastAnalyzedAt: new Date(),
      })
      .where(eq(users.id, 21))
      .returning();
    
    console.log('✅ Nombre de followers mis à jour !');
    console.log('Résultat:', result);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.end();
    console.log('🔌 Connexion fermée');
  }
}

updateFollowerCount();
