import sqlite3

conn = sqlite3.connect('server/waler.db')
cur = conn.cursor()

# Tous les utilisateurs
cur.execute("SELECT id, username, subscription_tier, subscription_status FROM users")
users = cur.fetchall()

print("=== Tous les utilisateurs ===")
for user in users:
    print(f"ID: {user[0]}, Username: {user[1]}, Tier: {user[2]}, Status: {user[3]}")

# Utilisateurs Pro
cur.execute("SELECT id, username FROM users WHERE subscription_tier = 'pro' AND subscription_status = 'active'")
pro_users = cur.fetchall()

print("\n=== Utilisateurs Pro ===")
if pro_users:
    for user in pro_users:
        print(f"ID: {user[0]}, Username: {user[1]}")
else:
    print("Aucun utilisateur Pro trouvé")

conn.close()
