import sqlite3
import os
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

db_path = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create premium user
password_hash = generate_password_hash('premium123')
trial_ends = (datetime.now() + timedelta(days=30)).isoformat()
sub_ends = (datetime.now() + timedelta(days=365)).isoformat()

cursor.execute('''
    INSERT INTO users (
        username, email, password_hash, platform, usage_mode,
        subscription_tier, subscription_status,
        trial_ends_at, subscription_ends_at,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
''', (
    'premium_user',
    'premium@waler.com',
    password_hash,
    'instagram',
    'professional',
    'premium',
    'active',
    trial_ends,
    sub_ends
))

conn.commit()

# Get created user
cursor.execute('SELECT id, username, email, subscription_tier, subscription_status FROM users WHERE email = ?', 
               ('premium@waler.com',))
user = cursor.fetchone()
conn.close()

print('✅ Premium user created successfully!')
print(f'ID: {user[0]}')
print(f'Username: {user[1]}')
print(f'Email: {user[2]}')
print(f'Tier: {user[3]}')
print(f'Status: {user[4]}')
print(f'\n🔑 Login with:')
print(f'Email: premium@waler.com')
print(f'Password: premium123')
