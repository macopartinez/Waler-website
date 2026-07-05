import { db } from "./server/db";
import { users, unfollowers, followers, blockers, subscriptions, plans, planChangeHistory } from "./shared/schema";
import { eq } from "drizzle-orm";
import { changePlan, upgradePlan, downgradePlan, cancelPlan } from "./server/plan-migration";

/**
 * Test de préservation des données lors du changement de plan
 * Ce script vérifie qu'aucune donnée n'est perdue lors d'un upgrade ou downgrade
 */

async function testPlanChange() {
  console.log("🧪 Test de préservation des données lors du changement de plan\n");

  try {
    // 1. Récupérer un utilisateur de test
    const allUsers = await db.select().from(users);
    
    if (allUsers.length === 0) {
      console.log("❌ Aucun utilisateur trouvé. Créez un utilisateur d'abord.");
      process.exit(1);
    }

    const testUser = allUsers[0];
    console.log(`👤 Utilisateur de test: ${testUser.username} (${testUser.email})`);
    console.log(`   Plan actuel: ${testUser.subscriptionTier || 'none'}\n`);

    // 2. Compter les données AVANT le changement
    const [unfollowersCount] = await db
      .select({ count: db.$count() })
      .from(unfollowers)
      .where(eq(unfollowers.userId, testUser.id));

    const [followersCount] = await db
      .select({ count: db.$count() })
      .from(followers)
      .where(eq(followers.userId, testUser.id));

    const [blockersCount] = await db
      .select({ count: db.$count() })
      .from(blockers)
      .where(eq(blockers.userId, testUser.id));

    console.log("📊 Données AVANT le changement de plan:");
    console.log(`   Unfollowers: ${unfollowersCount?.count || 0}`);
    console.log(`   Followers: ${followersCount?.count || 0}`);
    console.log(`   Blockers: ${blockersCount?.count || 0}\n`);

    // 3. Récupérer les plans disponibles
    const allPlans = await db.select().from(plans);
    
    if (allPlans.length < 2) {
      console.log("⚠️ Pas assez de plans pour tester. Création des plans...");
      // Les plans seront créés automatiquement au démarrage du serveur
    }

    console.log("📋 Plans disponibles:");
    allPlans.forEach(plan => {
      console.log(`   ${plan.id}. ${plan.displayName} (${plan.name}) - ${plan.priceMonthly / 100}€/mois`);
    });
    console.log();

    // 4. Tester un changement de plan
    const currentPlanName = testUser.subscriptionTier || 'none';
    const targetPlan = allPlans.find(p => p.name !== currentPlanName) || allPlans[0];

    console.log(`🔄 Changement de plan: ${currentPlanName} → ${targetPlan.name}\n`);

    const result = await changePlan(testUser.id, targetPlan.id, {
      stripeCustomerId: 'test_customer_id',
      stripeSubscriptionId: 'test_sub_id',
      billingPeriod: 'monthly',
    });

    console.log("✅ Résultat du changement:");
    console.log(`   Success: ${result.success}`);
    console.log(`   Previous plan: ${result.previousPlan}`);
    console.log(`   New plan: ${result.newPlan}`);
    console.log(`   Data preserved: ${result.dataPreserved}`);
    console.log(`   Message: ${result.message}`);
    if (result.warnings) {
      console.log(`   Warnings: ${result.warnings.join(', ')}`);
    }
    console.log();

    // 5. Vérifier que les données sont toujours là APRÈS le changement
    const [unfollowersCountAfter] = await db
      .select({ count: db.$count() })
      .from(unfollowers)
      .where(eq(unfollowers.userId, testUser.id));

    const [followersCountAfter] = await db
      .select({ count: db.$count() })
      .from(followers)
      .where(eq(followers.userId, testUser.id));

    const [blockersCountAfter] = await db
      .select({ count: db.$count() })
      .from(blockers)
      .where(eq(blockers.userId, testUser.id));

    console.log("📊 Données APRÈS le changement de plan:");
    console.log(`   Unfollowers: ${unfollowersCountAfter?.count || 0}`);
    console.log(`   Followers: ${followersCountAfter?.count || 0}`);
    console.log(`   Blockers: ${blockersCountAfter?.count || 0}\n`);

    // 6. Vérifier que les données sont identiques
    const dataPreserved = 
      unfollowersCount?.count === unfollowersCountAfter?.count &&
      followersCount?.count === followersCountAfter?.count &&
      blockersCount?.count === blockersCountAfter?.count;

    if (dataPreserved) {
      console.log("✅ SUCCÈS: Toutes les données ont été préservées!");
    } else {
      console.log("❌ ÉCHEC: Des données ont été perdues!");
      console.log(`   Unfollowers: ${unfollowersCount?.count} → ${unfollowersCountAfter?.count}`);
      console.log(`   Followers: ${followersCount?.count} → ${followersCountAfter?.count}`);
      console.log(`   Blockers: ${blockersCount?.count} → ${blockersCountAfter?.count}`);
    }
    console.log();

    // 7. Vérifier l'historique
    const history = await db
      .select()
      .from(planChangeHistory)
      .where(eq(planChangeHistory.userId, testUser.id));

    console.log(`📜 Historique des changements de plan (${history.length} entrées):`);
    history.forEach((entry, index) => {
      console.log(`   ${index + 1}. ${entry.changeType} - ${entry.reason}`);
      console.log(`      Previous plan: ${entry.previousPlanId || 'none'} → New plan: ${entry.newPlanId}`);
      console.log(`      Data preserved: ${entry.dataPreserved}`);
      console.log(`      Date: ${entry.createdAt}`);
    });

    console.log("\n🎉 Test terminé avec succès!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Erreur lors du test:", error);
    process.exit(1);
  }
}

testPlanChange();
