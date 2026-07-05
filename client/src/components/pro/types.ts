export type PersonTag = 'prospect' | 'vip' | 'keep' | 'watch' | 'converted';

export type ProspectStatus = 'cold' | 'warm' | 'hot' | 'converted' | 'lost';

// Axe « température » auto-calculé à partir de la dynamique de conversation
// (temps de réponse, taux de réponse, réponses brèves, vu sans réponse…).
// Distinct de `prospectStatus` qui, lui, reste éditable manuellement.
export type Temperature = 'hot' | 'warm' | 'cold';

// Phase de « setting » (qualification en DM) déduite du contenu des messages.
export type SettingPhase = 'connexion' | 'situation' | 'probleme' | 'transition';

// Le libellé par défaut (EN) reste exporté pour compat, mais les appelants
// doivent préférer `t.personBadges.settingPhases` (i18n) via `getSettingPhaseLabel`.
export const SETTING_PHASE_LABELS: Record<SettingPhase, string> = {
  connexion: 'Connection',
  situation: 'Situation',
  probleme: 'Problem',
  transition: 'Transition (call)',
};

export interface SettingPhaseLabels {
  connexion: string;
  situation: string;
  probleme: string;
  transition: string;
}

export function getSettingPhaseLabel(phase: SettingPhase, labels: SettingPhaseLabels): string {
  return labels[phase];
}

// Faits clés extraits des messages du prospect (best-effort, côté extension).
export interface ConversationFacts {
  budget: string | null;
  timeline: string | null;
  goal: string | null;
  activity: string | null;
  objections: string[];
}

// Ce que le prospect a révélé jusqu'ici (axes de qualification).
export interface SettingRevealed {
  objective: boolean;
  situation: boolean;
  pain: boolean;
}

// Synthèse structurée du « setting » (prochaine étape, révélé, manquant, faits).
export interface SettingSummary {
  nextStep: string;
  revealed: SettingRevealed;
  missing: string[];
  facts: ConversationFacts;
  // Closing (cf. méthodo de setting) — peuvent être absents pour d'anciens
  // enregistrements, d'où l'optionnalité.
  qualificationScore?: number;       // readiness 0-100
  recommendedOffer?: string | null;  // offre à pousser (texte localisé)
  closingTactic?: string | null;     // tactique prioritaire (texte localisé)
  closeProbability?: number;         // prédiction de closing 0-100
  momentum?: 'accelerating' | 'steady' | 'cooling';
  priority?: 'qualify' | 'close' | 'reengage' | 'nurture';
}

export interface ConversationDynamics {
  theirAvgResponseMs: number | null;
  myAvgResponseMs: number | null;
  theirResponseRate: number; // 0-1
  briefReplyRatio: number; // 0-1
  lastMessageIsSent: boolean;
  lastMessageAgeMs: number | null;
  seenNotAnswered: boolean;
  msgCount: number;
  myMsgCount: number;
  theirMsgCount: number;
  cadenceTrend: 'up' | 'down' | 'flat';
  temperatureScore: number; // 0-100
  temperature: Temperature;
}

export type Circle = 'vip' | 'keep' | 'watch';

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export type Signal = {
  type: 'follow' | 'unfollow' | 'refollow' | 'blocked' | 'deleted' | 'ghost' | 'like' | 'comment' | 'story_view' | 'dm' | 'dm_open' | 'inactive_active' | 'active_inactive' | 'streak';
  timestamp: Date;
  description: string;
  postUrl?: string; // lien du post pour les signaux like/comment (sinon absent)
};

export interface Person {
  id: string;
  instagramUsername: string;
  displayName: string;
  // Compte Instagram (pro) par lequel l'utilisateur est en contact avec cette
  // personne. Sert à filtrer la liste People par compte. Renseigné à l'ajout.
  accountId?: number;
  accountUsername?: string;
  followsYou: boolean;
  youFollow: boolean;
  addedAt: Date;
  notes: string;
  signals: Signal[];
  sector?: string;
  tags: PersonTag[];
  prospectStatus?: ProspectStatus;
  circle?: Circle;
  score?: number;
  healthScore?: number;
  followDuration?: number;
  lastActivity?: Date;
  converted?: boolean;
  convertedAt?: Date;
  mutualConnections?: number;
  mutualConnectionsList?: string[]; // @usernames des comptes en commun (si collectés)
  analysisStatus?: AnalysisStatus;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  bio?: string;
  isPrivate?: boolean;
  lastAnalyzedAt?: Date;
  engagementPattern?: EngagementEntry[];
  // Axe température (auto, depuis l'analyse des conversations DM).
  temperature?: Temperature;
  dynamics?: ConversationDynamics;
  advice?: string[];
  settingPhase?: SettingPhase;
  settingSummary?: SettingSummary;
}

// Température « effective » = ressenti unique du contact.
// On privilégie la température calculée (analyse des DM, avec score) ; à défaut
// on retombe sur le `prospectStatus` manuel (cold/warm/hot). Les états terminaux
// du prospect (converted/lost) n'ont pas d'équivalent température → undefined.
export function getEffectiveTemperature(person: Person): Temperature | undefined {
  if (person.temperature) return person.temperature;
  switch (person.prospectStatus) {
    case 'hot': return 'hot';
    case 'warm': return 'warm';
    case 'cold': return 'cold';
    default: return undefined;
  }
}

export interface BadgeLabels {
  hot: string;
  warm: string;
  cold: string;
  converted: string;
  lost: string;
  vip: string;
  keep: string;
  watch: string;
}

// Badge « ressenti » unique (axe relation vivante : chaud/tiède/froid).
export function getTemperatureBadge(person: Person, labels: BadgeLabels): { label: string; color: string; icon: string } | null {
  const t = getEffectiveTemperature(person);
  if (!t) return null;
  switch (t) {
    case 'hot':
      return { label: labels.hot, color: 'text-red-400 bg-red-500/20 border-red-500/30', icon: 'Flame' };
    case 'warm':
      return { label: labels.warm, color: 'text-orange-400 bg-orange-500/20 border-orange-500/30', icon: 'Thermometer' };
    case 'cold':
      return { label: labels.cold, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30', icon: 'Snowflake' };
  }
}

// Classe de bordure (contour de carte) selon le ressenti effectif.
export function getTemperatureBorderClass(person: Person): string {
  switch (getEffectiveTemperature(person)) {
    case 'hot': return 'border-red-500/50 hover:border-red-500/70';
    case 'warm': return 'border-orange-500/50 hover:border-orange-500/70';
    case 'cold': return 'border-blue-500/40 hover:border-blue-500/60';
    default: return 'border-white/10 hover:border-white/20';
  }
}

// Rang de tri par température (chaud d'abord) pour le re-classement des People.
export function temperatureRank(t?: Temperature): number {
  switch (t) {
    case 'hot': return 0;
    case 'warm': return 1;
    case 'cold': return 2;
    default: return 3;
  }
}

// Une interaction (like/commentaire) sur un post, pour la timeline streak.
// `gapBefore` = nombre de posts sans interaction avant celui-ci (> 0 = rupture).
export type EngagementEntry = {
  postId: string;
  postUrl: string;
  liked: boolean;
  commented: boolean;
  timestamp?: Date;
  gapBefore: number;
};

export function hasTag(person: Person, tag: PersonTag): boolean {
  return person.tags.includes(tag);
}

export function isProspect(person: Person): boolean {
  return hasTag(person, 'prospect');
}

export function isInCircle(person: Person): boolean {
  return hasTag(person, 'vip') || hasTag(person, 'keep') || hasTag(person, 'watch');
}

export function getProspectBadge(person: Person, labels: BadgeLabels): { label: string; color: string; icon: string } | null {
  if (!isProspect(person) || !person.prospectStatus) return null;
  
  switch (person.prospectStatus) {
    case 'hot':
      return { label: labels.hot, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Flame' };
    case 'warm':
      return { label: labels.warm, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Thermometer' };
    case 'cold':
      return { label: labels.cold, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Snowflake' };
    case 'converted':
      return { label: labels.converted, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'CheckCircle' };
    case 'lost':
      return { label: labels.lost, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'AlertCircle' };
  }
}

export function getCircleBadge(person: Person, labels: BadgeLabels): { label: string; color: string; icon: string } | null {
  if (!person.circle) return null;
  
  switch (person.circle) {
    case 'vip':
      return { label: labels.vip, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Crown' };
    case 'keep':
      return { label: labels.keep, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Star' };
    case 'watch':
      return { label: labels.watch, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'Eye' };
  }
}

export function getDisplayBadges(person: Person, labels: BadgeLabels): Array<{ label: string; color: string; icon: string }> {
  const badges = [];

  // Ressenti unique (température calculée, repli sur statut manuel) : signal d'action.
  // On n'affiche plus le badge prospect cold/warm/hot en doublon — il faisait apparaître
  // deux statuts contradictoires (ex. « Froid » manuel vs « Chaud » calculé).
  const temperatureBadge = getTemperatureBadge(person, labels);
  if (temperatureBadge) badges.push(temperatureBadge);

  // Seuls les états terminaux du prospect (sans équivalent température) restent affichés.
  if (isProspect(person) && (person.prospectStatus === 'converted' || person.prospectStatus === 'lost')) {
    badges.push(person.prospectStatus === 'converted'
      ? { label: labels.converted, color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: 'CheckCircle' }
      : { label: labels.lost, color: 'text-gray-400 bg-gray-500/20 border-gray-500/30', icon: 'AlertCircle' });
  }

  const circleBadge = getCircleBadge(person, labels);
  if (circleBadge) badges.push(circleBadge);

  return badges;
}

export function calculateInitialScore(person: Partial<Person>): number {
  let score = 30;
  if (person.followsYou) score += 30;
  if (person.youFollow) score += 10;
  if (person.prospectStatus === 'hot') score += 20;
  if (person.prospectStatus === 'warm') score += 10;
  return Math.min(score, 100);
}

export function calculateHealthScore(person: Partial<Person>): number {
  let score = 50;
  if (person.followsYou && person.youFollow) score += 30;
  else if (person.followsYou) score += 15;
  else if (person.youFollow) score += 10;
  
  if (person.circle === 'vip') score += 10;
  if (person.mutualConnections && person.mutualConnections > 0) {
    score += Math.min(10, person.mutualConnections * 2);
  }
  
  return Math.min(score, 100);
}
