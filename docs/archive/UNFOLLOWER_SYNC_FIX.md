# Fix: Synchronisation automatique des unfollowers

## Problème identifié

Quand l'extension détectait des unfollowers et les envoyait au backend :
1. ✅ L'unfollower était ajouté dans la table `unfollowers`
2. ❌ MAIS le follower n'était PAS supprimé de la table `followers`
3. ❌ Résultat : `totalFollowers` ne diminuait jamais

**Symptôme** : Le dashboard affichait toujours 215 followers même après avoir détecté 2 unfollowers.

## Solution implémentée

### Modification du backend (`server/storage.ts`)

**Avant** :
```typescript
async createUnfollower(unfollower: InsertUnfollower): Promise<Unfollower> {
  const [newUnfollower] = await db.insert(unfollowers).values(unfollower).returning();
  return newUnfollower;
}
```

**Après** :
```typescript
async createUnfollower(unfollower: InsertUnfollower): Promise<Unfollower> {
  // Supprimer le follower de la table followers s'il existe
  await db.delete(followers)
    .where(
      and(
        eq(followers.userId, unfollower.userId),
        eq(followers.username, unfollower.username)
      )
    );
  
  // Créer l'unfollower
  const [newUnfollower] = await db.insert(unfollowers).values(unfollower).returning();
  return newUnfollower;
}
```

## Comportement maintenant

Quand l'extension détecte un unfollower :

1. **Extension** → Envoie `TRACK_UNFOLLOWER` au backend
2. **Backend** → Reçoit la requête via `/api/extension/sync`
3. **Backend** → Appelle `createUnfollower()`
4. **Backend** → **Supprime** le follower de la table `followers`
5. **Backend** → **Ajoute** l'unfollower dans la table `unfollowers`
6. **Dashboard** → Le compteur `totalFollowers` est automatiquement mis à jour (car basé sur `COUNT(*)` de la table `followers`)

## Résultat

- ✅ Quand 2 unfollowers sont détectés, `totalFollowers` passe de 215 → 213
- ✅ Les unfollowers apparaissent dans la section "Connections Changed"
- ✅ Le compteur "TOTAL Followers" affiche le bon nombre
- ✅ Pas besoin de "Sync complète" manuelle

## Test

1. L'extension détecte un unfollower
2. Elle envoie `TRACK_UNFOLLOWER` au backend
3. Le backend supprime automatiquement le follower
4. Recharge le dashboard → le compteur est à jour ! 🎉

## Fichiers modifiés

- `server/storage.ts` (ligne 34-46)
  - Import de `and` depuis drizzle-orm
  - Modification de `createUnfollower()` pour supprimer le follower avant de créer l'unfollower
