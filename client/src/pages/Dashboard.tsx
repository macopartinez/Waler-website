import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useUser, useStats } from "@/hooks/use-waler";
import { useAuth } from "@/hooks/use-auth";
import { useAnimationPreference } from "@/hooks/use-animation-preference";
import { useUnfollowers, useGhostFollowers } from "@/hooks/use-unfollowers";
import { useUnlockedUnfollowers, useUnlockUnfollower, useUnlockAllUnfollowers } from "@/hooks/use-unlocked-unfollowers";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import { Instagram, LogOut, List, X, ChevronLeft, ChevronRight, Lock, RotateCcw, Ban, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fallbackAvatar } from "@/lib/utils";
import { RadarBackground } from "@/components/RadarBackground";
import { NavBar } from "@/components/NavBar";
import { RevealGate } from "@/components/RevealGate";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProDashboard } from "@/components/pro/ProDashboard";
import { Crown, Briefcase, User } from "lucide-react";
import Onboarding from "@/components/Onboarding";
import ExtensionConnect from "@/components/ExtensionConnect";
import UnfollowerModal from "@/components/UnfollowerModal";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccounts } from "@/hooks/use-accounts";

type Section = "followers" | "unfollowers" | "blockers";
type Period = "month" | "year";

const SECTION_CONFIG = {
  followers:   { label: "Followers",        arcColor: "#02c950", textColor: "text-[#02c950]" },
  unfollowers: { label: "Connections Changed",       arcColor: "#f59e0b", textColor: "text-amber-500"   },
  blockers:    { label: "Ghosts", arcColor: "#ffffff", textColor: "text-gray-300"  },
};

const MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

const SPHERE_SIZE = 352;
const WHITE_ARC_RADIUS = 148;
const WHITE_ARC_STROKE = 14;
const NAV_GAP = 20;
const NAV_INNER_RATIO = 0.83; // 83%
const NAV_START_DEG = 0; // 0°
const NAV_SWEEP_PERCENT = -25; // -25%
const SECTION_SPLITS: Record<Section, number> = {
  blockers: 0.33,
  unfollowers: 0.34,
  followers: 0.33,
};

const ARC_INNER_RADIUS = WHITE_ARC_RADIUS + WHITE_ARC_STROKE / 2 + NAV_GAP;
const ARC_OUTER_RADIUS = ARC_INNER_RADIUS / NAV_INNER_RATIO;
const NAV_THICKNESS = ARC_OUTER_RADIUS - ARC_INNER_RADIUS;
const NAV_STROKE_WIDTH = NAV_THICKNESS + 5;
const NAV_ARC_OFFSET = 2;
const NAV_BASE_RADIUS = ARC_INNER_RADIUS + NAV_STROKE_WIDTH / 2 + NAV_ARC_OFFSET;
const NAV_INNER_BOUNDARY = NAV_BASE_RADIUS - NAV_STROKE_WIDTH / 2;
const NAV_OUTER_BOUNDARY = NAV_BASE_RADIUS + NAV_STROKE_WIDTH / 2;
const INDICATOR_OFFSET = 10;
const INDICATOR_RADIUS = NAV_OUTER_BOUNDARY + INDICATOR_OFFSET;
const INDICATOR_LENGTH_RATIO = 0.7;
const NAV_CANVAS = Math.ceil((INDICATOR_RADIUS + 12) * 2);
const SPHERE_OFFSET = (NAV_CANVAS - SPHERE_SIZE) / 2;
const SPHERE_CENTER = { x: NAV_CANVAS / 2, y: NAV_CANVAS / 2 };
const ARC_CENTER = SPHERE_CENTER;
const TOTAL_SWEEP_DEG = (NAV_SWEEP_PERCENT / 100) * 360;

const SECTION_ARC_SEGMENTS: Record<Section, { start: number; end: number }> = (() => {
  let cumulative = 0;
  const entries = {} as Record<Section, { start: number; end: number }>;
  (Object.keys(SECTION_SPLITS) as Section[]).forEach((section) => {
    const fraction = SECTION_SPLITS[section];
    const start = NAV_START_DEG + TOTAL_SWEEP_DEG * cumulative;
    const end = start + TOTAL_SWEEP_DEG * fraction;
    entries[section] = { start, end };
    cumulative += fraction;
  });
  return entries;
})();

const SEPARATOR_ANGLES = Object.values(SECTION_ARC_SEGMENTS)
  .slice(0, -1)
  .map((segment) => segment.end);

const INDICATOR_SPRING = { stiffness: 120, damping: 18 };

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(startAngle: number, endAngle: number, radius: number) {
  const start = polarToCartesian(ARC_CENTER.x, ARC_CENTER.y, radius, startAngle);
  const end = polarToCartesian(ARC_CENTER.x, ARC_CENTER.y, radius, endAngle);
  const sweep = endAngle - startAngle;
  const largeArcFlag = Math.abs(sweep) > 180 ? "1" : "0";
  const sweepFlag = sweep > 0 ? "1" : "0";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

type SectionArcNavProps = {
  activeSection: Section;
  onSelect: (section: Section) => void;
};

function shortenSegment(start: number, end: number, ratio: number) {
  const sweep = end - start;
  const midpoint = start + sweep / 2;
  const halfLength = (sweep * ratio) / 2;
  return {
    start: midpoint - halfLength,
    end: midpoint + halfLength,
  };
}

function SectionArcNav({ activeSection, onSelect }: SectionArcNavProps) {
  const centerRadius = NAV_BASE_RADIUS;
  const basePath = useMemo(() => {
    return describeArc(NAV_START_DEG, NAV_START_DEG + TOTAL_SWEEP_DEG, centerRadius);
  }, []);

  const initialSegment = useRef(
    shortenSegment(
      SECTION_ARC_SEGMENTS[activeSection].start,
      SECTION_ARC_SEGMENTS[activeSection].end,
      INDICATOR_LENGTH_RATIO,
    ),
  );
  const indicatorStart = useSpring(initialSegment.current.start, INDICATOR_SPRING);
  const indicatorEnd = useSpring(initialSegment.current.end, INDICATOR_SPRING);
  const [indicatorPath, setIndicatorPath] = useState(() =>
    describeArc(initialSegment.current.start, initialSegment.current.end, INDICATOR_RADIUS),
  );

  useEffect(() => {
    const segment = SECTION_ARC_SEGMENTS[activeSection];
    const shortened = shortenSegment(segment.start, segment.end, INDICATOR_LENGTH_RATIO);
    indicatorStart.set(shortened.start);
    indicatorEnd.set(shortened.end);
  }, [activeSection, indicatorStart, indicatorEnd]);

  useEffect(() => {
    const updatePath = () => {
      setIndicatorPath(describeArc(indicatorStart.get(), indicatorEnd.get(), INDICATOR_RADIUS));
    };
    const unsubStart = indicatorStart.on("change", updatePath);
    const unsubEnd = indicatorEnd.on("change", updatePath);
    updatePath();
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [indicatorStart, indicatorEnd]);

  const segmentEntries = useMemo(() => Object.entries(SECTION_ARC_SEGMENTS) as [Section, { start: number; end: number }][], []);

  return (
    <div
      className="absolute inset-0"
      style={{
        zIndex: 40,
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${NAV_CANVAS} ${NAV_CANVAS}`}
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <filter id="navGlass" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.4 0"
              result="glow"
            />
            <feBlend in="SourceGraphic" in2="glow" mode="screen" />
          </filter>
        </defs>

        {segmentEntries.map(([section, segment]) => (
          <path
            key={`hit-${section}`}
            d={describeArc(segment.start, segment.end, centerRadius)}
            fill="none"
            stroke="transparent"
            strokeWidth={NAV_STROKE_WIDTH}
            strokeLinecap="round"
            pointerEvents="stroke"
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(section)}
          />
        ))}

        <path
          d={basePath}
          fill="none"
          stroke="rgba(47, 43, 43, 0.77)"
          strokeWidth={NAV_STROKE_WIDTH}
          strokeLinecap="round"
          filter="url(#navGlass)"
        />

        {SEPARATOR_ANGLES.map((angle) => {
          const inner = polarToCartesian(ARC_CENTER.x, ARC_CENTER.y, NAV_INNER_BOUNDARY + 4, angle);
          const outer = polarToCartesian(ARC_CENTER.x, ARC_CENTER.y, NAV_OUTER_BOUNDARY - 4, angle);
          return (
            <line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={2}
              filter="url(#navGlass)"
              strokeLinecap="round"
            />
          );
        })}

        <path
          d={indicatorPath}
          fill="none"
          stroke="rgba(255, 254, 254, 0.4)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#navGlass)"
        />
      </svg>

      {segmentEntries.map(([section, config]) => {
        const midAngle = (config.start + config.end) / 2;
        const iconRadius = NAV_BASE_RADIUS;
        const pos = polarToCartesian(ARC_CENTER.x, ARC_CENTER.y, iconRadius, midAngle);
        const isActive = activeSection === section;
        return (
          <button
            key={section}
            onClick={() => onSelect(section)}
            className="absolute transition-all"
            style={{
              left: pos.x - 24,
              top: pos.y - 24,
              pointerEvents: "auto",
              zIndex: 60,
            }}
          >
            <div className="w-12 h-12 flex items-center justify-center">
              {section === "blockers" ? (
                <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
                  <circle
                    cx="11"
                    cy="7"
                    r="4.3"
                    stroke={isActive ? "#000" : "#fff"}
                    strokeWidth="2"
                    strokeDasharray="3.5 2"
                    opacity={isActive ? 1 : 0.7}
                  />
                  <path
                    d="M4 20c0-4.3 3.6-7 7-7s7 2.7 7 7"
                    stroke={isActive ? "#000" : "#fff"}
                    strokeWidth="2"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    opacity={isActive ? 1 : 0.7}
                    fill="none"
                  />
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
                  <path
                    d="M11 11a4 4 0 100-8 4 4 0 000 8zM11 13.5c-4.3 0-7.5 2.6-7.5 5.2V20h15v-1.3c0-2.6-3.2-5.2-7.5-5.2z"
                    fill={isActive ? "#000" : "#fff"}
                    opacity={isActive ? 1 : 0.7}
                  />
                  {section === "unfollowers" && (
                    <line
                      x1="2"
                      y1="20"
                      x2="20"
                      y2="2"
                      stroke={isActive ? "#000" : "#fff"}
                      strokeWidth="3.2"
                      opacity={isActive ? 1 : 0.5}
                      transform="rotate(10 11 11)"
                    />
                  )}
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [, params] = useRoute("/dashboard/:userId");
  const [, navigate] = useLocation();
  const { user: authUser, isLoading: authLoading, logout } = useAuth();
  const disableAnimation = useAnimationPreference();
  const userId = params ? parseInt(params.userId) : null;
  const queryClient = useQueryClient();

  // Écouter les messages relayés par le content script (auth-listener) via window.postMessage
  useEffect(() => {
    const messageListener = (event: MessageEvent) => {
      if (event.data && event.data.type === 'WALER_REFRESH_DASHBOARD') {
        console.log('🔄 Received refresh request from extension:', event.data.data);
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        queryClient.invalidateQueries({ queryKey: ['unfollowers'] });
        queryClient.invalidateQueries({ queryKey: ['ghost-followers'] });
        queryClient.invalidateQueries({ queryKey: ['unfollower-stats'] });
        console.log('✅ Dashboard data refreshed');
      }
    };

    window.addEventListener('message', messageListener);
    return () => window.removeEventListener('message', messageListener);
  }, [queryClient]);

  // Redirect if not authenticated or accessing wrong user
  useEffect(() => {
    if (!authLoading && !authUser) {
      console.log('❌ Not authenticated, redirecting to home');
      navigate("/");
    } else if (authUser && userId && authUser.id !== userId) {
      console.log('⚠️ Wrong user ID, redirecting to correct dashboard');
      navigate(`/dashboard/${authUser.id}`);
    }
  }, [authUser, authLoading, userId, navigate]);

  // Multi-compte : le dashboard choisit LUI-MÊME le compte Instagram affiché
  // (sélection locale, par défaut le login owner). Indépendant de la session
  // serveur, qui est pilotée par l'extension selon l'onglet Instagram ouvert :
  // on évite ainsi que les données se mélangent. Les lectures passent ?accountId.
  // L'auth et l'abonnement (isPro) restent basés sur l'owner (authUser).
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const currentUserId = selectedAccountId ?? authUser?.id ?? null;
  const { data: accountsData } = useAccounts();
  const { data: user, isLoading: userLoading, error: userError } = useUser(currentUserId);
  const { data: stats, isLoading: statsLoading, error: statsError } = useStats(currentUserId);
  const { isPro, tier, isLoading: subLoading } = useSubscription();
  
  // Fetch unfollowers data (scopé au compte Instagram actif, pas à la session)
  const unfollowersQuery = useUnfollowers(currentUserId);
  const ghostFollowersQuery = useGhostFollowers(currentUserId);

  const unfollowersData = unfollowersQuery.data;
  const ghostFollowersData = ghostFollowersQuery.data;

  const [mode, setMode] = useState<'personal' | 'professional'>('personal');
  const [activeSection, setActiveSection] = useState<Section>("unfollowers");
  const [period, setPeriod] = useState<Period>("month");
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [clickedDay, setClickedDay] = useState<number | null>(null);
  const [showAccountsList, setShowAccountsList] = useState(false);
  const [showRevealGate, setShowRevealGate] = useState(false);
  const [whiteArcTooltip, setWhiteArcTooltip] = useState({ visible: false, x: 0, y: 0 });
  const sphereRef = useRef<HTMLDivElement>(null);
  
  // Unlock system states
  const [accountToUnlock, setAccountToUnlock] = useState<any>(null);
  const { data: unlockedIds = [] } = useUnlockedUnfollowers(currentUserId);
  const unlockMutation = useUnlockUnfollower();
  const unlockAllMutation = useUnlockAllUnfollowers();
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Connexion extension (post-paiement) : tant que le compte de référence n'est
  // pas lié/vérifié via l'extension, on affiche le gate ExtensionConnect.
  const [showExtensionConnect, setShowExtensionConnect] = useState(false);
  
  // Unfollower modal state
  const [selectedUnfollower, setSelectedUnfollower] = useState<any | null>(null);
  
  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  
  // Helper function to check if an account is unlocked
  const isAccountUnlocked = (accountId: number) => {
    return unlockedIds.includes(accountId);
  };

  // Handle reveal gate completion (unlock account)
  const handleRevealComplete = () => {
    if (accountToUnlock) {
      unlockMutation.mutate(accountToUnlock.id);
      setShowRevealGate(false);
      setAccountToUnlock(null);
    }
  };

  // Handle account unlock request
  const handleUnlockRequest = (account: any) => {
    setAccountToUnlock(account);
    setShowRevealGate(true);
  };

  // Détermine ce qu'on montre à l'arrivée (notamment après paiement) :
  //  1. Compte pas encore lié à l'extension → gate ExtensionConnect (prioritaire).
  //  2. Compte lié mais tutoriel jamais vu → tutoriel passif.
  // Le gate doit suivre l'OWNER (compte de référence du login), pas le compte
  // Instagram sélectionné dans l'AccountSwitcher : un compte secondaire a
  // isConnected=false par défaut, ce qui faisait repop le modal à chaque retour
  // sur le dashboard quand un compte ≠ owner était actif.
  useEffect(() => {
    if (!authUser) return;

    const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${authUser.id}`);
    const ownerIsConnected = 'isConnected' in authUser && authUser.isConnected;

    if (!ownerIsConnected) {
      setShowExtensionConnect(true);
    } else if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, [authUser]);

  // Redirige les non-Pro hors du mode professionnel. DOIT être un effet : faire
  // navigate()/setMode() pendant le render provoque l'erreur React
  // « Cannot update a component while rendering a different component ».
  useEffect(() => {
    if (mode === 'professional' && !isPro && !subLoading) {
      console.log("⚠️ Redirecting non-Pro user from professional mode");
      // Premium → page d'upgrade ; autres → comparatif des plans
      navigate(tier === 'premium' ? '/upgrade-to-pro' : '/plan-comparison');
      // Revenir en mode perso pour éviter d'afficher du contenu flouté
      setMode('personal');
    }
  }, [mode, isPro, subLoading, tier, navigate]);

  // Generate chart data for selected month and year (must be before any conditional returns)
  const filteredChartData = useMemo(() => {
    if (!stats) return [];
    
    if (period === "year") {
      // Yearly view: aggregate by month
      return Array.from({ length: 12 }, (_, monthIdx) => {
        const monthFollowers = stats.recentFollowers.filter(f => {
          const d = new Date(f.detectedAt || new Date());
          return d.getMonth() === monthIdx && d.getFullYear() === selectedYear;
        }).length;
        
        const monthUnfollowers = stats.recentUnfollowers.filter(u => {
          const d = new Date(u.detectedAt || new Date());
          return d.getMonth() === monthIdx && d.getFullYear() === selectedYear;
        }).length;
        
        const monthBlockers = stats.recentBlockers.filter(b => {
          const d = new Date(b.detectedAt || new Date());
          return d.getMonth() === monthIdx && d.getFullYear() === selectedYear;
        }).length;
        
        return {
          day: monthIdx + 1,
          month: MONTHS[monthIdx].slice(0, 3),
          followers: monthFollowers,
          unfollowers: monthUnfollowers,
          blockers: monthBlockers
        };
      });
    } else {
      // Monthly view: show days
      const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        
        const dayFollowers = stats.recentFollowers.filter(f => {
          const d = new Date(f.detectedAt || new Date());
          return d.getDate() === day && d.getMonth() === monthIndex && d.getFullYear() === selectedYear;
        }).length;
        
        const dayUnfollowers = stats.recentUnfollowers.filter(u => {
          const d = new Date(u.detectedAt || new Date());
          return d.getDate() === day && d.getMonth() === monthIndex && d.getFullYear() === selectedYear;
        }).length;
        
        const dayBlockers = stats.recentBlockers.filter(b => {
          const d = new Date(b.detectedAt || new Date());
          return d.getDate() === day && d.getMonth() === monthIndex && d.getFullYear() === selectedYear;
        }).length;
        
        return { 
          day, 
          followers: dayFollowers,
          unfollowers: dayUnfollowers,
          blockers: dayBlockers
        };
      });
    }
  }, [stats, monthIndex, selectedYear, period]);

  // Calculer totalCount pour la section active (MUST BE BEFORE EARLY RETURNS)
  // Pour les followers: toujours le total global
  // Pour les unfollowers/blockers: filtrer par période (mois ou année)
  const totalCount = useMemo(() => {
    if (!stats) return 0;
    
    if (activeSection === "followers") {
      // Followers: afficher le nombre réel d'Instagram
      return stats.instagramFollowers || stats.totalFollowers;
    }
    
    // Pour unfollowers et blockers: filtrer par période
    const accounts = activeSection === "unfollowers" 
      ? (unfollowersData?.unfollowers || stats.recentUnfollowers)
      : (ghostFollowersData?.ghostFollowers || stats.recentBlockers);
    
    if (period === "month") {
      // Filtrer par mois sélectionné
      return accounts.filter((acc: any) => {
        const d = new Date(acc.detectedAt || acc.detected_at || new Date());
        return d.getMonth() === monthIndex && d.getFullYear() === selectedYear;
      }).length;
    } else {
      // Filtrer par année sélectionnée
      return accounts.filter((acc: any) => {
        const d = new Date(acc.detectedAt || acc.detected_at || new Date());
        return d.getFullYear() === selectedYear;
      }).length;
    }
  }, [activeSection, period, monthIndex, selectedYear, stats, unfollowersData, ghostFollowersData]);

  // Show loading state
  if (userLoading || statsLoading) return <DashboardLoading />;
  
  // Show error state
  if (!user || !stats) return <div className="text-white p-8">Error loading dashboard</div>;
  
  // Get user registration date (fallback to 1 year ago if not available)
  const userRegistrationDate = 'createdAt' in user && user.createdAt 
    ? new Date(user.createdAt) 
    : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const registrationYear = userRegistrationDate.getFullYear();
  const registrationMonth = userRegistrationDate.getMonth();

  // Capturés AVANT les guards ci-dessous : ceux-ci font des `return` qui narrowent
  // `mode` à un seul littéral, ce qui ferait croire à TS que les comparaisons des
  // switchers Personal/Professional sont « sans overlap ». Ici `mode` est encore
  // l'union, donc ces booléens restent de simples `boolean`.
  const isPersonalMode = mode === 'personal';
  const isProfessionalMode = mode === 'professional';

  // La redirection est gérée par le useEffect plus haut ; ici on se contente de
  // ne rien rendre tant que l'utilisateur non-Pro est encore en mode pro.
  if (mode === 'professional' && !isPro && !subLoading) {
    return null;
  }

  // Show Pro Dashboard if in professional mode (only for Pro users)
  if (mode === 'professional') {
    return (
        <div className="min-h-screen bg-[#0a0a0a] font-body text-white relative overflow-hidden">
          {!disableAnimation && <RadarBackground />}
          
          {/* Pro Dashboard Content (blurred for non-Pro) */}
          <div className={!isPro ? 'filter blur-sm pointer-events-none' : ''}>
            {/* Navbar */}
            <NavBar
              pinLogo
              center={
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1">
                  <button
                    onClick={() => setMode('personal')}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold transition-all ${
                      isPersonalMode
                        ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.5)]'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">Personal</span>
                  </button>
                  <button
                    onClick={() => setMode('professional')}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold transition-all ${
                      isProfessionalMode
                        ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.5)]'
                        : 'text-gray-400 hover:text-white cursor-pointer'
                    }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span className="hidden sm:inline">Professional</span>
                    {!isPro && <Crown className="w-3 h-3 text-amber-400" />}
                  </button>
                </div>
              }
              actions={
                <>
                  <AccountSwitcher value={currentUserId} onChange={setSelectedAccountId} />
                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-colors border border-white/10 hover:border-white/20"
                  >
                    <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
                  </button>
                  <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-[#02c950]/15 border border-[#02c950]/30 text-[#02c950]">
                    <Crown className="w-4 h-4" />
                  </div>
                </>
              }
            />
          
          <div className="pt-20">
            <ProDashboard
              accounts={accountsData?.accounts ?? []}
              activeAccountId={currentUserId}
              onAccountChange={setSelectedAccountId}
            />
          </div>
          </div> {/* Close blur wrapper */}
        </div>
      );
  }

  // Calculer le delta (évolution depuis hier ou le jour précédent)
  const sectionKey = activeSection === "followers" ? "followers" : activeSection === "unfollowers" ? "unfollowers" : "blockers";
  const todayData = filteredChartData[filteredChartData.length - 1];
  const yesterdayData = filteredChartData[filteredChartData.length - 2];
  const todayCount = todayData?.[sectionKey] || 0;
  const yesterdayCount = yesterdayData?.[sectionKey] || 0;
  const delta = todayCount - yesterdayCount;
  const previousTotal = totalCount - todayCount;

  const maxCount = Math.max(stats.totalFollowers, stats.totalUnfollowers, stats.totalBlockers, 1);
  const arcPercent = Math.min(totalCount / maxCount, 1);
  const { arcColor } = SECTION_CONFIG[activeSection];

  // Utiliser les nouvelles données unfollowers avec status
  const sectionAccounts =
    activeSection === "followers"   ? stats.recentFollowers :
    activeSection === "unfollowers" ? (unfollowersData?.unfollowers || stats.recentUnfollowers) :
    (ghostFollowersData?.ghostFollowers || stats.recentBlockers);

  const dayAccounts = clickedDay !== null
    ? (activeSection === "followers" 
        ? stats.recentFollowers 
        : activeSection === "unfollowers" 
          ? (unfollowersData?.unfollowers || stats.recentUnfollowers)
          : (ghostFollowersData?.ghostFollowers || stats.recentBlockers)
      ).filter((acc: any) => {
        const d = new Date(acc.detectedAt || acc.detected_at || new Date());
        return d.getDate() === clickedDay && d.getMonth() === monthIndex;
      })
    : [];

  // White arc gauge: growth percentage (0-75% of circle max)
  const currentFollowers = filteredChartData[filteredChartData.length - 1]?.followers || 0;
  const startFollowers = filteredChartData[0]?.followers || 1;
  const computedGrowthPercent = ((currentFollowers - startFollowers) / startFollowers) * 100;
  const growthValue = Number.isFinite(stats.growthRate)
    ? stats.growthRate
    : Number.isFinite(computedGrowthPercent)
      ? computedGrowthPercent
      : 0;
  const followerRatio = Math.min(Math.max(growthValue / 100, 0), 0.75);
  const growthDisplay = `${growthValue >= 0 ? "+" : ""}${growthValue.toFixed(1)}%`;

  const handleWhiteArcHover = (event: React.MouseEvent<SVGCircleElement, MouseEvent>) => {
    if (!sphereRef.current) return;
    const rect = sphereRef.current.getBoundingClientRect();
    setWhiteArcTooltip({
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 12,
    });
  };

  const hideWhiteArcTooltip = () => setWhiteArcTooltip((prev) => ({ ...prev, visible: false }));

  const handleMarkAsBlocker = async (unfollowerId: number) => {
    try {
      const response = await fetch(`/api/unfollowers/${unfollowerId}/mark-as-blocker`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark as blocker');
      }
      
      // Refresh stats to update the UI
      window.location.reload();
    } catch (error) {
      console.error('Error marking as blocker:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-body text-white relative overflow-hidden">
      {!disableAnimation && <RadarBackground />}

      {/* Navbar */}
      <NavBar
        pinLogo
        center={
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1">
            <button
              onClick={() => setMode('personal')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold transition-all ${
                isPersonalMode
                  ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.5)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Personal</span>
            </button>
            <button
              onClick={() => setMode('professional')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold transition-all ${
                isProfessionalMode
                  ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.5)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Professional</span>
              {!isPro && <Crown className="w-3 h-3 text-amber-400" />}
            </button>
          </div>
        }
        actions={
          <>
            <AccountSwitcher value={currentUserId} onChange={setSelectedAccountId} />
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-colors border border-white/10 hover:border-white/20"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
            {tier && (
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-[#02c950]/15 border border-[#02c950]/30 text-[#02c950]">
                <Crown className="w-4 h-4" />
              </div>
            )}
          </>
        }
      />

      {/* Main layout */}
      <div className="relative z-10 flex items-center justify-center min-h-screen pt-20 px-6 gap-6 lg:gap-8 flex-wrap lg:flex-nowrap" style={{ paddingTop: '80px' }}>

        {/* LEFT — Sphere */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-6 mt-8"
        >
          <div ref={sphereRef} className="relative" style={{ width: NAV_CANVAS, height: NAV_CANVAS }}>
            <SectionArcNav activeSection={activeSection} onSelect={setActiveSection} />

            <div
              className="absolute"
              style={{
                top: SPHERE_OFFSET,
                left: SPHERE_OFFSET,
                width: SPHERE_SIZE,
                height: SPHERE_SIZE,
              }}
            >
              {/* LAYER 0 — Outer green radial circle (background) */}
              <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} viewBox="0 0 352 352">
              <defs>
                <radialGradient id="bgRadial" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#075625" stopOpacity="1" />
                  <stop offset="75%"  stopColor="#0B893B" stopOpacity="1" />
                  <stop offset="100%" stopColor="#0FBC51" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="176" cy="176" r="174" fill="url(#bgRadial)" fillOpacity="0.42" />
              </svg>

              {/* LAYER 1 — White arc gauge (wraps glass circle, shows current followers) */}
              <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 15 }} viewBox="0 0 352 352">
              <defs>
                <filter id="glassArc" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feColorMatrix
                    in="blur"
                    type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.4 0"
                    result="softGlow"
                  />
                  <feBlend in="SourceGraphic" in2="softGlow" mode="screen" />
                </filter>
              </defs>
              <circle
                cx="176" cy="176" r="148"
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${followerRatio * 930} 930`}
                strokeDashoffset="0"
                transform="translate(176,176) scale(-1,1) translate(-176,-176) rotate(-90 176 176)"
                filter="url(#glassArc)"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
                onMouseEnter={handleWhiteArcHover}
                onMouseMove={handleWhiteArcHover}
                onMouseLeave={hideWhiteArcTooltip}
              />
              </svg>

              {/* LAYER 2 — Colored arc (red/green/white based on section) */}
              <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 25 }} viewBox="0 0 352 352">
              <defs>
                <filter id="arcShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#F95858" floodOpacity="0.25" />
                </filter>
                <linearGradient id="arcFade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor={arcColor} stopOpacity="0" />
                  <stop offset="12%"  stopColor={arcColor} stopOpacity="1" />
                  <stop offset="88%"  stopColor={arcColor} stopOpacity="1" />
                  <stop offset="100%" stopColor={arcColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx="176" cy="176" r="168"
                fill="none"
                stroke={arcColor}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${arcPercent * 0.22 * 1055} 1055`}
                strokeDashoffset="0"
                transform="rotate(-90 176 176)"
                filter="url(#arcShadow)"
                style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
              />
            </svg>

            {whiteArcTooltip.visible && (
              <div
                className="absolute px-3 py-1 rounded-full bg-white text-black text-xs font-semibold pointer-events-none shadow-lg"
                style={{
                  left: whiteArcTooltip.x,
                  top: whiteArcTooltip.y,
                  transform: "translate(-50%, -100%)",
                  zIndex: 80,
                }}
              >
                Your community grew by {growthDisplay}
              </div>
            )}

            {/* LAYER 3 — Glass inner circle (foreground), 360x360 centered in 440x440 */}
            <div
              className="absolute rounded-full flex flex-col items-center justify-center"
              style={{
                width: 288,
                height: 288,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 20,
                background: "rgba(217, 217, 217, 0.16)",
                backdropFilter: "blur(20px) brightness(0.55) saturate(1.5)",
                WebkitBackdropFilter: "blur(20px) brightness(0.55) saturate(1.5)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "inset 0 0 60px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              <div className="font-doppio text-white uppercase leading-none text-center" style={{ fontSize: "30px" }}>TOTAL</div>
              <div className="font-doppio text-white leading-none text-center" style={{ fontSize: "112px", lineHeight: 1 }}>{totalCount}</div>
              {delta !== 0 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-gray-400 text-sm font-mono">{previousTotal}</span>
                  <span className={`text-2xl ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {delta > 0 ? '↗' : '↘'}
                  </span>
                  <span className={`text-sm font-mono font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                </div>
              )}
              <div className={`font-doppio mt-1 text-center ${SECTION_CONFIG[activeSection].textColor}`} style={{ fontSize: "30px", lineHeight: 1 }}>
                {SECTION_CONFIG[activeSection].label}
              </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (activeSection === 'unfollowers' || activeSection === 'blockers') {
                setShowRevealGate(true);
              } else {
                setShowAccountsList(true);
              }
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 border border-white/20 text-sm font-bold hover:bg-white/15 transition-all relative"
            style={{ marginTop: "-72px", zIndex: 50 }}
          >
            <List className="w-4 h-4" /> Your Circle
          </button>
        </motion.div>

        {/* RIGHT — Chart */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="oled-card flex-1 max-w-2xl rounded-3xl overflow-hidden"
        >
          {/* Platform header */}
          <div className="flex gap-6 px-6 pt-5 pb-2">
            <div className="flex items-center gap-2 text-sm font-bold pb-2 border-b-2 border-orange-400 text-orange-400">
              <Instagram className="w-4 h-4" /> Instagram
            </div>
          </div>

          {/* Period tabs + month nav */}
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex gap-4">
              {(["month", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`text-sm font-black uppercase tracking-wider pb-1 border-b-2 transition-all ${
                    period === p ? "border-white text-white" : "border-transparent text-gray-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {period === "month" && (
                <button 
                  onClick={() => setShowMonthPicker(true)}
                  className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  {MONTHS[monthIndex]}
                </button>
              )}
              <button 
                onClick={() => setShowYearPicker(true)}
                className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
              >
                {selectedYear}
              </button>
            </div>
          </div>

          {/* Bar chart */}
          <div className="px-4 pb-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredChartData}
                barSize={14}
                onClick={(data) => {
                  if (data && data.activePayload) {
                    const day = data.activePayload[0]?.payload?.day;
                    setClickedDay(day === clickedDay ? null : day);
                  }
                }}
              >
                <XAxis
                  dataKey={period === "year" ? "month" : "day"}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 10 }}
                  label={{ value: period === "year" ? "MONTH" : "DAY", position: "insideBottomRight", offset: -5, fill: "rgba(255,255,255,0.65)", fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 10 }}
                  allowDecimals={false}
                  label={{
                    value: activeSection === "followers" ? "FOLLOWERS" : activeSection === "unfollowers" ? "UNFOLLOWERS" : "BLOCKERS",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.65)",
                    fontSize: 10 
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 12 }}
                  formatter={(value: any, name: string, props: any) => {
                    const sectionKey = activeSection === "followers" ? "followers" : activeSection === "unfollowers" ? "unfollowers" : "blockers";
                    const currentDayValue = props.payload[sectionKey] || 0;
                    
                    // Calculer le total cumulé jusqu'à ce jour
                    const currentIndex = filteredChartData.findIndex(d => d.day === props.payload.day);
                    const cumulativeTotal = filteredChartData
                      .slice(0, currentIndex + 1)
                      .reduce((sum, d) => sum + (d[sectionKey] || 0), 0);
                    
                    const label = activeSection === "followers" ? "Followers" : activeSection === "unfollowers" ? "Unfollowers" : "Blockers";
                    const sign = currentDayValue > 0 ? "+" : "";
                    const textColor = activeSection === "followers" ? "text-[#02c950]" : activeSection === "unfollowers" ? "text-amber-500" : "text-gray-300";
                    
                    return [
                      <div key="tooltip-content" className="flex flex-col gap-1">
                        <div className={`font-bold ${textColor}`}>{sign}{currentDayValue} {label.toLowerCase()}</div>
                        <div className="text-xs text-gray-400">Total: {cumulativeTotal}</div>
                      </div>,
                      ""
                    ];
                  }}
                  labelFormatter={(label) => period === "year" ? label : `Day ${label}`}
                />
                <Bar 
                  dataKey={activeSection === "followers" ? "followers" : activeSection === "unfollowers" ? "unfollowers" : "blockers"} 
                  radius={[3, 3, 0, 0]}
                >
                  {filteredChartData.map((entry, index) => {
                    const value = activeSection === "followers" ? entry.followers : activeSection === "unfollowers" ? entry.unfollowers : entry.blockers || 0;
                    const barColor =
                      activeSection === "followers" ? "#02c950" :
                      activeSection === "unfollowers" ? "#ef4444" :
                      "#ffffff";

                    return (
                      <Cell
                        key={index}
                        fill={barColor}
                        opacity={clickedDay === entry.day ? 1 : 0.92}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Clicked day detail */}
          <AnimatePresence>
            {clickedDay !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-6 pb-4 border-t border-white/10"
              >
                <div className="pt-3">
                  <div className="text-xs font-bold text-gray-400 mb-2">
                    {activeSection === "followers" ? "Followers" : activeSection === "unfollowers" ? "Unfollowers" : "Blockers"} {period === "year" ? `in ${MONTHS[clickedDay - 1]}` : `on day ${clickedDay}`}
                  </div>
                  {dayAccounts.length === 0 ? (
                    <div className="text-xs text-gray-500">
                      No {activeSection === "followers" ? "followers" : activeSection === "unfollowers" ? "unfollowers" : "blockers"} {period === "year" ? "this month" : "this day"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dayAccounts.slice(0, activeSection === 'followers' ? 5 : dayAccounts.length).map((acc: any) => {
                        const isUnlocked = activeSection === 'followers' ? true : isAccountUnlocked(acc.id);
                        return (
                          <div 
                            key={acc.id} 
                            onClick={() => !isUnlocked && handleUnlockRequest(acc)}
                            className={`flex items-center gap-2 bg-white/5 rounded-full px-3 py-1 ${!isUnlocked ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
                          >
                            <img
                              src={isUnlocked ? (acc.avatarUrl || fallbackAvatar(acc.username)) : fallbackAvatar("locked")}
                              className="w-5 h-5 rounded-full"
                              alt={isUnlocked ? acc.username : "locked"}
                            />
                            {isUnlocked ? (
                              <span className="text-xs font-medium">@{acc.username}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-gray-400">@???</span>
                                <Lock className="w-3 h-3 text-gray-500" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {activeSection === 'followers' && dayAccounts.length > 5 && (
                        <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1 text-xs font-medium text-gray-400">
                          + {dayAccounts.length - 5} followers
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Accounts List Modal */}
      <AnimatePresence>
        {showAccountsList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAccountsList(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f0f0f] border border-white/10 rounded-3xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-lg font-black">
                  {SECTION_CONFIG[activeSection].label}
                </h2>
                <button onClick={() => setShowAccountsList(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {sectionAccounts.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">No accounts found</div>
                ) : (
                  sectionAccounts.map((acc: any) => {
                    // Les followers sont toujours débloqués, seuls les unfollowers et blockers peuvent être verrouillés
                    const isUnlocked = activeSection === 'followers' ? true : isAccountUnlocked(acc.id);
                    return (
                      <div 
                        key={acc.id} 
                        onClick={() => {
                          if (!isUnlocked) {
                            handleUnlockRequest(acc);
                          } else if (activeSection === 'unfollowers') {
                            setSelectedUnfollower(acc);
                            setShowAccountsList(false);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer`}
                      >
                        <img
                          src={isUnlocked ? (acc.avatarUrl || fallbackAvatar(acc.username)) : fallbackAvatar("locked")}
                          alt={isUnlocked ? acc.username : "locked"}
                          className="w-10 h-10 rounded-full border border-white/10 object-cover"
                        />
                        <div className="flex-1">
                          {isUnlocked ? (
                            <>
                              <div className="font-bold text-sm">@{acc.username}</div>
                              <div className="text-xs text-gray-500">
                                {new Date(acc.detectedAt || acc.detected_at || new Date()).toLocaleDateString("fr-FR")}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-sm flex items-center gap-2">
                                <span className="text-gray-400">@???</span>
                                <Lock className="w-4 h-4 text-gray-500" />
                              </div>
                              <div className="text-xs text-gray-500">
                                Click to reveal
                              </div>
                            </>
                          )}
                        </div>
                        {isUnlocked && (acc.recoveredAt || acc.recovered_at) && (
                          <div className="text-xs px-2 py-1 rounded-full bg-[#02c950]/15 text-[#02c950] border border-[#02c950]/30 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Refollowed
                          </div>
                        )}
                        {isUnlocked && activeSection === 'blockers' && acc.status && (
                          <div className="text-xs px-2 py-1 rounded-full bg-white/10 flex items-center gap-1">
                            {acc.status === 'blocked'
                              ? <><Ban className="w-3 h-3" /> Blocked</>
                              : <><UserX className="w-3 h-3" /> Removed</>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reveal Gate Modal */}
      {showRevealGate && (
        <RevealGate
          onReveal={() => {
            if (accountToUnlock) {
              // Débloquer le compte spécifique
              handleRevealComplete();
            } else {
              // Débloquer TOUS les comptes après le questionnaire "Your Circle"
              unlockAllMutation.mutate();
              setShowRevealGate(false);
              setShowAccountsList(true);
            }
          }}
          onClose={() => {
            setShowRevealGate(false);
            setAccountToUnlock(null);
          }}
        />
      )}

      {/* Month Picker Modal */}
      <AnimatePresence>
        {showMonthPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMonthPicker(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 w-full max-w-md"
            >
              <h3 className="text-xl font-bold text-white mb-4">Select Month</h3>
              <div className="grid grid-cols-3 gap-3">
                {MONTHS.map((month, index) => {
                  const currentYear = new Date().getFullYear();
                  const currentMonth = new Date().getMonth();
                  const isFuture = selectedYear > currentYear || (selectedYear === currentYear && index > currentMonth);
                  const isBeforeRegistration = selectedYear < registrationYear || (selectedYear === registrationYear && index < registrationMonth);
                  const isDisabled = isFuture || isBeforeRegistration;
                  
                  return (
                    <button
                      key={month}
                      onClick={() => {
                        if (!isDisabled) {
                          setMonthIndex(index);
                          setShowMonthPicker(false);
                        }
                      }}
                      disabled={isDisabled}
                      className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        monthIndex === index
                          ? 'bg-[#02c950] text-black'
                          : isDisabled
                          ? 'bg-white/5 text-gray-600 cursor-not-allowed opacity-50'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {month.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Year Picker Modal */}
      <AnimatePresence>
        {showYearPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowYearPicker(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 w-full max-w-md"
            >
              <h3 className="text-xl font-bold text-white mb-4">Select Year</h3>
              <div className="grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                {Array.from(
                  { length: new Date().getFullYear() - registrationYear + 1 }, 
                  (_, i) => registrationYear + i
                ).map((year) => {
                  const currentYear = new Date().getFullYear();
                  const isFuture = year > currentYear;
                  const isBeforeRegistration = year < registrationYear;
                  const isDisabled = isFuture || isBeforeRegistration;
                  
                  return (
                    <button
                      key={year}
                      onClick={() => {
                        if (!isDisabled) {
                          setSelectedYear(year);
                          setShowYearPicker(false);
                        }
                      }}
                      disabled={isDisabled}
                      className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        selectedYear === year
                          ? 'bg-[#02c950] text-black'
                          : isDisabled
                          ? 'bg-white/5 text-gray-600 cursor-not-allowed opacity-50'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Post-paiement : connexion du compte de référence via l'extension */}
      {showExtensionConnect && authUser && (
        <ExtensionConnect
          userId={authUser.id}
          claimedUsername={authUser.username}
          onConnected={() => {
            setShowExtensionConnect(false);
            // Enchaîner sur le tutoriel passif si pas encore vu.
            const seen = localStorage.getItem(`onboarding_seen_${authUser.id}`);
            if (!seen) setShowOnboarding(true);
          }}
        />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <Onboarding
          onComplete={() => {
            setShowOnboarding(false);
            if (authUser) localStorage.setItem(`onboarding_seen_${authUser.id}`, 'true');
          }}
          onSkip={() => {
            setShowOnboarding(false);
            if (authUser) localStorage.setItem(`onboarding_seen_${authUser.id}`, 'true');
          }}
        />
      )}
      
      {/* Unfollower Modal */}
      {selectedUnfollower && (
        <UnfollowerModal
          unfollower={selectedUnfollower}
          onClose={() => setSelectedUnfollower(null)}
          onMarkAsBlocker={handleMarkAsBlocker}
        />
      )}
      
      {/* User menu (dropdown façon Trendtrack) */}
      <UserMenu
        user={{
          username: authUser?.username,
          email: authUser?.email,
        }}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={logout}
      />

      {/* Settings Modal (réglages détaillés, ouvert depuis le menu) */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onLogout={logout}
        user={{
          username: authUser?.username,
          email: authUser?.email,
        }}
      />
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8 flex flex-col items-center justify-center gap-8">
      <Skeleton className="h-72 w-72 rounded-full" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <Skeleton className="h-72 w-full max-w-2xl rounded-3xl" />
    </div>
  );
}
