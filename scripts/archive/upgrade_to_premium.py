import sqlite3
import os
from datetime import datetime, timedelta

def upgrade_to_premium(user_id=None, tier='premium'):
    """Upgrade user to premium or pro plan"""
    db_path = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all users
    cursor.execute('SELECT id, username, email, subscription_tier FROM users')
    users = cursor.fetchall()
    
    if not users:
        print("❌ No users found in database")
        print("💡 Please register a user first through the app")
        conn.close()
        return False
    
    print("\n📋 Available users:")
    for user in users:
        uid, username, email, current_tier = user
        print(f"  {uid}. {username} ({email}) - Current tier: {current_tier or 'None'}")
    
    # Get user choice if not provided
    if user_id is None:
        user_id_input = input(f"\n👤 Enter user ID to upgrade to {tier.upper()} (or press Enter for first user): ").strip()
        
        if user_id_input:
            user_id = int(user_id_input)
        else:
            user_id = users[0][0]
    
    # Update user to selected tier
    trial_ends_at = datetime.now() + timedelta(days=30)
    subscription_ends_at = datetime.now() + timedelta(days=365)
    
    cursor.execute('''
        UPDATE users 
        SET subscription_tier = ?,
            subscription_status = 'active',
            trial_ends_at = ?,
            subscription_ends_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (tier, trial_ends_at.isoformat(), subscription_ends_at.isoformat(), user_id))
    
    conn.commit()
    
    # Verify update
    cursor.execute('''
        SELECT username, email, subscription_tier, subscription_status, trial_ends_at, subscription_ends_at
        FROM users WHERE id = ?
    ''', (user_id,))
    
    updated_user = cursor.fetchone()
    conn.close()
    
    if updated_user:
        username, email, tier_result, status, trial_ends, sub_ends = updated_user
        print("\n✅ User upgraded successfully!")
        print(f"   Username: {username}")
        print(f"   Email: {email}")
        print(f"   Tier: {tier_result}")
        print(f"   Status: {status}")
        print(f"   Trial ends: {trial_ends}")
        print(f"   Subscription ends: {sub_ends}")
        return True
    else:
        print("❌ Failed to verify upgrade")
        return False

if __name__ == '__main__':
    print("🚀 Waler Premium Upgrade Tool\n")
    upgrade_to_premium()
