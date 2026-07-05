import sqlite3

conn = sqlite3.connect('server/waler.db')
cur = conn.cursor()

# Mettre à jour l'utilisateur 21 pour devenir Luka
cur.execute("""
    UPDATE users 
    SET username = 'metral.luka',
        email = 'luka@test.com'
    WHERE id = 21
""")

conn.commit()

# Vérifier
cur.execute("SELECT id, username, email FROM users WHERE id = 21")
user = cur.fetchone()

if user:
    print(f"✅ Utilisateur 21 mis à jour:")
    print(f"   ID: {user[0]}")
    print(f"   Username: {user[1]}")
    print(f"   Email: {user[2]}")
else:
    print("❌ Utilisateur 21 non trouvé")

conn.close()
