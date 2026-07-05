import sqlite3

conn = sqlite3.connect('server/waler.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Tous les prospects
cur.execute("SELECT id, user_id, member_username, full_name, category FROM circle_members ORDER BY created_at DESC LIMIT 10")
prospects = cur.fetchall()

print("=== Derniers prospects ajoutés ===")
for p in prospects:
    print(f"ID: {p['id']}, User ID: {p['user_id']}, Username: {p['member_username']}, Category: {p['category']}")

# Prospects pour pako_mrtz (user_id 21)
cur.execute("SELECT id, member_username, category FROM circle_members WHERE user_id = 21")
pako_prospects = cur.fetchall()

print("\n=== Prospects de pako_mrtz (user_id=21) ===")
if pako_prospects:
    for p in pako_prospects:
        print(f"ID: {p['id']}, Username: {p['member_username']}, Category: {p['category']}")
else:
    print("Aucun prospect trouvé pour pako_mrtz")

conn.close()
