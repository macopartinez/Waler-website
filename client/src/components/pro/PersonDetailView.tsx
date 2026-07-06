import { ArrowLeft, Trash, Zap, MessageCircle, Heart, Crown, Star, Eye, Flame, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Thermometer, Snowflake, Calendar, Download, Clock, Target, Users, Pencil, Ban, Hash } from "lucide-react";
import { useState } from "react";
import { Person, ProspectStatus, Circle, isProspect, isInCircle, getEffectiveTemperature, getSettingPhaseLabel } from "./types";
import { RadarBackground } from "@/components/RadarBackground";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { exportPersonToPDF } from "../../utils/pdfExport";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

interface PersonDetailViewProps {
  person: Person;
  onBack: () => void;
  onUpdate: (person: Person) => void;
  /** Renomme le pseudo Instagram (re-clé l'analyse backend + relance). */
  onRename: (newUsername: string) => void;
  onDelete: () => void;
}

export function PersonDetailView({ person, onBack, onUpdate, onRename, onDelete }: PersonDetailViewProps) {
  const { t, language } = useLanguage();
  const [notes, setNotes] = useState(person.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [signalFilter, setSignalFilter] = useState<'all' | 'like' | 'comment' | 'keyword'>('all');

  // Formatage d'un délai (ms) en texte court : « 12 min », « 3 h », « 2 j ».
  const formatResponseTime = (ms: number | null): string => {
    if (ms == null) return '—';
    const min = Math.round(ms / 60000);
    if (min < 60) return `${Math.max(1, min)} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h`;
    return `${Math.round(h / 24)} d`;
  };

  if (!person) {
    return null;
  }

  // Séquence d'engagement (du + récent au + ancien) : chaque entrée = un post où
  // la personne a interagi (like et/ou commentaire), avec gapBefore (posts sautés
  // avant = rupture du streak).
  const pattern = person.engagementPattern || [];
  const signals = person.signals || [];

  // Signaux de relation (follow / unfollow / blocked / deleted / ghost /
  // refollow) issus du mode Base, du + récent au + ancien. Affichés au-dessus du
  // streak d'engagement. 'ghost' reste géré pour les signaux historiques (avant
  // la séparation bloqué/supprimé).
  const RELATION_TYPES = ['follow', 'unfollow', 'blocked', 'deleted', 'ghost', 'refollow'] as const;
  const relationSignals = signals
    .filter((s) => (RELATION_TYPES as readonly string[]).includes(s.type))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const relationConfig: Record<string, { Icon: typeof TrendingUp; color: string }> = {
    follow: { Icon: TrendingUp, color: 'text-green-400' },
    refollow: { Icon: TrendingUp, color: 'text-green-400' },
    unfollow: { Icon: TrendingDown, color: 'text-orange-400' },
    blocked: { Icon: Ban, color: 'text-red-400' },
    deleted: { Icon: Trash, color: 'text-red-400' },
    ghost: { Icon: AlertCircle, color: 'text-red-400' },
  };

  const patternCounts = {
    all: pattern.length,
    like: pattern.filter((e) => e.liked).length,
    comment: pattern.filter((e) => e.commented).length,
    keyword: pattern.filter((e) => e.keyword).length,
  };

  // Nombre de commentaires « mot-clé » de campagne (signal d'intention). On
  // privilégie le compteur backend, repli sur la séquence d'engagement.
  const keywordHits = person.keywordHits ?? patternCounts.keyword;

  const patternFilters: Array<{
    key: 'all' | 'like' | 'comment' | 'keyword';
    label: string;
    Icon: typeof Heart | null;
    count: number | null;
  }> = [
    { key: 'all', label: t.personDetailView.filters.all, Icon: null, count: null },
    { key: 'like', label: t.personDetailView.filters.likes, Icon: Heart, count: patternCounts.like },
    { key: 'comment', label: t.personDetailView.filters.comments, Icon: MessageCircle, count: patternCounts.comment },
    ...(patternCounts.keyword > 0
      ? [{ key: 'keyword' as const, label: t.personDetailView.filters.keywords, Icon: Hash, count: patternCounts.keyword }]
      : []),
  ];

  const filteredPattern = pattern.filter((e) => {
    if (signalFilter === 'like') return e.liked;
    if (signalFilter === 'comment') return e.commented;
    if (signalFilter === 'keyword') return !!e.keyword;
    return true;
  });

  const formatDate = (date: Date | undefined) => {
    if (!date) return t.personDetailView.unknownDate;
    try {
      return new Date(date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return t.personDetailView.invalidDate;
    }
  };

  const changeProspectStatus = (newStatus: ProspectStatus) => {
    console.log('🔄 Changing prospect status:', person.prospectStatus, '→', newStatus);
    // Le statut manuel n'est qu'un REPÈRE/repli : il alimente le ressenti
    // uniquement tant qu'il n'y a pas d'analyse de conversation. Dès qu'une
    // température est calculée (analyse des DM), elle prime — on n'écrase donc
    // jamais `temperature` à la main (le poll backend la réécrirait de toute façon).
    onUpdate({ ...person, prospectStatus: newStatus });
  };

  const changeCircle = (newCircle: Circle) => {
    console.log('🔄 Changing circle:', person.circle, '→', newCircle);
    // Remove old circle tags and add new one
    const newTags = person.tags.filter(t => t !== 'vip' && t !== 'keep' && t !== 'watch');
    newTags.push(newCircle as any);
    console.log('🏷️ New tags:', newTags);
    onUpdate({ ...person, circle: newCircle, tags: newTags });
  };

  const toggleConversion = () => {
    console.log('🔄 Toggling conversion:', person.converted, '→', !person.converted);
    onUpdate({ 
      ...person, 
      converted: !person.converted,
      convertedAt: !person.converted ? new Date() : undefined,
      prospectStatus: !person.converted ? 'converted' : 'warm'
    });
  };

  const saveNotes = () => {
    onUpdate({ ...person, notes, signals });
    setIsEditingNotes(false);
  };

  const getCircleConfig = (c: Circle) => {
    switch (c) {
      case 'vip':
        return { label: t.personDetailView.circleLabels.vip, desc: t.personDetailView.circleDesc.vip, icon: <Crown className="w-5 h-5" />, max: t.personDetailView.circleMax.vip };
      case 'keep':
        return { label: t.personDetailView.circleLabels.keep, desc: t.personDetailView.circleDesc.keep, icon: <Star className="w-5 h-5" />, max: t.personDetailView.circleMax.keep };
      case 'watch':
        return { label: t.personDetailView.circleLabels.watch, desc: t.personDetailView.circleDesc.watch, icon: <Eye className="w-5 h-5" />, max: t.personDetailView.circleMax.watch };
    }
  };

  const displayScore = person.healthScore || person.score || 0;
  const scoreLabel = isInCircle(person) ? t.personDetailView.relationshipScore : t.personDetailView.score;
  const scoreSubtitle = isInCircle(person) 
    ? displayScore >= 75 ? t.personDetailView.scoreSubtitle.strongStable : displayScore >= 50 ? t.personDetailView.scoreSubtitle.coolingSignal : t.personDetailView.scoreSubtitle.fragileAction
    : displayScore >= 75 ? t.personDetailView.scoreSubtitle.veryHot : displayScore >= 50 ? t.personDetailView.scoreSubtitle.warm : t.personDetailView.scoreSubtitle.cold;

  return (
    <div className="fixed inset-0 w-full h-full bg-black text-white z-[9999] overflow-hidden">
      {/* Radar Background */}
      <RadarBackground />
      
      <div className="absolute inset-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-3"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">{t.personDetailView.back}</span>
            </button>
            <h1 className="text-4xl font-display font-black text-white mb-1">{person.displayName}</h1>
            <a
              href={`https://instagram.com/${person.instagramUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-green-400 transition-colors"
            >
              @{person.instagramUsername}
            </a>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={() => {
                const badges: string[] = [];
                if (isInCircle(person) && person.circle) {
                  badges.push(getCircleConfig(person.circle).label);
                }
                if (isProspect(person) && person.prospectStatus) {
                  const statusLabel = person.prospectStatus === 'hot' ? t.personBadges.hot :
                    person.prospectStatus === 'warm' ? t.personBadges.warm :
                    person.prospectStatus === 'cold' ? t.personBadges.cold :
                    person.prospectStatus === 'converted' ? t.personBadges.converted : t.personBadges.lost;
                  badges.push(interpolate(t.personDetailView.pdfExport.prospectPrefix, { status: statusLabel }));
                }

                const connectionStatus =
                  person.followsYou && person.youFollow ? t.personDetailView.connection.mutual :
                  person.followsYou ? t.personDetailView.connection.followsYou :
                  person.youFollow ? t.personDetailView.connection.youFollow : t.personDetailView.connection.none;

                exportPersonToPDF({
                  displayName: person.displayName,
                  username: person.instagramUsername,
                  badges,
                  scoreLabel,
                  score: displayScore,
                  scoreSubtitle,
                  addedAt: person.addedAt,
                  followDuration: person.followDuration || 0,
                  connectionStatus,
                  mutualConnections: person.mutualConnections || 0,
                  signalsCount: signals.length,
                  sector: person.sector,
                  notes,
                  timeline: pattern.map((entry) => ({
                    label: entry.liked && entry.commented
                      ? t.personDetailView.pdfExport.likedAndCommented
                      : entry.liked
                      ? t.personDetailView.pdfExport.likedPost
                      : t.personDetailView.pdfExport.commentedPost,
                    date: entry.timestamp,
                    postUrl: entry.postUrl,
                    ruptureBefore: entry.gapBefore,
                  })),
                  labels: {
                    statistics: t.personDetailView.pdfExport.statistics,
                    statConnection: t.personDetailView.pdfExport.statConnection,
                    statDuration: t.personDetailView.pdfExport.statDuration,
                    statDurationHint: t.personDetailView.pdfExport.statDurationHint,
                    statMutual: t.personDetailView.connection.mutual,
                    statMutualHint: t.personDetailView.stats.inCommon,
                    statSignals: t.personDetailView.pdfExport.statSignals,
                    statSignalsHint: t.personDetailView.pdfExport.statSignalsHint,
                    addedOnSimple: (date: string) => interpolate(t.personDetailView.pdfExport.addedOnSimple, { date }),
                    interactionTimeline: t.personDetailView.interactionTimeline,
                    noInteractionYet: t.personDetailView.pdfExport.noInteractionYetPeriod,
                    breakBefore: (count: number) => interpolate(t.personDetailView.break, { count }),
                    notesTitle: t.personDetailView.notes.title,
                    noNotesYet: t.personDetailView.notes.noNotesYet,
                    generatedBy: (date: string) => interpolate(t.common.pdfExport.generatedBy, { date }),
                  },
                });
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {t.personDetailView.exportPdf}
            </button>
            <button
              onClick={() => {
                const raw = window.prompt(t.personDetailView.renamePrompt, person.instagramUsername);
                if (raw == null) return; // annulé
                const next = raw.trim().replace(/^@+/, '');
                if (next && next.toLowerCase() !== person.instagramUsername.toLowerCase()) {
                  onRename(next);
                }
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              {t.personDetailView.rename}
            </button>
            <button
              onClick={onDelete}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors flex items-center gap-2"
            >
              <Trash className="w-4 h-4" />
              {t.personDetailView.delete}
            </button>
          </div>
        </div>

        {/* Score Badge */}
        <div className="flex items-center gap-3 mb-6">
          {isInCircle(person) && person.circle && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
              person.circle === 'vip' ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' :
              person.circle === 'keep' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
              'bg-gray-500/20 border-gray-500/30 text-gray-400'
            }`}>
              {getCircleConfig(person.circle).icon}
              <span className="font-semibold">{t.personBadges[person.circle]}</span>
            </div>
          )}
          {/* Statut unique du contact : on affiche la température calculée à partir des
              dynamiques de conversation (avec score), qui reflète le ressenti/l'approche.
              Le `prospectStatus` manuel reste éditable mais n'apparaît plus ici pour éviter
              deux badges contradictoires (ex. "Froid" manuel vs "Chaud · 70/100" calculé). */}
          {(() => {
            // Ressenti effectif : température calculée en priorité, repli sur statut manuel.
            const temp = getEffectiveTemperature(person);
            if (!temp) return null;
            // Le score d'analyse n'est montré que s'il correspond encore au ressenti
            // affiché (après un override manuel, il ne refléterait plus rien).
            const showScore = person.dynamics && person.dynamics.temperature === temp;
            return (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                temp === 'hot' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                temp === 'warm' ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
                'bg-blue-500/20 border-blue-500/30 text-blue-400'
              }`}>
                {temp === 'hot' && <Flame className="w-4 h-4" />}
                {temp === 'warm' && <Thermometer className="w-4 h-4" />}
                {temp === 'cold' && <Snowflake className="w-4 h-4" />}
                <span className="font-semibold">
                  {interpolate(t.personDetailView.sentiment, { temp: temp === 'hot' ? t.personBadges.hot : temp === 'warm' ? t.personBadges.warm : t.personBadges.cold })}
                  {showScore ? ` · ${person.dynamics!.temperatureScore}/100` : ''}
                </span>
              </div>
            );
          })()}
          {person.settingPhase && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border bg-emerald-500/20 border-emerald-500/30 text-emerald-400">
              <Target className="w-4 h-4" />
              <span className="font-semibold">{interpolate(t.personDetailView.settingLabel, { phase: getSettingPhaseLabel(person.settingPhase, t.settingPhases) })}</span>
            </div>
          )}
          {keywordHits > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border bg-[#02c950]/20 border-[#02c950]/40 text-[#02c950]">
              <Hash className="w-4 h-4" />
              <span className="font-semibold">{t.personDetailView.keywordBadge}{keywordHits > 1 ? ` · ${keywordHits}` : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border bg-purple-500/20 border-purple-500/30 text-purple-400">
            <span className="text-sm">{interpolate(t.personDetailView.scoreLabel, { score: displayScore })}</span>
          </div>
        </div>

        {/* Setting — qualification : prochaine étape, ce qui est révélé, faits clés */}
        {person.settingSummary && (
          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              {t.personDetailView.settingQualification}
              {person.settingPhase && (
                <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                  {getSettingPhaseLabel(person.settingPhase, t.settingPhases)}
                </span>
              )}
            </h3>

            {/* Prédiction : priorité d'action + momentum */}
            {(person.settingSummary.priority || person.settingSummary.momentum) && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {person.settingSummary.priority && (() => {
                  const map: Record<string, { label: string; cls: string }> = {
                    close: { label: t.personCard.priority.closeNow, cls: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' },
                    qualify: { label: t.personCard.priority.qualify, cls: 'bg-blue-500/20 border-blue-500/30 text-blue-300' },
                    reengage: { label: t.personCard.priority.reengage, cls: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
                    nurture: { label: t.personCard.priority.nurture, cls: 'bg-white/10 border-white/20 text-gray-300' },
                  };
                  const p = map[person.settingSummary.priority] || map.nurture;
                  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${p.cls}`}>{p.label}</span>;
                })()}
                {person.settingSummary.momentum && (() => {
                  const map: Record<string, { label: string; Icon: any; cls: string }> = {
                    accelerating: { label: t.personDetailView.momentum.rising, Icon: TrendingUp, cls: 'text-emerald-400' },
                    cooling: { label: t.personDetailView.momentum.cooling, Icon: TrendingDown, cls: 'text-red-400' },
                    steady: { label: t.personDetailView.momentum.steady, Icon: Thermometer, cls: 'text-gray-400' },
                  };
                  const m = map[person.settingSummary.momentum] || map.steady;
                  return (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.cls}`}>
                      <m.Icon className="w-3.5 h-3.5" />{m.label}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Prochaine étape (action prioritaire) */}
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 mb-4">
              <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-emerald-400/80 mb-0.5">{t.personDetailView.nextStep}</div>
                <span className="text-sm">{person.settingSummary.nextStep}</span>
              </div>
            </div>

            {/* Prédiction : probabilité de closer maintenant (momentum inclus) */}
            {typeof person.settingSummary.closeProbability === 'number' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{t.personDetailView.closeProbability}</span>
                  <span className="text-xs font-bold text-white">{person.settingSummary.closeProbability}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      person.settingSummary.closeProbability >= 65
                        ? 'bg-emerald-400'
                        : person.settingSummary.closeProbability >= 35
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                    }`}
                    style={{ width: `${person.settingSummary.closeProbability}%` }}
                  />
                </div>
              </div>
            )}

            {/* Readiness au closing (0-100) */}
            {typeof person.settingSummary.qualificationScore === 'number' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{t.personDetailView.closeReadiness}</span>
                  <span className="text-xs font-bold text-white">{person.settingSummary.qualificationScore}/100</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      person.settingSummary.qualificationScore >= 70
                        ? 'bg-emerald-400'
                        : person.settingSummary.qualificationScore >= 40
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                    }`}
                    style={{ width: `${person.settingSummary.qualificationScore}%` }}
                  />
                </div>
              </div>
            )}

            {/* Offre recommandée */}
            {person.settingSummary.recommendedOffer && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 mb-4">
                <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-blue-300/80 mb-0.5">{t.personDetailView.recommendedOffer}</div>
                  <span className="text-sm">{person.settingSummary.recommendedOffer}</span>
                </div>
              </div>
            )}

            {/* Tactique de closing prioritaire */}
            {person.settingSummary.closingTactic && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 mb-4">
                <Flame className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-red-300/80 mb-0.5">{t.personDetailView.closingTactic}</div>
                  <span className="text-sm">{person.settingSummary.closingTactic}</span>
                </div>
              </div>
            )}

            {/* Ce que le prospect a révélé */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { label: t.personDetailView.revealed.goal, ok: person.settingSummary.revealed.objective },
                { label: t.personDetailView.revealed.situation, ok: person.settingSummary.revealed.situation },
                { label: t.personDetailView.revealed.pain, ok: person.settingSummary.revealed.pain },
              ]).map((r) => (
                <div
                  key={r.label}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm ${
                    r.ok
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-gray-500'
                  }`}
                >
                  {r.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {r.label}
                </div>
              ))}
            </div>

            {/* Faits clés extraits de la conversation */}
            {(person.settingSummary.facts.budget ||
              person.settingSummary.facts.timeline ||
              person.settingSummary.facts.goal ||
              person.settingSummary.facts.activity) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {person.settingSummary.facts.activity && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">{t.personDetailView.facts.activity}</div>
                    <div className="text-sm font-bold text-white">{person.settingSummary.facts.activity}</div>
                  </div>
                )}
                {person.settingSummary.facts.budget && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">{t.personDetailView.facts.budget}</div>
                    <div className="text-sm font-bold text-white">{person.settingSummary.facts.budget}</div>
                  </div>
                )}
                {person.settingSummary.facts.goal && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">{t.personDetailView.facts.targetFigure}</div>
                    <div className="text-sm font-bold text-white">{person.settingSummary.facts.goal}</div>
                  </div>
                )}
                {person.settingSummary.facts.timeline && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">{t.personDetailView.facts.timing}</div>
                    <div className="text-sm font-bold text-white">{person.settingSummary.facts.timeline}</div>
                  </div>
                )}
              </div>
            )}

            {/* Objections détectées */}
            {person.settingSummary.facts.objections.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-2">{t.personDetailView.detectedObjections}</div>
                <div className="flex flex-wrap gap-2">
                  {person.settingSummary.facts.objections.map((o, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* À creuser (axes encore non qualifiés) */}
            {person.settingSummary.missing.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2">{t.personDetailView.toExplore}</div>
                <div className="flex flex-wrap gap-2">
                  {person.settingSummary.missing.map((m, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamique de conversation + conseils (axe température) */}
        {(person.dynamics || (person.advice && person.advice.length > 0)) && (
          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-orange-400" />
              {t.personDetailView.conversationDynamics}
            </h3>

            {person.dynamics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {t.personDetailView.theirAvgReply}</div>
                  <div className="text-lg font-bold text-white">{formatResponseTime(person.dynamics.theirAvgResponseMs)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {t.personDetailView.yourAvgReply}</div>
                  <div className="text-lg font-bold text-white">{formatResponseTime(person.dynamics.myAvgResponseMs)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">{t.personDetailView.responseRate}</div>
                  <div className="text-lg font-bold text-white">{Math.round(person.dynamics.theirResponseRate * 100)}%</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">{t.personDetailView.shortReplies}</div>
                  <div className="text-lg font-bold text-white">{Math.round(person.dynamics.briefReplyRatio * 100)}%</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">{t.personDetailView.messages}</div>
                  <div className="text-lg font-bold text-white">{person.dynamics.msgCount}</div>
                  <div className="text-xs text-gray-500">{interpolate(t.personDetailView.receivedSent, { received: person.dynamics.theirMsgCount, sent: person.dynamics.myMsgCount })}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    {person.dynamics.cadenceTrend === 'up' ? <TrendingUp className="w-3 h-3 text-green-400" /> :
                     person.dynamics.cadenceTrend === 'down' ? <TrendingDown className="w-3 h-3 text-red-400" /> : null}
                    {t.personDetailView.cadence}
                  </div>
                  <div className="text-lg font-bold text-white">
                    {person.dynamics.cadenceTrend === 'up' ? t.personDetailView.cadenceTrend.rising : person.dynamics.cadenceTrend === 'down' ? t.personDetailView.cadenceTrend.falling : t.personDetailView.cadenceTrend.steady}
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Eye className="w-3 h-3" /> {t.personDetailView.lastMessage}</div>
                  <div className="text-lg font-bold text-white">
                    {person.dynamics.seenNotAnswered ? t.personDetailView.lastMessageStatus.seenNoReply : person.dynamics.lastMessageIsSent ? t.personDetailView.lastMessageStatus.fromYou : t.personDetailView.lastMessageStatus.fromThem}
                  </div>
                </div>
              </div>
            )}

            {person.advice && person.advice.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-400 mb-1">{t.personDetailView.relationshipAdvice}</div>
                {person.advice.map((tip, idx) => (
                  <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                    <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{tip}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-6">
          <Calendar className="w-3 h-3" />
          <span>{interpolate(t.personDetailView.addedOn, { date: formatDate(person.addedAt), days: person.followDuration || 0 })}</span>
        </div>

        {/* Main Score Card */}
        <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">{scoreLabel}</h2>
              <p className="text-sm text-gray-400 mb-4">{scoreSubtitle}</p>
              <p className="text-xs text-gray-500">
                {t.personDetailView.scoreBasedOn}
              </p>
            </div>
            <div className="text-6xl font-black text-white">{displayScore}</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{t.personDetailView.stats.connectionStatus}</div>
            <div className="text-lg font-bold text-white">
              {person.followsYou && person.youFollow ? t.personDetailView.connection.mutual :
               person.followsYou ? t.personDetailView.connection.followsYou :
               person.youFollow ? t.personDetailView.connection.youFollow : t.personDetailView.connection.none}
            </div>
            <div className="text-xs text-gray-500">
              {person.followsYou && person.youFollow ? t.personDetailView.stats.followEachOther :
               person.followsYou ? t.personDetailView.stats.followsYouDesc :
               person.youFollow ? t.personDetailView.stats.youFollowThemDesc : t.personDetailView.stats.noFollow}
            </div>
          </div>

          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{t.personDetailView.stats.connectionLength}</div>
            <div className="text-lg font-bold text-white">{interpolate(t.personDetailView.stats.days, { count: person.followDuration || 0 })}</div>
            <div className="text-xs text-gray-500">{t.personDetailView.stats.recentConnection}</div>
          </div>

          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{t.personDetailView.stats.mutualConnectionsLabel}</div>
            <div className="text-lg font-bold text-white">{person.mutualConnections || 0}</div>
            <div className="text-xs text-gray-500">{t.personDetailView.stats.inCommon}</div>
          </div>

          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{t.personDetailView.stats.detectedSignals}</div>
            <div className="text-lg font-bold text-white">{signals.length}</div>
            <div className="text-xs text-gray-500">{t.personDetailView.stats.total}</div>
          </div>

          {keywordHits > 0 && (
            <div className="bg-black/80 backdrop-blur-sm border border-[#02c950]/30 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Hash className="w-3 h-3 text-[#02c950]" /> {t.personDetailView.stats.keywordHits}</div>
              <div className="text-lg font-bold text-[#02c950]">{keywordHits}</div>
              <div className="text-xs text-gray-500">{t.personDetailView.stats.keywordHitsHint}</div>
            </div>
          )}
        </div>

        {/* Liste des connexions en commun (comptes suivis par les deux) */}
        {person.mutualConnectionsList && person.mutualConnectionsList.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              {t.personDetailView.mutualConnectionsTitle}
              <span className="text-sm font-normal text-gray-400">({person.mutualConnectionsList.length})</span>
            </h3>
            <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-wrap gap-2">
              {person.mutualConnectionsList.map((u) => (
                <a
                  key={u}
                  href={`https://instagram.com/${u}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  @{u}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Évolution de la relation (follow / unfollow / ghost / refollow) */}
        {relationSignals.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4">{t.personDetailView.relationshipEvolution}</h3>
            <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              {relationSignals.map((signal, idx) => {
                const config = relationConfig[signal.type] || relationConfig.follow;
                const Icon = config.Icon;
                return (
                  <div key={signal.type + '-' + idx} className="flex items-stretch gap-3">
                    <div className="relative flex flex-col items-center w-6 flex-shrink-0">
                      <div className="absolute top-0 bottom-0 w-px bg-white/15" />
                      <div className="relative z-10 mt-1 w-6 h-6 rounded-full bg-black border border-white/20 flex items-center justify-center">
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                      </div>
                    </div>
                    <div className="flex-1 pb-5 pt-1">
                      <div className={`text-sm font-medium ${config.color}`}>{signal.description}</div>
                      <div className="text-xs text-gray-500 mt-1">{formatDate(signal.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline des interactions (streak : ligne continue, coupée aux ruptures) */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-white mb-4">{t.personDetailView.interactionTimeline}</h3>

          {/* Filtres par type */}
          <div className="flex flex-wrap gap-2 mb-3">
            {patternFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setSignalFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  signalFilter === f.key
                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {f.Icon && <f.Icon className="w-3.5 h-3.5" />}
                {f.label}{f.count !== null ? ` (${f.count})` : ''}
              </button>
            ))}
          </div>

          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            {filteredPattern.length > 0 ? (
              <div>
                {filteredPattern.map((entry, idx) => {
                  const showRail = signalFilter === 'all';
                  const ruptured = showRail && idx > 0 && entry.gapBefore > 0;
                  const label =
                    entry.liked && entry.commented
                      ? t.personDetailView.pdfExport.likedAndCommented
                      : entry.liked
                      ? t.personDetailView.pdfExport.likedPost
                      : t.personDetailView.pdfExport.commentedPost;
                  return (
                    <div key={entry.postId + '-' + idx}>
                      {/* Indication de rupture : la ligne se coupe */}
                      {ruptured && (
                        <div className="flex items-center gap-2 py-2 pl-0.5 text-xs text-orange-400">
                          <span className="inline-block w-5 border-t border-dashed border-orange-400/60" />
                          <span>{interpolate(t.personDetailView.break, { count: entry.gapBefore })}</span>
                        </div>
                      )}
                      <div className="flex items-stretch gap-3">
                        {/* Rail : ligne verticale (streak) + pastille */}
                        <div className="relative flex flex-col items-center w-6 flex-shrink-0">
                          {showRail && (
                            <div className="absolute top-0 bottom-0 w-px bg-green-500/40" />
                          )}
                          <div className={`relative z-10 mt-1 w-6 h-6 rounded-full bg-black border flex items-center justify-center ${entry.keyword ? 'border-[#02c950]/60' : 'border-white/20'}`}>
                            {entry.keyword ? (
                              <Hash className="w-3.5 h-3.5 text-[#02c950]" />
                            ) : entry.liked ? (
                              <Heart className="w-3.5 h-3.5 text-red-400" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                        </div>
                        {/* Contenu */}
                        <div className="flex-1 pb-5 pt-1">
                          <div className="text-sm text-white flex items-center gap-1.5">
                            {label}
                            {entry.liked && entry.commented && (
                              <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                          {entry.keyword && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#02c950]/10 border border-[#02c950]/30 text-[#02c950] text-xs font-semibold">
                              <Hash className="w-3 h-3" />
                              {interpolate(t.personDetailView.keywordTag, { keyword: entry.keyword })}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">{formatDate(entry.timestamp)}</div>
                          {entry.postUrl && (
                            <a
                              href={entry.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-green-400 hover:text-green-300 underline mt-1 inline-block break-all"
                            >
                              {t.personDetailView.viewPost}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {pattern.length > 0 ? t.personDetailView.noInteractionType : t.personDetailView.noInteractionYet}
              </div>
            )}
          </div>
        </div>

        {/* Change Circle (for connections) */}
        {isInCircle(person) && (
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4">{t.personDetailView.changeCircle}</h3>
            <div className="grid grid-cols-3 gap-3">
              {(['vip', 'keep', 'watch'] as Circle[]).map((c) => {
                const config = getCircleConfig(c);
                const isActive = person.circle === c;
                return (
                  <button
                    key={c}
                    onClick={() => changeCircle(c)}
                    className={`p-4 rounded-xl border transition-all ${
                      isActive
                        ? c === 'vip' ? 'bg-yellow-500/20 border-yellow-500/30' :
                          c === 'keep' ? 'bg-blue-500/20 border-blue-500/30' :
                          'bg-gray-500/20 border-gray-500/30'
                        : 'bg-black/80 backdrop-blur-sm border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {config.icon}
                      <span className="font-semibold text-white">{config.label.split(' — ')[1]}</span>
                    </div>
                    <div className="text-xs text-gray-400">{config.desc}</div>
                    <div className="text-xs text-gray-500 mt-1">{config.max}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Change Status (for prospects) */}
        {isProspect(person) && (
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4">{t.personDetailView.changeStatus}</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['cold', 'warm', 'hot', 'converted', 'lost'] as ProspectStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => changeProspectStatus(status)}
                  className={`px-4 py-2 rounded-full border transition-all ${
                    person.prospectStatus === status
                      ? status === 'hot' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                        status === 'warm' ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
                        status === 'cold' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
                        status === 'converted' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
                        'bg-gray-500/20 border-gray-500/30 text-gray-400'
                      : 'bg-black/80 backdrop-blur-sm border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {status === 'hot' && <Flame className="w-4 h-4" />}
                    {status === 'warm' && <Thermometer className="w-4 h-4" />}
                    {status === 'cold' && <Snowflake className="w-4 h-4" />}
                    {status === 'converted' && <CheckCircle className="w-4 h-4" />}
                    {status === 'lost' && <AlertCircle className="w-4 h-4" />}
                    {status === 'hot' ? t.personBadges.hot :
                     status === 'warm' ? t.personBadges.warm :
                     status === 'cold' ? t.personBadges.cold :
                     status === 'converted' ? t.personBadges.converted : t.personBadges.lost}
                  </span>
                </button>
              ))}
            </div>
            {!person.converted && (
              <button
                onClick={toggleConversion}
                className="w-full px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all font-semibold"
              >
                {t.personDetailView.markAsConverted}
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">{t.personDetailView.notes.title}</h3>
            {!isEditingNotes && (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                {t.personDetailView.notes.edit}
              </button>
            )}
          </div>
          <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.personDetailView.notes.placeholder}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-500 transition-colors resize-none"
                  rows={6}
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveNotes}
                    className="flex-1 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                  >
                    {t.personDetailView.notes.save}
                  </button>
                  <button
                    onClick={() => {
                      setNotes(person.notes || '');
                      setIsEditingNotes(false);
                    }}
                    className="flex-1 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
                  >
                    {t.personDetailView.notes.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-300 whitespace-pre-wrap">
                {notes || <span className="text-gray-500 italic">{t.personDetailView.notes.noNotesYet}</span>}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
