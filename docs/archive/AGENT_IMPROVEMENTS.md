# 🔍 Améliorations des Agents Pro - Inspirées des Agents A & B

## 📋 Analyse des Bonnes Pratiques

Après analyse des **Agent A** et **Agent B**, voici les fonctionnalités intéressantes à intégrer dans les **Agents Pro**.

---

## ✅ Fonctionnalités Déjà Présentes dans Agents Pro

### 1. **Session Management**
- ✅ Chargement/sauvegarde des cookies
- ✅ Fichier de session séparé par agent
- ✅ Réutilisation de la session pour éviter les reconnexions

### 2. **Human-like Behavior**
- ✅ Délais aléatoires (`human_delay`)
- ✅ Slow motion dans Playwright
- ✅ User agent réaliste

### 3. **Error Handling**
- ✅ Try/catch sur les opérations critiques
- ✅ Logging détaillé
- ✅ Gestion des timeouts

---

## 🆕 Fonctionnalités à Ajouter aux Agents Pro

### 1. **Human Scroll** (Agent A - Ligne 135-140)
**Pourquoi** : Simule un comportement humain plus réaliste lors de la navigation

```python
async def human_scroll(page):
    """Scroll léger pour simuler un comportement humain."""
    scroll_amount = random.randint(100, 300)
    await page.mouse.wheel(0, scroll_amount)
    await asyncio.sleep(random.uniform(1, 3))
    log.debug(f"Scroll de {scroll_amount}px")
```

**Impact** : Réduit les risques de détection par Instagram

---

### 2. **Screenshots de Debug** (Agent A - Ligne 172-173)
**Pourquoi** : Aide au debugging quand un sélecteur échoue

```python
# Avant une action critique
await page.screenshot(path=f"debug_before_action_{username}.png")
log.info(f"Screenshot sauvegardé: debug_before_action_{username}.png")

# En cas d'erreur
except Exception as e:
    await page.screenshot(path="debug_error.png")
    log.error(f"Erreur: {e}, screenshot sauvegardé")
```

**Impact** : Facilite le debugging sans avoir à relancer l'agent

---

### 3. **Multiple Selectors Fallback** (Agent A - Ligne 176-197)
**Pourquoi** : Instagram change souvent ses sélecteurs CSS

```python
# Essayer différents sélecteurs
selectors = [
    'a[href$="/followers/"]',
    'a[href*="/followers/"]:not([href*="/following/"])',
    'button:has-text("followers")'
]

clicked = False
for selector in selectors:
    try:
        log.info(f"Tentative avec sélecteur: {selector}")
        element = page.locator(selector).first
        await element.click(timeout=5000)
        clicked = True
        log.info("Clic réussi")
        break
    except:
        continue

if not clicked:
    log.error("Aucun sélecteur n'a fonctionné")
    await page.screenshot(path="debug_selector_error.png")
    return []
```

**Impact** : Robustesse face aux changements d'Instagram

---

### 4. **Wait for Network Idle** (Agent A - Ligne 168)
**Pourquoi** : S'assure que la page est complètement chargée avant d'interagir

```python
# Attendre que la page soit complètement chargée
await page.wait_for_load_state('networkidle', timeout=10000)
await human_delay(2, 4)
```

**Impact** : Évite les erreurs de sélecteurs non trouvés

---

### 5. **Agent Heartbeat** (Agent A - Ligne 98-107, Agent B - Ligne 110-119)
**Pourquoi** : Permet de monitorer si les agents tournent correctement

```python
def update_agent_heartbeat(conn):
    """Met à jour le timestamp de dernière activité de l'agent."""
    if not AGENT_ID:
        return
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE agents
            SET last_check_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (AGENT_ID,))
    conn.commit()
```

**Impact** : Dashboard peut afficher l'état des agents (actif/inactif)

---

### 6. **Human Break** (Agent B - Ligne 147-150)
**Pourquoi** : Pause naturelle entre plusieurs profils pour éviter le rate limiting

```python
async def human_break(duration_min=2, duration_max=5):
    """Pause plus longue pour simuler une pause naturelle."""
    delay = random.uniform(duration_min * 60, duration_max * 60)
    log.info(f"Pause naturelle de {delay/60:.1f} minutes")
    await asyncio.sleep(delay)
```

**Impact** : Réduit drastiquement les risques de ban Instagram

---

### 7. **Max Profiles Per Session** (Agent A - Ligne 36)
**Pourquoi** : Limite le nombre de profils scrapés par session pour éviter la détection

```python
MAX_PROFILES_PER_SESSION = 5

# Dans la boucle principale
for idx, client in enumerate(clients[:MAX_PROFILES_PER_SESSION], 1):
    # Scraper le client
    ...
    
    # Pause entre chaque profil
    if idx < len(clients[:MAX_PROFILES_PER_SESSION]):
        await human_delay(8, 15)
```

**Impact** : Comportement plus humain, moins de risques

---

### 8. **Validation du Nombre de Followers** (Agent A - Ligne 152-163)
**Pourquoi** : Ne pas essayer de scraper plus de followers qu'il n'y en a réellement

```python
# Récupérer le nombre de followers affiché sur le profil
try:
    followers_text = await page.locator('a[href*="/followers/"]').first.text_content()
    import re
    match = re.search(r'(\d+)', followers_text)
    if match:
        actual_follower_count = int(match.group(1))
        log.info(f"Nombre de followers affiché: {actual_follower_count}")
        max_count = min(max_count, actual_follower_count)
except:
    log.warning("Impossible de récupérer le nombre de followers")
```

**Impact** : Évite les erreurs et les boucles infinies

---

### 9. **Event System** (Agent A - Ligne 86-95, Agent B - Ligne 44-58)
**Pourquoi** : Permet de déclencher des actions en cascade entre agents

```python
def create_event(conn, client_id, username, user_id, event_type, needs_check_b=False):
    """Crée un événement pour déclencher une action."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO events
                (client_id, target_username, target_user_id,
                 event_type, needs_check_b, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)
        """, (client_id, username, user_id, event_type, needs_check_b))
    conn.commit()
    log.info(f"Event créé : {event_type} — @{username}")
```

**Impact** : Coordination entre agents, workflows complexes

---

### 10. **Subprocess pour Déclencher d'Autres Agents** (Agent A - Ligne 302-308)
**Pourquoi** : Permet à un agent de lancer un autre agent automatiquement

```python
# Déclencher Agent B immédiatement
try:
    log.info("Déclenchement de Agent B...")
    subprocess.Popen(["python", "agent_b.py"], 
                    cwd=os.path.dirname(os.path.abspath(__file__)))
    log.info("Agent B lancé avec succès")
except Exception as e:
    log.error(f"Erreur lors du lancement de Agent B: {e}")
```

**Impact** : Automatisation complète, pas besoin d'intervention manuelle

---

## 🎯 Priorités d'Implémentation

### **Priorité 1 - Critique** (À implémenter immédiatement)
1. ✅ **Human Scroll** - Comportement plus humain
2. ✅ **Multiple Selectors Fallback** - Robustesse
3. ✅ **Wait for Network Idle** - Stabilité
4. ✅ **Screenshots de Debug** - Debugging

### **Priorité 2 - Important** (À implémenter cette semaine)
5. ⚠️ **Max Profiles Per Session** - Sécurité
6. ⚠️ **Human Break** - Anti-ban
7. ⚠️ **Validation du Nombre de Followers** - Fiabilité

### **Priorité 3 - Nice to Have** (À implémenter plus tard)
8. 📋 **Agent Heartbeat** - Monitoring
9. 📋 **Event System** - Coordination
10. 📋 **Subprocess Triggering** - Automatisation

---

## 📝 Plan d'Implémentation

### **Phase 1 : Stabilité & Robustesse** (Aujourd'hui)
- Ajouter `human_scroll()` dans les agents Pro
- Implémenter multiple selectors fallback
- Ajouter `wait_for_load_state('networkidle')`
- Ajouter screenshots de debug

### **Phase 2 : Sécurité Anti-Ban** (Demain)
- Limiter à 5 profils par session
- Ajouter des pauses naturelles (`human_break`)
- Valider le nombre de followers avant scraping

### **Phase 3 : Monitoring & Coordination** (Cette semaine)
- Créer table `agent_heartbeats`
- Implémenter système d'events
- Permettre aux agents de se déclencher mutuellement

---

## 🔧 Code à Ajouter

### Fichier : `agent_pro_clients.py` et `agent_pro_circle.py`

```python
# Ajouter après human_delay()

async def human_scroll(page):
    """Scroll léger pour simuler un comportement humain."""
    scroll_amount = random.randint(100, 300)
    await page.mouse.wheel(0, scroll_amount)
    await asyncio.sleep(random.uniform(1, 3))
    log.debug(f"Scroll de {scroll_amount}px")


async def human_break(duration_min=2, duration_max=5):
    """Pause plus longue pour simuler une pause naturelle."""
    delay = random.uniform(duration_min * 60, duration_max * 60)
    log.info(f"Pause naturelle de {delay/60:.1f} minutes")
    await asyncio.sleep(delay)


async def safe_click(page, selectors: list, description: str = "element"):
    """Essaie plusieurs sélecteurs jusqu'à ce qu'un fonctionne."""
    for selector in selectors:
        try:
            log.info(f"Tentative de clic sur {description} avec: {selector}")
            element = page.locator(selector).first
            await element.click(timeout=5000)
            log.info(f"✅ Clic réussi sur {description}")
            return True
        except:
            continue
    
    log.error(f"❌ Aucun sélecteur n'a fonctionné pour {description}")
    await page.screenshot(path=f"debug_{description}_error.png")
    return False


# Dans la fonction principale, ajouter :

MAX_PROFILES_PER_SESSION = 5

# Limiter le nombre de profils
clients_to_process = clients[:MAX_PROFILES_PER_SESSION]
log.info(f"Traitement de {len(clients_to_process)} clients sur {len(clients)} total")

for idx, client in enumerate(clients_to_process, 1):
    # ... scraping ...
    
    # Pause entre profils
    if idx < len(clients_to_process):
        await human_delay(8, 15)
    
    # Pause naturelle tous les 3 profils
    if idx % 3 == 0 and idx < len(clients_to_process):
        await human_break(2, 4)
```

---

## 📊 Résumé des Améliorations

| Fonctionnalité | Agent A | Agent B | Agent Pro | Priorité |
|----------------|---------|---------|-----------|----------|
| Session cookies | ✅ | ✅ | ✅ | - |
| Human delay | ✅ | ✅ | ✅ | - |
| Human scroll | ✅ | ❌ | ❌ | **P1** |
| Human break | ❌ | ✅ | ❌ | **P2** |
| Screenshots debug | ✅ | ❌ | ❌ | **P1** |
| Multiple selectors | ✅ | ❌ | ❌ | **P1** |
| Network idle | ✅ | ❌ | ❌ | **P1** |
| Max profiles/session | ✅ | ✅ | ❌ | **P2** |
| Agent heartbeat | ✅ | ✅ | ❌ | P3 |
| Event system | ✅ | ✅ | ❌ | P3 |
| Subprocess trigger | ✅ | ❌ | ❌ | P3 |

---

## 🎯 Prochaines Étapes

1. **Implémenter les fonctions de base** (human_scroll, safe_click, human_break)
2. **Limiter à 5 profils par session** pour la sécurité
3. **Ajouter screenshots de debug** pour faciliter le troubleshooting
4. **Tester avec un vrai compte** pour valider les améliorations

---

**Les agents Pro seront beaucoup plus robustes et sécurisés avec ces améliorations !** 🚀
