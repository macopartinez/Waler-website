import sqlite3

conn = sqlite3.connect('server/waler.db')
cur = conn.cursor()

# Trouver l'utilisateur pako_mrtz
cur.execute("SELECT id, username, email FROM users WHERE email = 'demo@example.com'")
user = cur.fetchone()

if user:
    old_id = user[0]
    print(f"Utilisateur trouvé avec ID {old_id}")
    
    # Mettre à jour l'ID à 21
    cur.execute("UPDATE users SET id = 21 WHERE email = 'demo@example.com'")
    conn.commit()
    print(f"✅ ID mis à jour de {old_id} à 21")
else:
    print("❌ Utilisateur non trouvé")

conn.close()
