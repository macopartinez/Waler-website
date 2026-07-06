import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, TrendingUp, Award, Search, Target, Network, Settings, CheckCircle, Crown, Star, Eye, Sparkles, Heart, MessageCircle, Download, Flame, Thermometer, Snowflake } from "lucide-react";
import { fallbackAvatar } from "@/lib/utils";
import { PersonCard } from "./PersonCard";
import { AddPersonModal, NewPersonData } from "./AddPersonModal";
import { PersonDetailView } from "./PersonDetailView";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/hooks/use-auth";
import { AnalyzingOverlay } from "./AnalyzingOverlay";
import { ProTutorial, PRO_TUTORIAL_STORAGE_KEY } from "./ProTutorial";
import { KeywordManager } from "./KeywordManager";
import { Person, PersonTag, ProspectStatus, Circle, AnalysisStatus, Temperature, isProspect, isInCircle, temperatureRank, getEffectiveTemperature } from "./types";
import { exportPeopleSummaryToPDF } from "../../utils/pdfExport";
import type { InstagramAccount } from "@/hooks/use-accounts";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

interface ProDashboardProps {
  /** Comptes Instagram du login (owner + comptes liés). */
  accounts: InstagramAccount[];
  /** Compte actif sélectionné en haut du dashboard. */
  activeAccountId: number | null;
  /** Bascule le compte actif (synchronise le sélecteur du haut). */
  onAccountChange: (accountId: number) => void;
}

export function ProDashboard({ accounts, activeAccountId, onAccountChange }: ProDashboardProps) {
  const { t } = useLanguage();
  const { user: authUser, logout } = useAuth();
  // Filtre de compte de la vue People : 'all' = tous les comptes, sinon l'id.
  const [peopleAccountFilter, setPeopleAccountFilter] = useState<number | 'all'>(activeAccountId ?? 'all');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | PersonTag>('all');
  // Filtre « ressenti » (température effective) — se combine avec le filtre par tag.
  const [tempFilter, setTempFilter] = useState<'all' | Temperature>('all');
  const [analyzingPerson, setAnalyzingPerson] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => {
    return !localStorage.getItem(PRO_TUTORIAL_STORAGE_KEY);
  });

  // People state with migration from old localStorage
  const [people, setPeople] = useState<Person[]>(() => {
    // Check if we already have migrated data
    const savedPeople = localStorage.getItem('pro-people');
    if (savedPeople) {
      try {
        const parsed = JSON.parse(savedPeople);
        const loaded = parsed.map((p: any) => ({
          ...p,
          addedAt: new Date(p.addedAt),
          convertedAt: p.convertedAt ? new Date(p.convertedAt) : undefined,
          lastActivity: p.lastActivity ? new Date(p.lastActivity) : undefined,
          signals: p.signals.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }))
        }));
        console.log('✅ [People] Loaded from localStorage:', loaded.length, 'people');
        return loaded;
      } catch (e) {
        console.error('❌ [People] Error loading:', e);
      }
    }

    // Migration: merge old prospects and connections
    console.log('🔄 [People] Migrating from old localStorage...');
    const migratedPeople: Person[] = [];
    const usernameMap = new Map<string, Person>();

    // Migrate prospects
    const oldProspects = localStorage.getItem('pro-prospects');
    if (oldProspects) {
      try {
        const prospects = JSON.parse(oldProspects);
        console.log(`📥 Migrating ${prospects.length} prospects...`);
        prospects.forEach((p: any) => {
          const person: Person = {
            id: p.id,
            instagramUsername: p.instagramUsername,
            displayName: p.displayName,
            followsYou: p.followsYou,
            youFollow: p.youFollow,
            addedAt: new Date(p.addedAt),
            notes: p.notes || '',
            signals: p.signals.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) })),
            sector: p.sector,
            tags: ['prospect'],
            prospectStatus: p.status,
            score: p.score,
            converted: p.converted,
            convertedAt: p.convertedAt ? new Date(p.convertedAt) : undefined
          };
          usernameMap.set(p.instagramUsername.toLowerCase(), person);
        });
      } catch (e) {
        console.error('Error migrating prospects:', e);
      }
    }

    // Migrate connections
    const oldConnections = localStorage.getItem('pro-connections');
    if (oldConnections) {
      try {
        const connections = JSON.parse(oldConnections);
        console.log(`📥 Migrating ${connections.length} connections...`);
        connections.forEach((c: any) => {
          const username = c.instagramUsername.toLowerCase();
          const existing = usernameMap.get(username);
          
          if (existing) {
            // Merge: add circle tag
            existing.tags.push(c.circle);
            existing.circle = c.circle;
            existing.healthScore = c.healthScore;
            existing.followDuration = c.followDuration;
            existing.lastActivity = c.lastActivity ? new Date(c.lastActivity) : undefined;
            existing.mutualConnections = c.mutualConnections;
          } else {
            // New person
            const person: Person = {
              id: c.id,
              instagramUsername: c.instagramUsername,
              displayName: c.displayName,
              followsYou: c.followsYou,
              youFollow: c.youFollow,
              addedAt: new Date(c.addedAt),
              notes: c.notes || '',
              signals: c.signals.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) })),
              tags: [c.circle],
              circle: c.circle,
              healthScore: c.healthScore,
              followDuration: c.followDuration,
              lastActivity: c.lastActivity ? new Date(c.lastActivity) : undefined,
              mutualConnections: c.mutualConnections
            };
            usernameMap.set(username, person);
          }
        });
      } catch (e) {
        console.error('Error migrating connections:', e);
      }
    }

    const migrated = Array.from(usernameMap.values());
    console.log(`✅ [People] Migration complete: ${migrated.length} people`);
    
    // Save migrated data
    if (migrated.length > 0) {
      localStorage.setItem('pro-people', JSON.stringify(migrated));
    }
    
    return migrated;
  });

  // Suggestions de People (engageurs récurrents non encore suivis).
  const [suggestions, setSuggestions] = useState<Array<{ username: string; postsCount: number; liked: boolean; commented: boolean; accountId: number; accountUsername: string }>>([]);

  useEffect(() => {
    console.log('💾 [People] Saving to localStorage:', people.length, 'people');
    localStorage.setItem('pro-people', JSON.stringify(people));
  }, [people]);

  // Hybride : quand l'utilisateur change de compte via le sélecteur du haut, on
  // aligne le filtre People sur ce compte (et inversement, cliquer un chip de
  // compte ci-dessous met aussi à jour le sélecteur du haut via onAccountChange).
  useEffect(() => {
    if (activeAccountId != null) setPeopleAccountFilter(activeAccountId);
  }, [activeAccountId]);

  // Migration : les People ajoutées avant le multi-compte n'ont pas d'accountId.
  // On les rattache au compte principal dès que la liste des comptes est connue,
  // pour qu'elles restent visibles et filtrables proprement.
  useEffect(() => {
    if (!accounts.length) return;
    const owner = accounts.find((a) => a.isOwner) ?? accounts[0];
    setPeople((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.accountId == null) {
          changed = true;
          return { ...p, accountId: owner.id, accountUsername: owner.username };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [accounts]);

  // Synchronise les stats d'engagement (likes/commentaires collectés par
  // l'extension → circle_members) dans les People affichées. Exposé en
  // useCallback pour pouvoir être déclenché à la demande (fin d'analyse) en plus
  // du poll régulier, et supprimer le « tour de retard ».
  const syncStats = useCallback(async () => {
      try {
        // Scoper les stats au compte affiché (résolu par username côté serveur),
        // pour rester cohérent avec le compte choisi à l'ajout des personnes.
        const activeUsername = accounts.find((a) => a.id === activeAccountId)?.username;
        const url = activeUsername
          ? `/api/pro/circle-stats?accountUsername=${encodeURIComponent(activeUsername)}`
          : '/api/pro/circle-stats';
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data?.success || !Array.isArray(data.stats)) return;

        const byUser = new Map<string, any>();
        data.stats.forEach((s: any) => byUser.set(String(s.username || '').toLowerCase(), s));

        setPeople((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            const s = byUser.get(p.instagramUsername.toLowerCase());
            if (!s) return p;
            const signals = (s.signals || []).map((x: any) => ({
              type: x.type,
              timestamp: new Date(x.timestamp),
              description: x.description,
              postUrl: x.postUrl || undefined,
              keyword: x.keyword || undefined,
            }));
            const lastActivity = s.lastLikeGivenAt
              ? new Date(s.lastLikeGivenAt)
              : signals[0]?.timestamp || p.lastActivity;

            const engagementPattern = (s.engagementPattern || []).map((e: any) => ({
              postId: e.postId,
              postUrl: e.postUrl,
              liked: !!e.liked,
              commented: !!e.commented,
              keyword: e.keyword || undefined,
              timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
              gapBefore: e.gapBefore || 0,
            }));

            // Ne mettre à jour que si quelque chose a réellement changé (score,
            // nb de signaux, liens de post, durée de connexion, séquence streak,
            // ou température/conseils issus de l'analyse des conversations).
            const localWithUrl = (p.signals || []).filter((x: any) => x.postUrl).length;
            const backendWithUrl = signals.filter((x: any) => x.postUrl).length;
            const newTemperature = s.temperature || undefined;
            const newAdvice = Array.isArray(s.advice) ? s.advice : [];
            if (
              (p.score ?? 0) === (s.score ?? 0) &&
              (p.keywordHits ?? 0) === (s.keywordHits ?? 0) &&
              (p.signals?.length || 0) === signals.length &&
              localWithUrl === backendWithUrl &&
              (p.followDuration ?? 0) === (s.connectionDays ?? 0) &&
              (p.engagementPattern?.length || 0) === engagementPattern.length &&
              p.temperature === newTemperature &&
              (p.advice?.length || 0) === newAdvice.length &&
              (p.mutualConnectionsList?.length || 0) === (Array.isArray(s.mutualConnectionsList) ? s.mutualConnectionsList.length : 0) &&
              // Connection status collecté (booléen) : ne déclenche un changement
              // que s'il diffère ; null/undefined = non collecté → on n'écrase pas.
              (typeof s.followsYou !== 'boolean' || p.followsYou === s.followsYou) &&
              (typeof s.youFollow !== 'boolean' || p.youFollow === s.youFollow) &&
              p.settingPhase === (s.settingPhase || undefined) &&
              JSON.stringify(p.settingSummary ?? null) === JSON.stringify(s.settingSummary ?? null)
            ) {
              return p;
            }
            changed = true;
            return {
              ...p,
              score: s.score,
              keywordHits: s.keywordHits ?? p.keywordHits,
              mutualConnections: s.mutualConnections,
              mutualConnectionsList: Array.isArray(s.mutualConnectionsList) ? s.mutualConnectionsList : p.mutualConnectionsList,
              followsYou: typeof s.followsYou === 'boolean' ? s.followsYou : p.followsYou,
              youFollow: typeof s.youFollow === 'boolean' ? s.youFollow : p.youFollow,
              followDuration: s.connectionDays ?? p.followDuration,
              signals,
              engagementPattern,
              lastActivity,
              temperature: newTemperature,
              dynamics: s.dynamics || p.dynamics,
              advice: newAdvice,
              settingPhase: s.settingPhase || undefined,
              settingSummary: s.settingSummary || p.settingSummary,
              lastAnalyzedAt: new Date(),
            };
          });
          return changed ? next : prev;
        });
      } catch {
        /* best-effort */
      }
  }, [accounts, activeAccountId]);

  // Poll régulier (reflète un run terminé même dashboard déjà ouvert).
  useEffect(() => {
    syncStats();
    const id = setInterval(syncStats, 15000);
    return () => clearInterval(id);
  }, [syncStats]);

  // La fiche ouverte (selectedPerson) est un état séparé de `people` : syncStats
  // ne met à jour que `people`. Sans ça, une fiche ouverte n'affiche pas les
  // données fraîchement collectées (connection status, mutuals, score…) tant
  // qu'on ne la rouvre pas. On la re-synchronise sur l'entrée correspondante de
  // `people` dès que la liste change (même id → on reprend la version à jour).
  useEffect(() => {
    setSelectedPerson((cur) => {
      if (!cur) return cur;
      const updated = people.find((p) => p.id === cur.id);
      return updated && updated !== cur ? updated : cur;
    });
  }, [people]);

  // Temps réel : l'extension (via auth-listener) pousse WALER_REFRESH_PRO_STATS
  // dès qu'une analyse Pro est persistée → refetch immédiat (pas d'attente du poll).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'WALER_REFRESH_PRO_STATS') {
        console.log('🔄 [ProDashboard] Refresh temps réel des stats Pro');
        syncStats();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [syncStats]);

  const handleAddPerson = async (newPerson: NewPersonData) => {
    const tags: PersonTag[] = [];
    if (newPerson.isProspect) tags.push('prospect');
    if (newPerson.isInCircle && newPerson.circle) tags.push(newPerson.circle);

    const person: Person = {
      id: Date.now().toString(),
      instagramUsername: newPerson.instagramUsername,
      displayName: newPerson.displayName,
      accountId: newPerson.accountId,
      accountUsername: newPerson.accountUsername,
      followsYou: newPerson.followsYou,
      youFollow: newPerson.youFollow,
      addedAt: new Date(),
      notes: '',
      signals: [],
      sector: newPerson.sector,
      tags,
      prospectStatus: newPerson.prospectStatus,
      circle: newPerson.circle,
      score: newPerson.isProspect ? calculateInitialScore(newPerson) : undefined,
      healthScore: newPerson.isInCircle ? calculateInitialHealthScore(newPerson) : undefined,
      followDuration: 0,
      analysisStatus: 'analyzing'
    };

    console.log('➕ [People] Adding new person:', person);
    setPeople([...people, person]);
    setShowAddPerson(false);

    // L'analyse d'engagement (likes/commentaires) est désormais lancée depuis
    // l'extension Chrome (bouton « Analyser l'engagement » de la section Pro),
    // qui collecte les données et appelle /api/extension/pro-engagement.

    setAnalyzingPerson(newPerson.instagramUsername);
    
    try {
      const response = await fetch('/api/pro/analyze-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          instagramUsername: newPerson.instagramUsername,
          // Rattache la personne au compte choisi (pas au compte de session ext.).
          accountUsername: newPerson.accountUsername,
          // Provenance (suggestion vs ajout manuel) — stockée en métadonnée.
          fromSuggestion: !!newPerson.fromSuggestion,
        })
      });

      if (response.ok) {
        console.log('🔍 Analysis started for', newPerson.instagramUsername);
        startPollingAnalysis(person.id, newPerson.instagramUsername, newPerson.accountUsername);
      } else {
        console.error('Analyse non démarrée, statut HTTP', response.status);
        setAnalyzingPerson((current) =>
          current === newPerson.instagramUsername ? null : current
        );
        setPeople((prev) =>
          prev.map((p) => (p.id === person.id ? { ...p, analysisStatus: 'failed' } : p))
        );
      }
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setAnalyzingPerson((current) =>
        current === newPerson.instagramUsername ? null : current
      );
      setPeople((prev) =>
        prev.map((p) => (p.id === person.id ? { ...p, analysisStatus: 'failed' } : p))
      );
    }
  };

  // ===== Suggestions de People =====
  const loadSuggestions = async () => {
    try {
      const resp = await fetch('/api/pro/people-suggestions', { credentials: 'include' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.success && Array.isArray(data.suggestions)) {
        // Exclure celles déjà présentes localement, PAR COMPTE (une même personne
        // peut être People sur un compte et suggestion sur un autre).
        const known = new Set(
          people.map((p) => `${p.accountId}:${p.instagramUsername.toLowerCase()}`),
        );
        setSuggestions(
          data.suggestions.filter(
            (s: any) => !known.has(`${s.accountId}:${String(s.username).toLowerCase()}`),
          ),
        );
      }
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    loadSuggestions();
    const id = setInterval(loadSuggestions, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissSuggestion = async (username: string, accountId: number) => {
    setSuggestions((prev) =>
      prev.filter((s) => !(s.username === username && s.accountId === accountId)),
    );
    try {
      await fetch('/api/pro/people-suggestions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, accountId }),
      });
    } catch {
      /* best-effort */
    }
  };

  const addSuggestionToPeople = async (username: string, accountId: number) => {
    setSuggestions((prev) =>
      prev.filter((s) => !(s.username === username && s.accountId === accountId)),
    );
    // Rattache la suggestion au compte d'où provient l'engagement.
    const account =
      accounts.find((a) => a.id === accountId) ||
      accounts.find((a) => a.isOwner) ||
      accounts[0];
    await handleAddPerson({
      instagramUsername: username,
      displayName: username,
      followsYou: false,
      youFollow: false,
      isProspect: true,
      isInCircle: false,
      prospectStatus: 'cold',
      accountId: account?.id ?? 0,
      accountUsername: account?.username ?? '',
      fromSuggestion: true,
    } as NewPersonData);
  };

  const calculateInitialScore = (data: NewPersonData): number => {
    let score = 30;
    if (data.followsYou) score += 30;
    if (data.youFollow) score += 10;
    if (data.prospectStatus === 'hot') score += 20;
    if (data.prospectStatus === 'warm') score += 10;
    return Math.min(score, 100);
  };

  const calculateInitialHealthScore = (data: NewPersonData): number => {
    let score = 50;
    if (data.followsYou && data.youFollow) score += 30;
    else if (data.followsYou) score += 15;
    else if (data.youFollow) score += 10;
    return Math.min(score, 100);
  };

  const handleUpdatePerson = (updated: Person) => {
    console.log('📝 handleUpdatePerson called:', updated.displayName, updated.prospectStatus, updated.circle, updated.converted);
    setPeople(people.map(p => p.id === updated.id ? updated : p));
    // Also update selectedPerson to reflect changes
    setSelectedPerson(updated);
  };

  // Renomme le pseudo Instagram d'une personne. Comme l'analyse backend
  // (circle_members, contact_scores) est indexée PAR USERNAME, l'ancien pseudo
  // ne pointe plus sur rien : on re-clé la fiche (nouvel id), on purge les champs
  // dérivés de l'ancienne analyse, puis on relance l'analyse sous le nouveau pseudo.
  const handleRenamePerson = async (personId: string, rawUsername: string) => {
    const newUsername = rawUsername.trim().replace(/^@+/, '');
    const target = people.find((p) => p.id === personId);
    if (!target || !newUsername) return;
    if (newUsername.toLowerCase() === target.instagramUsername.toLowerCase()) return;

    // Pas de doublon d'identité dans le réseau.
    const clash = people.find(
      (p) => p.id !== personId && p.instagramUsername.toLowerCase() === newUsername.toLowerCase()
    );
    if (clash) {
      alert(interpolate(t.proDashboard.errors.alreadyInNetwork, { username: newUsername }));
      return;
    }

    const newId = Date.now().toString();
    const renamed: Person = {
      ...target,
      id: newId,
      instagramUsername: newUsername,
      // Données d'analyse caduques (indexées par l'ancien pseudo).
      signals: [],
      engagementPattern: undefined,
      dynamics: undefined,
      advice: undefined,
      temperature: undefined,
      settingPhase: undefined,
      settingSummary: undefined,
      lastAnalyzedAt: undefined,
      analysisStatus: 'analyzing',
    };
    setPeople((prev) => prev.map((p) => (p.id === personId ? renamed : p)));
    setSelectedPerson((cur) => (cur && cur.id === personId ? renamed : cur));

    // Relance l'analyse sous le nouveau pseudo (re-clé côté backend).
    setAnalyzingPerson(newUsername);
    try {
      const response = await fetch('/api/pro/analyze-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          instagramUsername: newUsername,
          accountUsername: target.accountUsername,
        }),
      });
      if (response.ok) {
        startPollingAnalysis(newId, newUsername, target.accountUsername);
      } else {
        setAnalyzingPerson((c) => (c === newUsername ? null : c));
        setPeople((prev) => prev.map((p) => (p.id === newId ? { ...p, analysisStatus: 'failed' } : p)));
      }
    } catch (error) {
      console.error('Failed to start analysis after rename:', error);
      setAnalyzingPerson((c) => (c === newUsername ? null : c));
      setPeople((prev) => prev.map((p) => (p.id === newId ? { ...p, analysisStatus: 'failed' } : p)));
    }
  };

  const startPollingAnalysis = (personId: string, username: string, accountUsername?: string) => {
    // Interroge le statut d'analyse côté serveur (circle_members.analysis_status)
    // et ferme l'overlay « Analyse en cours » dès que l'analyse est terminée,
    // a échoué, ou au bout d'un délai de sécurité (pour ne jamais rester figé).
    const POLL_INTERVAL_MS = 3000;
    const MAX_ATTEMPTS = 30; // ~90 s avant fermeture de sécurité
    let attempts = 0;

    const finish = (status: AnalysisStatus) => {
      clearInterval(timer);
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, analysisStatus: status } : p))
      );
      // Ne fermer l'overlay que s'il concerne toujours cette personne.
      setAnalyzingPerson((current) => (current === username ? null : current));
    };

    const timer = setInterval(async () => {
      attempts++;
      try {
        const statusUrl =
          `/api/pro/person-analysis-status/${encodeURIComponent(username)}` +
          (accountUsername ? `?accountUsername=${encodeURIComponent(accountUsername)}` : '');
        const resp = await fetch(statusUrl, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.status === 'completed') {
            console.log('✅ Analyse terminée pour', username);
            finish('completed');
            // Refetch immédiat des stats (advice/setting/dynamics/mutuelles) au
            // lieu d'attendre le prochain poll de 15 s.
            syncStats();
            return;
          }
          if (data?.status === 'failed') {
            console.log('❌ Analyse échouée pour', username);
            finish('failed');
            return;
          }
        }
      } catch (error) {
        console.error('Polling analyse échoué:', error);
      }

      // Délai de sécurité : on ferme l'overlay même si l'extension n'a pas encore
      // livré les données d'engagement (l'analyse continue en arrière-plan et le
      // poll de /api/pro/circle-stats mettra les People à jour plus tard).
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('⏱️ Délai d\'analyse dépassé pour', username, '— fermeture de l\'overlay');
        finish('pending');
      }
    }, POLL_INTERVAL_MS);
  };

  const handleDeletePerson = async (id: string) => {
    const person = people.find(p => p.id === id);
    // Retrait optimiste de l'UI + localStorage.
    setPeople(people.filter(p => p.id !== id));
    setSelectedPerson(null);

    // Suppression côté serveur (circle_members), sinon l'extension — qui lit
    // GET /api/extension/people — continue d'afficher la personne.
    if (person?.instagramUsername) {
      try {
        await fetch('/api/pro/delete-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            instagramUsername: person.instagramUsername,
            accountUsername: person.accountUsername,
          }),
        });
      } catch (e) {
        console.error('❌ [People] Suppression serveur échouée:', e);
      }
    }
  };

  // Sous-ensemble des People rattachées au compte filtré (base de tous les
  // calculs de la vue People : grille, stats, compteurs de chips).
  const accountPeople = peopleAccountFilter === 'all'
    ? people
    : people.filter(p => p.accountId === peopleAccountFilter);

  // Suggestions filtrées par le compte sélectionné (mêmes règles que la grille
  // People) : une suggestion n'apparaît que sur le compte où l'engagement a eu
  // lieu, jamais sur les autres.
  const accountSuggestions = peopleAccountFilter === 'all'
    ? suggestions
    : suggestions.filter(s => s.accountId === peopleAccountFilter);

  // Filter people by active filter (MUST BE BEFORE EARLY RETURNS)
  const filteredPeople = accountPeople
    .filter(person => {
      // Apply tag filter
      if (activeFilter !== 'all' && !person.tags.includes(activeFilter)) {
        return false;
      }

      // Apply temperature (ressenti) filter
      if (tempFilter !== 'all' && getEffectiveTemperature(person) !== tempFilter) {
        return false;
      }

      // Apply search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          person.displayName.toLowerCase().includes(query) ||
          person.instagramUsername.toLowerCase().includes(query) ||
          (person.sector && person.sector.toLowerCase().includes(query))
        );
      }

      return true;
    })
    // Re-classement par priorité d'action : température (🔥 chaud d'abord),
    // puis score de relation décroissant en départage.
    .sort((a, b) => {
      const tr = temperatureRank(a.temperature) - temperatureRank(b.temperature);
      if (tr !== 0) return tr;
      return (b.score ?? 0) - (a.score ?? 0);
    });

  // People stats (dynamic based on filter) - MUST BE BEFORE EARLY RETURNS
  const getFilteredStats = () => {
    const filtered = activeFilter === 'all' ? accountPeople : accountPeople.filter(p => p.tags.includes(activeFilter));
    
    const totalPeople = filtered.length;
    const prospects = filtered.filter(p => p.tags.includes('prospect'));
    const vipPeople = filtered.filter(p => p.tags.includes('vip'));
    const mutualPeople = filtered.filter(p => p.followsYou && p.youFollow);
    const convertedPeople = filtered.filter(p => p.converted);
    
    const avgScore = prospects.length > 0
      ? Math.round(prospects.reduce((sum, p) => sum + (p.score || 0), 0) / prospects.length)
      : 0;
    
    const avgHealthScore = filtered.filter(p => p.healthScore !== undefined).length > 0
      ? Math.round(filtered.reduce((sum, p) => sum + (p.healthScore || 0), 0) / filtered.filter(p => p.healthScore !== undefined).length)
      : 0;

    return {
      totalPeople,
      prospects: prospects.length,
      vipPeople: vipPeople.length,
      mutualPeople: mutualPeople.length,
      convertedPeople: convertedPeople.length,
      conversionRate: prospects.length > 0 ? Math.round((convertedPeople.length / prospects.length) * 100) : 0,
      avgScore,
      avgHealthScore
    };
  };

  const stats = getFilteredStats();

  // Export PDF : résumé global de la section People (réseau complet, indépendant
  // de la recherche). Respecte le filtre par tag actif pour cadrer le rapport.
  const handleExportPeopleSummary = () => {
    const source = activeFilter === 'all' ? accountPeople : accountPeople.filter(p => p.tags.includes(activeFilter));

    const prospects = source.filter(isProspect);
    const prospectsByStatus = {
      hot: prospects.filter(p => p.prospectStatus === 'hot').length,
      warm: prospects.filter(p => p.prospectStatus === 'warm').length,
      cold: prospects.filter(p => p.prospectStatus === 'cold').length,
      converted: source.filter(p => p.converted).length,
      lost: prospects.filter(p => p.prospectStatus === 'lost').length,
    };

    const circleLabel: Record<Circle, string> = { vip: t.personBadges.vip, keep: t.personBadges.keep, watch: t.personBadges.watch };
    const statusLabel: Record<ProspectStatus, string> = {
      hot: t.personBadges.hot, warm: t.personBadges.warm, cold: t.personBadges.cold, converted: t.personBadges.converted, lost: t.personBadges.lost,
    };
    const filterLabel: Record<'all' | PersonTag, string> = {
      all: t.proDashboard.filters.all, prospect: t.proDashboard.filters.prospectsFilter, vip: t.personBadges.vip, keep: t.personBadges.keep,
      watch: t.personBadges.watch, converted: t.personBadges.converted,
    };

    const rows = source.map((p) => {
      const types: string[] = [];
      if (isProspect(p)) types.push(t.personBadges.prospect);
      if (isInCircle(p) && p.circle) types.push(circleLabel[p.circle]);

      const statusParts: string[] = [];
      if (p.prospectStatus) statusParts.push(statusLabel[p.prospectStatus]);
      if (p.converted) statusParts.push(t.personBadges.converted);

      const connection =
        p.followsYou && p.youFollow ? t.personDetailView.connection.mutual :
        p.followsYou ? t.personDetailView.connection.followsYou :
        p.youFollow ? t.personDetailView.connection.youFollow : t.personDetailView.connection.none;

      return {
        displayName: p.displayName,
        username: p.instagramUsername,
        type: types.length > 0 ? types.join(' · ') : '—',
        status: statusParts.length > 0 ? Array.from(new Set(statusParts)).join(' · ') : '—',
        score: p.healthScore ?? p.score ?? 0,
        connection,
      };
    });

    exportPeopleSummaryToPDF({
      filterLabel: filterLabel[activeFilter],
      stats: {
        totalPeople: source.length,
        prospects: prospects.length,
        convertedPeople: prospectsByStatus.converted,
        conversionRate: prospects.length > 0 ? Math.round((prospectsByStatus.converted / prospects.length) * 100) : 0,
        vip: source.filter(p => p.tags.includes('vip')).length,
        keep: source.filter(p => p.tags.includes('keep')).length,
        watch: source.filter(p => p.tags.includes('watch')).length,
        avgScore: stats.avgScore,
        avgHealthScore: stats.avgHealthScore,
      },
      prospectsByStatus,
      rows,
      labels: {
        subtitleLine: (filter: string, count: number, date: string) => interpolate(t.proDashboard.pdfExport.subtitleLine, { filter, count, date }),
        overview: t.proDashboard.pdfExport.overview,
        totalPeopleLabel: t.proDashboard.stats.totalPeople,
        prospectsLabel: t.proDashboard.stats.prospects,
        convertedHint: (count: number, rate: number) => interpolate(t.proDashboard.stats.convertedSuffix, { count, rate }),
        averageScore: t.proDashboard.pdfExport.averageScore,
        averageScoreHint: t.proDashboard.stats.prospects,
        averageHealth: t.proDashboard.pdfExport.averageHealth,
        averageHealthHint: t.proDashboard.stats.networkQuality,
        breakdownByCircle: t.proDashboard.pdfExport.breakdownByCircle,
        vipLabel: t.personBadges.vip,
        circle1: t.proDashboard.pdfExport.circle1,
        keepLabel: t.personBadges.keep,
        circle2: t.proDashboard.pdfExport.circle2,
        watchLabel: t.personBadges.watch,
        circle3: t.proDashboard.pdfExport.circle3,
        convertedLabel: t.personBadges.converted,
        percentOfProspects: (rate: number) => interpolate(t.proDashboard.pdfExport.percentOfProspects, { rate }),
        prospectsByStatus: t.proDashboard.pdfExport.prospectsByStatus,
        hotLabel: t.personBadges.hot,
        warmLabel: t.personBadges.warm,
        coldLabel: t.personBadges.cold,
        lostLabel: t.personBadges.lost,
        peopleDetails: t.proDashboard.pdfExport.peopleDetails,
        table: t.proDashboard.pdfExport.table,
        noPeopleToDisplay: t.proDashboard.pdfExport.noPeopleToDisplay,
        generatedBy: (date: string) => interpolate(t.common.pdfExport.generatedBy, { date }),
      },
    });
  };

  // NOW we can do early returns - ALL HOOKS HAVE BEEN CALLED
  console.log('🔍 ProDashboard render - selectedPerson:', selectedPerson ? selectedPerson.displayName : 'null');

  if (selectedPerson) {
    console.log('👤 EARLY RETURN - Rendering PersonDetailView for:', selectedPerson.displayName, selectedPerson);
    return (
      <div className="w-full h-full">
        <PersonDetailView
          person={selectedPerson}
          onBack={() => {
            console.log('🔙 PersonDetailView onBack called');
            setSelectedPerson(null);
          }}
          onUpdate={handleUpdatePerson}
          onRename={(newUsername) => handleRenamePerson(selectedPerson.id, newUsername)}
          onDelete={() => handleDeletePerson(selectedPerson.id)}
        />
      </div>
    );
  }

  console.log('📊 Rendering main dashboard');

  return (
    <div className="min-h-screen text-white relative z-10">
      {/* Main Content */}
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header + actions principales (alignées à droite) */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-4xl font-display font-black mb-2">{t.proDashboard.header.title}</h1>
              <p className="text-gray-400">
                {t.proDashboard.header.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowAddPerson(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all"
              >
                <UserPlus className="w-5 h-5" />
                {t.proDashboard.header.addPerson}
              </button>
              {people.length > 0 && (
                <button
                  onClick={handleExportPeopleSummary}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
                  title={t.proDashboard.header.exportPdfTooltip}
                >
                  <Download className="w-5 h-5" />
                  {t.proDashboard.header.exportPdf}
                </button>
              )}
            </div>
          </div>

          {/* Stats Overview — vue d'ensemble en tête */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-black/80 backdrop-blur-sm bg-gradient-to-br from-purple-500/20 to-purple-500/10 border-2 border-purple-500/30 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/30 flex items-center justify-center">
                      <Network className="w-5 h-5 text-purple-300" />
                    </div>
                    <span className="text-sm text-gray-300 font-semibold">
                      {activeFilter === 'all' ? t.proDashboard.stats.totalPeople : t.proDashboard.stats.filtered}
                    </span>
                  </div>
                  <p className="text-4xl font-black text-white">{stats.totalPeople}</p>
                </div>

                <div className="bg-black/80 backdrop-blur-sm bg-gradient-to-br from-green-500/20 to-green-500/10 border-2 border-green-500/30 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-green-500/30 flex items-center justify-center">
                      <Target className="w-5 h-5 text-green-300" />
                    </div>
                    <span className="text-sm text-gray-300 font-semibold">{t.proDashboard.stats.prospects}</span>
                  </div>
                  <p className="text-4xl font-black text-white">{stats.prospects}</p>
                  <span className="text-xs text-gray-400">
                    {interpolate(t.proDashboard.stats.convertedSuffix, { count: stats.convertedPeople, rate: stats.conversionRate })}
                  </span>
                </div>

                <div className="bg-black/80 backdrop-blur-sm bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 border-2 border-yellow-500/30 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/30 flex items-center justify-center">
                      <Award className="w-5 h-5 text-yellow-300" />
                    </div>
                    <span className="text-sm text-gray-300 font-semibold">{t.proDashboard.stats.vipCircle}</span>
                  </div>
                  <p className="text-4xl font-black text-white">{stats.vipPeople}</p>
                  <span className="text-xs text-gray-400">{t.proDashboard.stats.max10}</span>
                </div>

                <div className="bg-black/80 backdrop-blur-sm bg-gradient-to-br from-blue-500/20 to-blue-500/10 border-2 border-blue-500/30 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/30 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-blue-300" />
                    </div>
                    <span className="text-sm text-gray-300 font-semibold">{t.proDashboard.stats.avgHealth}</span>
                  </div>
                  <p className="text-4xl font-black text-white">{stats.avgHealthScore}/100</p>
                  <span className="text-xs text-gray-400">{t.proDashboard.stats.networkQuality}</span>
                </div>
          </div>

          {/* Mots-clés de campagne : détecte les People qui commentent un mot-clé
              (signal d'intention) — scopé au compte affiché. */}
          <KeywordManager
            accountUsername={
              accounts.find((a) => a.id === (peopleAccountFilter !== 'all' ? peopleAccountFilter : activeAccountId))?.username
            }
          />

          {/* Panneau de contrôle : recherche + filtres regroupés dans une seule carte */}
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-4 mb-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.proDashboard.search.placeholder}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-black/60 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>

            {/* Filtres */}
            <div className="space-y-3 border-t border-white/10 pt-4">
                {/* Account Filter — synchronisé avec le sélecteur du haut */}
                {accounts.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mr-1">
                {t.proDashboard.filters.accountLabel}
              </span>
              <button
                onClick={() => setPeopleAccountFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  peopleAccountFilter === 'all'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 border border-white/10 hover:bg-black/90'
                }`}
              >
                {interpolate(t.proDashboard.filters.allAccounts, { count: people.length })}
              </button>
              {accounts.map((a) => {
                const isActive = peopleAccountFilter === a.id;
                const count = people.filter((p) => p.accountId === a.id).length;
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setPeopleAccountFilter(a.id);
                      onAccountChange(a.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                        : 'bg-black/80 backdrop-blur-sm text-gray-400 border border-white/10 hover:bg-black/90'
                    }`}
                  >
                    <img
                      src={fallbackAvatar(a.username)}
                      alt={a.username}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    @{a.username} ({count})
                  </button>
                );
              })}
            </div>
          )}

                {/* Filtres par type */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mr-1">{t.proDashboard.filters.typeLabel}</span>
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'all'
                    ? 'bg-purple-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <Target className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.all} ({accountPeople.length})
              </button>
              <button
                onClick={() => setActiveFilter('prospect')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'prospect'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <Target className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.prospectsFilter} ({accountPeople.filter(p => p.tags.includes('prospect')).length})
              </button>
              <button
                onClick={() => setActiveFilter('vip')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'vip'
                    ? 'bg-yellow-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <Crown className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.vip} ({accountPeople.filter(p => p.tags.includes('vip')).length})
              </button>
              <button
                onClick={() => setActiveFilter('keep')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'keep'
                    ? 'bg-blue-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <Star className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.toKeep} ({accountPeople.filter(p => p.tags.includes('keep')).length})
              </button>
              <button
                onClick={() => setActiveFilter('watch')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'watch'
                    ? 'bg-gray-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <Eye className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.toWatch} ({accountPeople.filter(p => p.tags.includes('watch')).length})
              </button>
              <button
                onClick={() => setActiveFilter('converted')}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  activeFilter === 'converted'
                    ? 'bg-emerald-500/20 text-green-400 border border-green-500/30'
                    : 'bg-black/80 backdrop-blur-sm text-gray-400 hover:bg-black/90'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-green-400" /> {t.proDashboard.filters.converted} ({accountPeople.filter(p => p.converted).length})
              </button>
                </div>

                {/* Filtre par ressenti (température effective) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mr-1">{t.proDashboard.filters.sentimentLabel}</span>
              {([
                { key: 'all', label: t.proDashboard.filters.all, Icon: null, cls: 'bg-white/10 text-gray-200 border-white/20' },
                { key: 'hot', label: t.proDashboard.filters.hot, Icon: Flame, cls: 'bg-red-500/20 text-red-300 border-red-500/40' },
                { key: 'warm', label: t.proDashboard.filters.warm, Icon: Thermometer, cls: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
                { key: 'cold', label: t.proDashboard.filters.cold, Icon: Snowflake, cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
              ] as const).map(({ key, label, Icon, cls }) => {
                const count = key === 'all'
                  ? accountPeople.length
                  : accountPeople.filter(p => getEffectiveTemperature(p) === key).length;
                const isActive = tempFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTempFilter(key as 'all' | Temperature)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      isActive ? cls : 'bg-black/80 backdrop-blur-sm text-gray-400 border-transparent hover:bg-black/90'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {label} ({count})
                  </button>
                );
              })}
                </div>
              </div>
          </div>

          {/* Suggestions de People (engageurs récurrents non suivis), limitées au
              compte sélectionné — celui où l'engagement a réellement eu lieu. */}
          {accountSuggestions.length > 0 && (
            <div className="mb-6 bg-black/80 backdrop-blur-sm border border-green-500/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-green-400" />
                <h3 className="text-base font-bold text-white">{t.proDashboard.suggestions.title}</h3>
                <span className="text-xs text-gray-400">{t.proDashboard.suggestions.subtitle}</span>
              </div>
              <div className="flex flex-col gap-2">
                {accountSuggestions.map((s) => (
                  <div
                    key={`${s.accountId}:${s.username}`}
                    className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">@{s.username}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        {interpolate(s.postsCount > 1 ? t.proDashboard.suggestions.seenOnPosts : t.proDashboard.suggestions.seenOnPost, { count: s.postsCount })}
                        {s.liked && <Heart className="w-3 h-3 text-red-400" />}
                        {s.commented && <MessageCircle className="w-3 h-3 text-blue-400" />}
                        {peopleAccountFilter === 'all' && s.accountUsername && (
                          <span className="text-gray-500">· @{s.accountUsername}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => addSuggestionToPeople(s.username, s.accountId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 transition-colors"
                      >
                        {t.proDashboard.suggestions.add}
                      </button>
                      <button
                        onClick={() => dismissSuggestion(s.username, s.accountId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        {t.proDashboard.suggestions.dismiss}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Grid */}
        <div className="mt-8 max-w-7xl mx-auto">
          {
            filteredPeople.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Network className="w-10 h-10 text-gray-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {searchQuery || activeFilter !== 'all' ? t.proDashboard.empty.noPeopleFound : t.proDashboard.empty.noPeopleYet}
                </h3>
                <p className="text-gray-400 mb-6">
                  {searchQuery || activeFilter !== 'all'
                    ? t.proDashboard.empty.tryAdjusting
                    : t.proDashboard.empty.addFirstPerson}
                </p>
                {!searchQuery && activeFilter === 'all' && (
                  <button
                    onClick={() => setShowAddPerson(true)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all"
                  >
                    {t.proDashboard.empty.addFirstButton}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPeople.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onClick={() => {
                      console.log('🖱️ PersonCard clicked:', person.displayName, person);
                      setSelectedPerson(person);
                    }}
                    onEdit={(p) => {
                      console.log('✏️ PersonCard edit clicked:', p.displayName);
                      setSelectedPerson(p);
                    }}
                    onDelete={(p) => handleDeletePerson(p.id)}
                  />
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3">
        <button
          onClick={() => setShowTutorial(true)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
          aria-label={t.proDashboard.fab.tutorialLabel}
          title={t.proDashboard.fab.tutorialTooltip}
        >
          <span className="text-2xl">?</span>
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
          aria-label={t.proDashboard.fab.settingsLabel}
        >
          <Settings className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Modals */}
      <AddPersonModal
        isOpen={showAddPerson}
        onClose={() => setShowAddPerson(false)}
        onAdd={handleAddPerson}
        accounts={accounts}
        defaultAccountId={peopleAccountFilter !== 'all' ? peopleAccountFilter : activeAccountId}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onLogout={logout}
        user={{ username: authUser?.username, email: authUser?.email }}
        onClearData={() => {
          setPeople([]);
        }}
      />

      {/* Analyzing Overlay */}
      <AnimatePresence>
        {analyzingPerson && (
          <AnalyzingOverlay
            username={analyzingPerson}
            onClose={() => setAnalyzingPerson(null)}
          />
        )}
      </AnimatePresence>

      {/* Tutorial */}
      <ProTutorial
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
      />
    </div>
  );
}
