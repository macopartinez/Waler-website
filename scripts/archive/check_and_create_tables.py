import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')

conn = sqlite3.connect(DATABASE_PATH)
cur = conn.cursor()

# Vérifier les tables existantes
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cur.fetchall()]
print("📊 Tables existantes:", tables)

# Créer les tables manquantes pour Agent C
if 'clients' not in tables:
    print("\n✨ Création de la table 'clients'...")
    cur.execute("""
        CREATE TABLE clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coach_user_id INTEGER NOT NULL,
            instagram_username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            tags TEXT,
            notes TEXT,
            initial_goal TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    print("✅ Table 'clients' créée")

if 'client_metrics' not in tables:
    print("\n✨ Création de la table 'client_metrics'...")
    cur.execute("""
        CREATE TABLE client_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            followers_count INTEGER NOT NULL,
            following_count INTEGER NOT NULL,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
    """)
    print("✅ Table 'client_metrics' créée")

if 'milestones' not in tables:
    print("\n✨ Création de la table 'milestones'...")
    cur.execute("""
        CREATE TABLE milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            completed BOOLEAN DEFAULT 0,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
    """)
    print("✅ Table 'milestones' créée")

conn.commit()
conn.close()

print("\n🎉 Base de données prête pour Agent C!")
