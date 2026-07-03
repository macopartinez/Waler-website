import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, MessageCircle, UserCheck, UserX, Clock, Eye, Target, Crown, Star, CheckCircle, Folder, MoreVertical, AlertCircle, Users } from "lucide-react";
import { useState } from "react";
import { Person, getDisplayBadges, isProspect, isInCircle, getTemperatureBorderClass, getEffectiveTemperature } from "./types";
import { BadgeIcon } from "./BadgeIcon";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

interface PersonCardProps {
  person: Person;
  onClick: () => void;
  onEdit?: (person: Person) => void;
  onDelete?: (person: Person) => void;
}

export function PersonCard({ person, onClick, onEdit, onDelete }: PersonCardProps) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const [showMutuals, setShowMutuals] = useState(false);
  
  const badges = getDisplayBadges(person, t.personBadges);
  
  const formatDuration = (days: number) => {
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (score >= 50) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getScoreLabel = (score: number, type: 'prospect' | 'health') => {
    if (type === 'prospect') {
      if (score >= 75) return t.personCard.scoreLabels.hotProspect;
      if (score >= 50) return t.personCard.scoreLabels.warmProspect;
      return t.personCard.scoreLabels.coldProspect;
    } else {
      if (score >= 75) return t.personCard.scoreLabels.strongConnection;
      if (score >= 50) return t.personCard.scoreLabels.needsAttention;
      return t.personCard.scoreLabels.fragileConnection;
    }
  };

  // Encart prospect : le libellé et la couleur suivent le RESSENTI (température
  // effective : calculée, repli sur statut manuel), pas le seuil de score brut.
  // Ainsi un changement manuel de ressenti se reflète tout de suite ici, en
  // cohérence avec le badge et le contour de la carte.
  const effectiveTemp = getEffectiveTemperature(person);
  const prospectLabel =
    effectiveTemp === 'hot' ? t.personCard.scoreLabels.hotProspect :
    effectiveTemp === 'warm' ? t.personCard.scoreLabels.warmProspect :
    effectiveTemp === 'cold' ? t.personCard.scoreLabels.coldProspect :
    getScoreLabel(person.score ?? 0, 'prospect');
  const prospectColor =
    effectiveTemp === 'hot' ? 'text-red-400 bg-red-500/20 border-red-500/30' :
    effectiveTemp === 'warm' ? 'text-orange-400 bg-orange-500/20 border-orange-500/30' :
    effectiveTemp === 'cold' ? 'text-blue-400 bg-blue-500/20 border-blue-500/30' :
    getScoreColor(person.score ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`relative bg-black/80 backdrop-blur-sm bg-gradient-to-br from-white/5 to-white/[0.02] border rounded-2xl p-6 cursor-pointer transition-all group overflow-hidden ${getTemperatureBorderClass(person)}`}
    >
      <div className="relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-xl font-bold text-white">{person.displayName}</h3>
            {badges.map((badge, idx) => (
              <div key={idx} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${badge.color}`}>
                <BadgeIcon iconName={badge.icon} className="w-3 h-3" />
                <span className="font-semibold">{badge.label}</span>
              </div>
            ))}
          </div>
          <a
            href={`https://instagram.com/${person.instagramUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-gray-400 hover:text-green-400 transition-colors"
          >
            @{person.instagramUsername}
          </a>
          {person.sector && (
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Folder className="w-3 h-3" />
              {person.sector}
            </div>
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Scores */}
      {isProspect(person) && person.score !== undefined && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border mb-3 ${prospectColor}`}>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{prospectLabel}</span>
          </div>
          <span className="text-2xl font-black">{person.score}/100</span>
        </div>
      )}

      {isInCircle(person) && person.healthScore !== undefined && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border mb-3 ${getScoreColor(person.healthScore)}`}>
          <div className="flex items-center gap-2">
            {person.healthScore >= 75 ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="font-semibold">{getScoreLabel(person.healthScore, 'health')}</span>
          </div>
          <span className="text-2xl font-black">{person.healthScore}/100</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Follow Status */}
        <div className={`px-3 py-2 rounded-lg border ${
          person.followsYou && person.youFollow
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
        }`}>
          <div className="text-xs">{t.personCard.status.label}</div>
          <div className="text-sm font-bold">
            {person.followsYou && person.youFollow ? t.personCard.status.mutual :
             person.followsYou ? t.personCard.status.followsYou :
             person.youFollow ? t.personCard.status.youFollow : t.personCard.status.none}
          </div>
        </div>

        {/* Duration or Conversion */}
        {person.followDuration !== undefined ? (
          <div className="px-3 py-2 rounded-lg border bg-purple-500/10 border-purple-500/20 text-purple-300">
            <div className="text-xs">{t.personCard.duration}</div>
            <div className="text-sm font-bold">{formatDuration(person.followDuration)}</div>
          </div>
        ) : person.converted ? (
          <div className="px-3 py-2 rounded-lg border bg-green-500/10 border-green-500/20 text-green-300">
            <div className="text-xs">{t.personCard.status.label}</div>
            <div className="text-sm font-bold flex items-center gap-1">{t.personCard.converted} <CheckCircle className="w-3 h-3 text-green-400" /></div>
          </div>
        ) : null}
      </div>

      {/* Mutual Connections (dépliable si la liste des comptes en commun existe) */}
      {person.mutualConnections !== undefined && person.mutualConnections > 0 && (
        <div className="mb-3">
          {(() => {
            const hasList = !!person.mutualConnectionsList && person.mutualConnectionsList.length > 0;
            return (
              <button
                type="button"
                disabled={!hasList}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasList) setShowMutuals((v) => !v);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 ${hasList ? 'hover:bg-blue-500/20 cursor-pointer' : 'cursor-default'}`}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">{interpolate(t.personCard.mutualConnections, { count: person.mutualConnections })}</span>
                {hasList && <span className="ml-auto text-xs text-blue-400">{showMutuals ? t.personCard.hide : t.personCard.view}</span>}
              </button>
            );
          })()}
          {showMutuals && person.mutualConnectionsList && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {person.mutualConnectionsList.map((u) => (
                <a
                  key={u}
                  href={`https://instagram.com/${u}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  @{u}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prédiction : priorité d'action + probabilité de closing (coup d'œil) */}
      {person.settingSummary?.priority && (
        <div className="flex items-center gap-2 mb-3">
          {(() => {
            const map: Record<string, { label: string; cls: string }> = {
              close: { label: t.personCard.priority.closeNow, cls: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' },
              qualify: { label: t.personCard.priority.qualify, cls: 'bg-blue-500/20 border-blue-500/30 text-blue-300' },
              reengage: { label: t.personCard.priority.reengage, cls: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
              nurture: { label: t.personCard.priority.nurture, cls: 'bg-white/10 border-white/20 text-gray-300' },
            };
            const p = map[person.settingSummary.priority!] || map.nurture;
            return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${p.cls}`}>{p.label}</span>;
          })()}
          {typeof person.settingSummary.closeProbability === 'number' && (
            <span className="text-xs text-gray-400">{t.personCard.close} <span className="font-bold text-white">{person.settingSummary.closeProbability}%</span></span>
          )}
        </div>
      )}

      {/* Action prioritaire : prochaine étape de setting si dispo, sinon conseil
          relationnel (axe température). */}
      {(person.settingSummary?.nextStep || (person.advice && person.advice.length > 0)) && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 mb-3">
          <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{person.settingSummary?.nextStep || person.advice![0]}</span>
        </div>
      )}

      {/* Tactique de closing prioritaire (urgence / preuve) — action à fort effet */}
      {person.settingSummary?.closingTactic && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{person.settingSummary.closingTactic}</span>
        </div>
      )}

      {/* Last Signal */}
      {person.signals.length > 0 && (
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{t.personCard.latestSignal}</div>
          <div className="text-sm text-white">{person.signals[person.signals.length - 1].description}</div>
        </div>
      )}

      {/* Menu Dropdown */}
      {showMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-6 bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl z-10 min-w-[160px]"
        >
          <button 
            onClick={() => {
              setShowMenu(false);
              onClick();
            }}
            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
          >
            {t.personCard.menu.viewDetails}
          </button>
          <button 
            onClick={() => {
              setShowMenu(false);
              onEdit?.(person);
            }}
            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
          >
            {t.personCard.menu.edit}
          </button>
          <button 
            onClick={() => {
              setShowMenu(false);
              onDelete?.(person);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            {t.personCard.menu.delete}
          </button>
        </div>
      )}
      </div>
    </motion.div>
  );
}
