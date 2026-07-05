import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')
MIGRATION_FILE = os.path.join(os.path.dirname(__file__), 'migrations', 'add_pro_agent_tables.sql')

print("📊 Application des migrations pour les agents Pro...")

# Lire le fichier SQL
with open(MIGRATION_FILE, 'r', encoding='utf-8') as f:
    sql_script = f.read()

# Connexion à la base de données
conn = sqlite3.connect(DATABASE_PATH)
cur = conn.cursor()

try:
    # Exécuter le script SQL
    cur.executescript(sql_script)
    conn.commit()
    print("✅ Migrations appliquées avec succès!")
    
    # Vérifier les tables créées
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cur.fetchall()]
    
    print("\n📋 Tables dans la base de données:")
    for table in tables:
        print(f"  - {table}")
    
    print("\n🎉 Base de données prête pour les agents Pro!")
    
except Exception as e:
    print(f"❌ Erreur lors de l'application des migrations: {e}")
    conn.rollback()
finally:
    conn.close()
