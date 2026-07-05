import sqlite3
import os
from datetime import datetime, timedelta

def set_user_premium_by_email():
    """Set a user to premium by email"""
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
        print("💡 Please register through the app first, then run this script")
        conn.close()
        return False
    
    print("🚀 Set User to Premium Plan\n")
    print("📋 Available users:")
    for user in users:
        uid, username, email, current_tier = user
        print(f"  - {email} ({username}) - Current tier: {current_tier or 'None'}")
    
    # Get email
    email_input = input("\n📧 Enter your email address: ").strip()
    
    if not email_input:
        print("❌ Email is required")
        conn.close()
        return False
    
    # Find user by email
    cursor.execute('SELECT id, username, email, subscription_tier FROM users WHERE email = ?', (email_input,))
    user = cursor.fetchone()
    
    if not user:
        print(f"❌ No user found with email: {email_input}")
        conn.close()
        return False
    
    user_id, username, email, current_tier = user
    
    # Ask for tier
    print(f"\n👤 Found user: {username} ({email})")
    print(f"   Current tier: {current_tier or 'None'}")
    tier = input("\n🎯 Select new tier [premium/pro] (default: premium): ").strip() or "premium"
    
    if tier not in ['premium', 'pro']:
        print("❌ Invalid tier. Must be 'premium' or 'pro'")
        conn.close()
        return False
    
    # Update user
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
        print(f"\n🎉 You now have access to {tier_result.upper()} features!")
        return True
    else:
        print("❌ Failed to verify upgrade")
        return False

if __name__ == '__main__':
    set_user_premium_by_email()
