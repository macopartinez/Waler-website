# 🔍 Test de Performance - Identification du problème

## 🎯 Objectif

Identifier quel élément ralentit l'expérience utilisateur.

---

## 🧪 Tests à effectuer

### Test 1 : Sans BackgroundWaler ✅ (ACTUEL)

**Configuration** :
```typescript
<RadarBackground />
{/* <BackgroundWaler /> */}
```

**À tester** :
- [ ] Naviguer entre les étapes
- [ ] Observer la fluidité
- [ ] Vérifier les FPS (F12 > Performance)

**Résultat attendu** : Si c'est fluide, le problème vient de BackgroundWaler

---

### Test 2 : Sans RadarBackground

**Configuration** :
```typescript
{/* <RadarBackground /> */}
<BackgroundWaler />
```

**À tester** :
- [ ] Naviguer entre les étapes
- [ ] Observer la fluidité
- [ ] Vérifier les FPS

**Résultat attendu** : Si c'est fluide, le problème vient de RadarBackground

---

### Test 3 : Sans les deux

**Configuration** :
```typescript
{/* <RadarBackground /> */}
{/* <BackgroundWaler /> */}
```

**À tester** :
- [ ] Naviguer entre les étapes
- [ ] Observer la fluidité
- [ ] Vérifier les FPS

**Résultat attendu** : Devrait être ultra-fluide (baseline)

---

### Test 4 : Avec les deux (original)

**Configuration** :
```typescript
<RadarBackground />
<BackgroundWaler />
```

**À tester** :
- [ ] Naviguer entre les étapes
- [ ] Observer la fluidité
- [ ] Vérifier les FPS

**Résultat attendu** : Identifier si le problème vient de l'interaction des deux

---

## 🔍 Autres éléments suspects

### 1. AnimatePresence + motion.div

**Code actuel** :
```typescript
<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={step}
    custom={direction}
    variants={slideVariants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
  >
```

**Problème potentiel** :
- Framer Motion peut être lourd
- Transition + canvas = double charge

**Test** :
```typescript
// Désactiver temporairement
<div className="flex flex-col items-center">
  {/* Contenu sans animation */}
</div>
```

---

### 2. Progress bar (18 éléments)

**Code actuel** :
```typescript
{Array.from({ length: TOTAL_STEPS }).map((_, i) => (
  <div
    key={i}
    className="h-1 rounded-full transition-all duration-500"
    style={{
      flex: i === step ? 2 : 1,
      backgroundColor: i <= step 
        ? (i <= QUESTIONNAIRE_END ? "#3b82f6" : "#02c950")
        : "rgba(255,255,255,0.1)",
    }}
  />
))}
```

**Problème potentiel** :
- 18 divs avec transition CSS
- Recalcul à chaque changement de step

**Test** :
```typescript
// Désactiver transition
className="h-1 rounded-full" // Sans transition-all
```

---

### 3. useEffect scroll

**Code actuel** :
```typescript
useEffect(() => {
  window.scrollTo({ top: 0, behavior: "instant" });
  topRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
}, [step]);
```

**Problème potentiel** :
- Double scroll (window + ref)
- Peut causer des reflows

**Test** :
```typescript
useEffect(() => {
  window.scrollTo({ top: 0, behavior: "instant" });
  // Commenter le second
}, [step]);
```

---

## 📊 Méthode de mesure

### Chrome DevTools

1. **Ouvrir DevTools** : F12
2. **Onglet Performance**
3. **Enregistrer** pendant 5 secondes
4. **Cliquer sur Continue** 2-3 fois
5. **Arrêter l'enregistrement**

### Métriques à vérifier

| Métrique | Bon | Moyen | Mauvais |
|----------|-----|-------|---------|
| FPS | 60 | 30-60 | <30 |
| Frame time | <16ms | 16-33ms | >33ms |
| GPU usage | <30% | 30-60% | >60% |
| CPU usage | <50% | 50-80% | >80% |

---

## 🎯 Solutions par problème

### Si BackgroundWaler est le coupable

**Solution 1** : Le désactiver complètement
```typescript
{/* <BackgroundWaler /> */}
```

**Solution 2** : Réduire encore plus
```typescript
const numSamples = 4; // Au lieu de 8
ctx.shadowBlur = 0; // Pas de blur du tout
```

**Solution 3** : Afficher uniquement sur desktop
```typescript
{window.innerWidth > 768 && <BackgroundWaler />}
```

---

### Si RadarBackground est le coupable

**Solution 1** : Réduire la vitesse
```typescript
waveSpeed: isMobile ? 40 : 60, // Au lieu de 60/80
```

**Solution 2** : Augmenter l'espacement
```typescript
waveSpacing: isMobile ? 180 : 240, // Au lieu de 120/180
```

**Solution 3** : Limiter le nombre d'ondes
```typescript
if (waves.length > 5) return; // Max 5 ondes
```

---

### Si Framer Motion est le coupable

**Solution 1** : Utiliser des transitions CSS simples
```typescript
<div 
  className="transition-opacity duration-200"
  style={{ opacity: 1 }}
>
```

**Solution 2** : Désactiver les animations
```typescript
transition={{ duration: 0 }} // Instant
```

**Solution 3** : Utiliser React Transition Group (plus léger)

---

### Si la progress bar est le coupable

**Solution 1** : Désactiver les transitions
```typescript
className="h-1 rounded-full" // Sans transition
```

**Solution 2** : Réduire la durée
```typescript
className="h-1 rounded-full transition-all duration-100"
```

**Solution 3** : Utiliser un seul élément
```typescript
<div className="h-1 bg-white/10 rounded-full">
  <div 
    className="h-1 bg-[#02c950] rounded-full"
    style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
  />
</div>
```

---

## ✅ Plan d'action

### Étape 1 : Identifier
1. Tester sans BackgroundWaler (ACTUEL)
2. Observer si c'est fluide
3. Noter les résultats

### Étape 2 : Confirmer
1. Tester sans RadarBackground
2. Tester sans les deux
3. Comparer les résultats

### Étape 3 : Optimiser
1. Appliquer la solution adaptée
2. Re-tester
3. Valider la fluidité

---

## 🚀 Configuration recommandée finale

Basé sur les tests, voici la config optimale :

### Option 1 : Performance maximale
```typescript
{/* Pas d'animations de fond */}
<div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0a] to-[#1a1a1a]" />
```

### Option 2 : Équilibre
```typescript
<RadarBackground /> {/* Uniquement le radar */}
```

### Option 3 : Visuel complet (si fluide)
```typescript
<RadarBackground />
<BackgroundWaler />
```

---

## 📝 Notes

**Test actuel** : BackgroundWaler désactivé

**Prochaine étape** : 
1. Tester la fluidité
2. Si fluide → BackgroundWaler est le problème
3. Si pas fluide → Tester sans RadarBackground

**Objectif** : 60 FPS constant sans lag perceptible
