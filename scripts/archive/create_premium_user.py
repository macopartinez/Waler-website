import sqlite3
import os
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

def create_premium_user():
    """Create a new user with premium plan"""
    db_path = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return False
    
    print("🚀 Create Premium User\n")
    
    # Get user details
    username = input("Enter username (default: premium_user): ").strip() or "premium_user"
    email = input("Enter email (default: premium@waler.com): ").strip() or "premium@waler.com"
    password = input("Enter password (default: password123): ").strip() or "password123"
    platform = input("Enter platform [instagram/facebook] (default: instagram): ").strip() or "instagram"
    
    if platform not in ['instagram', 'facebook']:
        print("❌ Invalid platform. Must be 'instagram' or 'facebook'")
        return False
    
    # Ask for tier
    tier = input("Enter tier [premium/pro] (default: premium): ").strip() or "premium"
    if tier not in ['premium', 'pro']:
        print("❌ Invalid tier. Must be 'premium' or 'pro'")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if email already exists
    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        print(f"❌ Email {email} already exists")
        conn.close()
        return False
    
    # Check if username already exists
    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    if cursor.fetchone():
        print(f"❌ Username {username} already exists")
        conn.close()
        return False
    
    # Hash password
    password_hash = generate_password_hash(password)
    
    # Set subscription dates
    trial_ends_at = datetime.now() + timedelta(days=30)
    subscription_ends_at = datetime.now() + timedelta(days=365)
    
    # Insert user
    cursor.execute('''
        INSERT INTO users (
            username, email, password_hash, platform, usage_mode,
            subscription_tier, subscription_status, 
            trial_ends_at, subscription_ends_at,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ''', (
        username, email, password_hash, platform, 'professional',
        tier, 'active',
        trial_ends_at.isoformat(), subscription_ends_at.isoformat()
    ))
    
    user_id = cursor.lastrowid
    conn.commit()
    
    # Verify creation
    cursor.execute('''
        SELECT id, username, email, platform, subscription_tier, subscription_status, 
               trial_ends_at, subscription_ends_at
        FROM users WHERE id = ?
    ''', (user_id,))
    
    user = cursor.fetchone()
    conn.close()
    
    if user:
        uid, uname, uemail, uplat, utier, ustatus, utrial, usub = user
        print("\n✅ User created successfully!")
        print(f"   ID: {uid}")
        print(f"   Username: {uname}")
        print(f"   Email: {uemail}")
        print(f"   Platform: {uplat}")
        print(f"   Tier: {utier}")
        print(f"   Status: {ustatus}")
        print(f"   Trial ends: {utrial}")
        print(f"   Subscription ends: {usub}")
        print(f"\n🔑 Login credentials:")
        print(f"   Email: {uemail}")
        print(f"   Password: {password}")
        return True
    else:
        print("❌ Failed to verify user creation")
        return False

if __name__ == '__main__':
    create_premium_user()
