import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function setPremium() {
  console.log("🚀 Setting user to Premium in PostgreSQL\n");

  try {
    // Get all users
    const allUsers = await db.select().from(users);
    
    console.log("📋 Current users:");
    allUsers.forEach(user => {
      console.log(`  ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Tier: ${user.subscriptionTier || 'null'}`);
    });
    
    if (allUsers.length === 0) {
      console.log("\n❌ No users found. Please register through the app first.");
      process.exit(1);
    }
    
    // Get the last user (most recent)
    const lastUser = allUsers[allUsers.length - 1];
    
    console.log(`\n🎯 Upgrading user: ${lastUser.username} (${lastUser.email})`);
    
    // Update to premium
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await db
      .update(users)
      .set({ 
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        trialEndsAt: trialEndsAt
      })
      .where(eq(users.id, lastUser.id));
    
    // Verify
    const updatedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, lastUser.id))
      .limit(1);
    
    if (updatedUser[0]) {
      console.log(`\n✅ User upgraded successfully!`);
      console.log(`   Username: ${updatedUser[0].username}`);
      console.log(`   Email: ${updatedUser[0].email}`);
      console.log(`   Tier: ${updatedUser[0].subscriptionTier}`);
      console.log(`   Status: ${updatedUser[0].subscriptionStatus}`);
      console.log(`   Trial ends: ${updatedUser[0].trialEndsAt}`);
      console.log(`\n🎉 You can now login and see your Premium badge!`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

setPremium();
