import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'server', 'waler.db')

if not os.path.exists(db_path):
    print(f"❌ Database not found at: {db_path}")
else:
    print(f"✅ Database found at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    
    print("\n📋 Tables in database:")
    for table in tables:
        print(f"  - {table[0]}")
        
        # Get table schema
        cursor.execute(f"PRAGMA table_info({table[0]})")
        columns = cursor.fetchall()
        print(f"    Columns:")
        for col in columns:
            print(f"      {col[1]} ({col[2]})")
    
    conn.close()
