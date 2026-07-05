# 🔧 Fix : Problème de Sauvegarde Prospects & Connections

## 📋 Problèmes identifiés

### 1. ❌ Données perdues après reconnexion
**Cause** : Les données sont stockées dans `localStorage` du navigateur, qui peut être :
- Effacé automatiquement par le navigateur
- Supprimé lors du nettoyage des cookies
- Perdu si tu changes de navigateur
- Limité à 5-10 MB max

### 2. ❌ UI différente entre Prospect et Connection
**Cause** : Le modal Connection avait :
- Un champ "Connexions mutuelles" (retiré ✅)
- Une sélection de cercle en boutons (simplifié en dropdown ✅)

---

## ✅ Solutions appliquées

### 1. Harmonisation de l'UI ✅

**Avant** (Connection) :
- 3 gros boutons pour sélectionner le cercle (VIP/Keep/Watch)
- Champ "Connexions mutuelles" en nombre

**Après** (Connection) :
- Dropdown simple comme Prospect
- Champ "Connexions mutuelles" retiré
- UI identique à Prospect

### 2. Ajout de logs de debug ✅

Maintenant tu peux voir dans la console du navigateur (F12) :
```
🔍 [Prospects] Loading from localStorage: 3 prospects found
✅ [Prospects] Loaded successfully: 3 prospects
➕ [Prospects] Adding new prospect: {...}
💾 [Prospects] Saving to localStorage: 4 prospects
```

---

## 🚀 Solution permanente : Migration vers la base de données

### Pourquoi migrer ?
- ✅ **Persistance garantie** : Les données ne seront jamais perdues
- ✅ **Synchronisation** : Accessible depuis n'importe quel appareil
- ✅ **Pas de limite** : Stockage illimité
- ✅ **Backup automatique** : Sauvegarde serveur

### Plan de migration

#### Étape 1 : Ajouter les tables dans la base de données

```sql
-- Table prospects (déjà créée par agent_prospects.py)
CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    prospect_username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT CHECK(status IN ('cold', 'warm', 'hot', 'converted', 'lost')),
    follows_you BOOLEAN DEFAULT 0,
    you_follow BOOLEAN DEFAULT 0,
    sector TEXT,
    score INTEGER DEFAULT 0,
    converted BOOLEAN DEFAULT 0,
    converted_at DATETIME,
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table connections (déjà créée par agent_connections.py)
CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    connection_username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    circle TEXT CHECK(circle IN ('vip', 'keep', 'watch')),
    follows_you BOOLEAN DEFAULT 0,
    you_follow BOOLEAN DEFAULT 0,
    health_score INTEGER DEFAULT 0,
    follow_duration INTEGER DEFAULT 0,
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### Étape 2 : Créer les routes API

**Fichier** : `server/routes/prospects.py`
```python
from flask import Blueprint, request, jsonify
from server.db import get_db

prospects_bp = Blueprint('prospects', __name__)

@prospects_bp.route('/api/prospects', methods=['GET'])
def get_prospects():
    user_id = request.user_id  # From auth middleware
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM prospects WHERE user_id = ? ORDER BY added_at DESC
    """, (user_id,))
    prospects = cursor.fetchall()
    return jsonify(prospects)

@prospects_bp.route('/api/prospects', methods=['POST'])
def add_prospect():
    user_id = request.user_id
    data = request.json
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO prospects (
            user_id, prospect_username, display_name, status,
            follows_you, you_follow, sector, score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, data['instagramUsername'], data['displayName'],
        data['status'], data['followsYou'], data['youFollow'],
        data.get('sector'), data.get('score', 30)
    ))
    db.commit()
    return jsonify({'id': cursor.lastrowid}), 201

@prospects_bp.route('/api/prospects/<int:id>', methods=['PUT'])
def update_prospect(id):
    user_id = request.user_id
    data = request.json
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE prospects SET
            display_name = ?, status = ?, follows_you = ?,
            you_follow = ?, sector = ?, notes = ?
        WHERE id = ? AND user_id = ?
    """, (
        data['displayName'], data['status'], data['followsYou'],
        data['youFollow'], data.get('sector'), data.get('notes'),
        id, user_id
    ))
    db.commit()
    return jsonify({'success': True})

@prospects_bp.route('/api/prospects/<int:id>', methods=['DELETE'])
def delete_prospect(id):
    user_id = request.user_id
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM prospects WHERE id = ? AND user_id = ?", (id, user_id))
    db.commit()
    return jsonify({'success': True})
```

**Fichier** : `server/routes/connections.py`
```python
# Même structure que prospects.py mais pour connections
```

#### Étape 3 : Modifier le frontend

**Fichier** : `client/src/components/pro/ProDashboard.tsx`

```typescript
// Remplacer localStorage par des appels API

// AVANT
const [prospects, setProspects] = useState<Prospect[]>(() => {
  const saved = localStorage.getItem('pro-prospects');
  // ...
});

// APRÈS
const [prospects, setProspects] = useState<Prospect[]>([]);

useEffect(() => {
  // Charger depuis l'API
  fetch('/api/prospects', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(data => setProspects(data))
    .catch(err => console.error('Error loading prospects:', err));
}, []);

const handleAddProspect = async (newProspect: NewProspectData) => {
  try {
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newProspect)
    });
    const data = await res.json();
    
    // Ajouter au state local
    setProspects([...prospects, { ...newProspect, id: data.id }]);
  } catch (error) {
    console.error('Failed to add prospect:', error);
  }
};
```

---

## 🔍 Comment vérifier si tes données sont sauvegardées

### Méthode 1 : Console du navigateur

1. Ouvre la console (F12)
2. Va dans l'onglet "Application" ou "Storage"
3. Clique sur "Local Storage" → `http://localhost:5173`
4. Cherche les clés :
   - `pro-prospects`
   - `pro-connections`
5. Tu devrais voir tes données en JSON

### Méthode 2 : Console JavaScript

Dans la console (F12), tape :
```javascript
// Voir les prospects
console.log(JSON.parse(localStorage.getItem('pro-prospects')));

// Voir les connections
console.log(JSON.parse(localStorage.getItem('pro-connections')));

// Compter
console.log('Prospects:', JSON.parse(localStorage.getItem('pro-prospects'))?.length || 0);
console.log('Connections:', JSON.parse(localStorage.getItem('pro-connections'))?.length || 0);
```

---

## 🐛 Dépannage

### Problème : "Mes données ont disparu après fermeture du navigateur"

**Causes possibles** :
1. Mode navigation privée activé
2. Paramètres du navigateur qui effacent les données à la fermeture
3. Extension de nettoyage automatique (CCleaner, etc.)

**Solution temporaire** :
- Désactive le mode navigation privée
- Vérifie les paramètres de confidentialité du navigateur
- Désactive les extensions de nettoyage

**Solution permanente** :
- Migrer vers la base de données (voir plan ci-dessus)

### Problème : "Les données sont là mais ne s'affichent pas"

**Vérifications** :
1. Ouvre la console (F12)
2. Regarde les logs :
   ```
   🔍 [Prospects] Loading from localStorage: X prospects found
   ✅ [Prospects] Loaded successfully: X prospects
   ```
3. Si tu vois "No data" mais que les données sont dans localStorage :
   - Rafraîchis la page (Ctrl+R)
   - Vide le cache (Ctrl+Shift+R)

### Problème : "J'ai ajouté un prospect mais il n'apparaît pas"

**Vérifications** :
1. Regarde les logs dans la console :
   ```
   ➕ [Prospects] Adding new prospect: {...}
   💾 [Prospects] Saving to localStorage: X prospects
   ```
2. Si tu ne vois pas ces logs :
   - Le formulaire n'a pas été soumis correctement
   - Vérifie que tous les champs requis sont remplis

---

## 📊 Prochaines étapes recommandées

### Court terme (cette semaine)
1. ✅ Tester avec les logs de debug
2. ✅ Vérifier que les données persistent après refresh
3. ⚠️ Ne pas utiliser en mode navigation privée

### Moyen terme (prochaine semaine)
1. 🔜 Créer les routes API pour prospects
2. 🔜 Créer les routes API pour connections
3. 🔜 Migrer le frontend vers les API
4. 🔜 Tester la migration

### Long terme (dans 2 semaines)
1. 🔜 Ajouter un système de backup automatique
2. 🔜 Ajouter une synchronisation en temps réel
3. 🔜 Implémenter l'export/import de données

---

## 💡 Conseils

### Pour ne pas perdre tes données en attendant la migration

1. **Export manuel régulier** :
   ```javascript
   // Dans la console (F12)
   const prospects = localStorage.getItem('pro-prospects');
   const connections = localStorage.getItem('pro-connections');
   
   // Copie et sauvegarde dans un fichier texte
   console.log('PROSPECTS:', prospects);
   console.log('CONNECTIONS:', connections);
   ```

2. **Import manuel si perte** :
   ```javascript
   // Dans la console (F12)
   localStorage.setItem('pro-prospects', 'COLLE_TES_DONNEES_ICI');
   localStorage.setItem('pro-connections', 'COLLE_TES_DONNEES_ICI');
   location.reload(); // Rafraîchir la page
   ```

3. **Utilise toujours le même navigateur** :
   - Les données sont liées au navigateur
   - Si tu changes de navigateur, les données ne suivent pas

---

**Dernière mise à jour** : 23 avril 2026
