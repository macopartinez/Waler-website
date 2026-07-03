import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, Info, Lightbulb, Crown, Star, Eye, Instagram, Snowflake, Thermometer, Flame, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { ProspectStatus, Circle } from "./types";
import type { InstagramAccount } from "@/hooks/use-accounts";
import { checkInstagramUsername } from "@/lib/extension";
import { useLanguage } from "@/contexts/LanguageContext";

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (person: NewPersonData) => void;
  /** Comptes Instagram disponibles pour rattacher la personne. */
  accounts: InstagramAccount[];
  /** Compte pré-sélectionné (compte actif du dashboard). */
  defaultAccountId: number | null;
}

export interface NewPersonData {
  instagramUsername: string;
  displayName: string;
  followsYou: boolean;
  youFollow: boolean;
  sector?: string;
  isProspect: boolean;
  prospectStatus?: ProspectStatus;
  isInCircle: boolean;
  circle?: Circle;
  /** Compte par lequel l'utilisateur est en contact avec cette personne. */
  accountId: number;
  accountUsername: string;
  /** Ajoutée depuis une suggestion (engagement déjà connu) vs ajout manuel.
   *  Métadonnée de provenance — la collecte de profil au 1er « Analyze » a lieu
   *  dans les deux cas (cf. /api/extension/person-profile). */
  fromSuggestion?: boolean;
}

export function AddPersonModal({ isOpen, onClose, onAdd, accounts, defaultAccountId }: AddPersonModalProps) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [followsYou, setFollowsYou] = useState(false);
  const [youFollow, setYouFollow] = useState(false);
  const [sector, setSector] = useState("");
  const [isProspect, setIsProspect] = useState(false);
  const [prospectStatus, setProspectStatus] = useState<ProspectStatus>('cold');
  const [isInCircle, setIsInCircle] = useState(false);
  const [circle, setCircle] = useState<Circle>('watch');
  const [accountId, setAccountId] = useState<number | null>(defaultAccountId);
  const [isLoading, setIsLoading] = useState(false);
  // Vérification anti-faute de frappe : on confirme que le pseudo existe sur
  // Instagram (via l'extension) avant de l'ajouter. `notFound` → on demande
  // confirmation explicite ("Add anyway").
  const [checkState, setCheckState] = useState<"idle" | "checking" | "not_found">("idle");

  // Toute modification du pseudo invalide la vérification précédente.
  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (checkState !== "idle") setCheckState("idle");
  };

  // Pré-remplir avec le compte actif à l'ouverture (ou si le défaut change).
  useEffect(() => {
    if (isOpen) {
      setAccountId((current) => current ?? defaultAccountId ?? accounts[0]?.id ?? null);
    }
  }, [isOpen, defaultAccountId, accounts]);

  const handleSubmit = async () => {
    if (!username.trim() || !displayName.trim()) return;
    if (!isProspect && !isInCircle) {
      alert(t.addPersonModal.checkOneOption);
      return;
    }
    const selectedAccount = accounts.find((a) => a.id === accountId);
    if (!selectedAccount) {
      alert(t.addPersonModal.chooseAccount);
      return;
    }

    // Anti-faute de frappe : tant que l'utilisateur n'a pas confirmé un pseudo
    // introuvable, on vérifie son existence sur Instagram. `unknown` (extension
    // absente / non connectée / rate-limit) → on n'empêche pas l'ajout.
    if (checkState !== "not_found") {
      setCheckState("checking");
      const result = await checkInstagramUsername(username);
      if (result.status === "not_found") {
        setCheckState("not_found");
        return;
      }
      setCheckState("idle");
    }

    setIsLoading(true);
    try {
      await onAdd({
        instagramUsername: username.trim(),
        displayName: displayName.trim(),
        followsYou,
        youFollow,
        sector: sector.trim() || undefined,
        isProspect,
        prospectStatus: isProspect ? prospectStatus : undefined,
        isInCircle,
        circle: isInCircle ? circle : undefined,
        accountId: selectedAccount.id,
        accountUsername: selectedAccount.username,
      });

      // Reset form (on garde le compte sélectionné pour les ajouts en série)
      setUsername("");
      setDisplayName("");
      setFollowsYou(false);
      setYouFollow(false);
      setSector("");
      setIsProspect(false);
      setProspectStatus('cold');
      setIsInCircle(false);
      setCircle('watch');
      setCheckState("idle");
      onClose();
    } catch (error) {
      console.error("Failed to add person:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-3xl max-w-lg w-full pointer-events-auto shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="border-b border-white/10 p-4 sticky top-0 bg-black/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-black text-white">{t.addPersonModal.title}</h2>
                    <p className="text-xs text-gray-400">{t.addPersonModal.subtitle}</p>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="p-4 space-y-4">
                {/* Instagram Username */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t.addPersonModal.usernameLabel}
                  </label>
                  <div className="relative">
                    <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      placeholder={t.addPersonModal.usernamePlaceholder}
                      className={`w-full pl-12 pr-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm border text-white placeholder:text-gray-500 focus:outline-none transition-colors text-sm ${
                        checkState === "not_found"
                          ? "border-amber-500/60 focus:border-amber-500"
                          : "border-white/10 focus:border-green-500"
                      }`}
                    />
                  </div>
                  {checkState === "not_found" && (
                    <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-200">
                        {t.addPersonModal.notFoundPrefix} <strong>@{username.trim().replace(/^@/, "")}</strong> {t.addPersonModal.notFoundMiddle} <strong>{t.addPersonModal.notFoundButton}</strong> {t.addPersonModal.notFoundEnd}
                      </p>
                    </div>
                  )}
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t.addPersonModal.displayNameLabel}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t.addPersonModal.displayNamePlaceholder}
                    className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-500 transition-colors text-sm"
                  />
                </div>

                {/* Compte de contact (obligatoire) */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t.addPersonModal.contactAccountLabel}
                  </label>
                  <select
                    value={accountId ?? ''}
                    onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 text-white focus:outline-none focus:border-green-500 transition-colors text-sm [&>option]:bg-black [&>option]:text-white"
                  >
                    <option value="" disabled>{t.addPersonModal.chooseAccountPlaceholder}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        @{a.username}{a.isOwner ? t.addPersonModal.primarySuffix : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t.addPersonModal.contactAccountHint}
                  </p>
                </div>

                {/* Sector */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {t.addPersonModal.sectorLabel}
                  </label>
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder={t.addPersonModal.sectorPlaceholder}
                    className="w-full px-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-500 transition-colors text-sm"
                  />
                </div>

                {/* Follow Status */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={followsYou}
                      onChange={(e) => setFollowsYou(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-green-500 focus:ring-green-500"
                    />
                    <span className="text-sm text-white">{t.addPersonModal.followsYou}</span>
                  </label>
                  <label className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={youFollow}
                      onChange={(e) => setYouFollow(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white">{t.addPersonModal.youFollowThem}</span>
                  </label>
                </div>

                {/* Help Text */}
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-green-500/20">
                  <Lightbulb className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-200">
                    <strong>{t.addPersonModal.tipLabel}</strong> {t.addPersonModal.tipBody}
                  </div>
                </div>

                {/* Prospect Option */}
                <div className="border border-white/10 rounded-xl p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isProspect}
                      onChange={(e) => setIsProspect(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-green-500 focus:ring-green-500"
                    />
                    <span className="text-sm font-semibold text-white">{t.addPersonModal.trackAsProspect}</span>
                  </label>

                  {isProspect && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block text-sm font-medium text-white mb-2">
                        {t.addPersonModal.initialStatus}
                      </label>
                      <select
                        value={prospectStatus}
                        onChange={(e) => setProspectStatus(e.target.value as ProspectStatus)}
                        className="w-full px-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm border border-white/10 text-white focus:outline-none focus:border-green-500 transition-colors text-sm [&>option]:bg-black [&>option]:text-white"
                      >
                        <option value="cold">{t.addPersonModal.statusCold}</option>
                        <option value="warm">{t.addPersonModal.statusWarm}</option>
                        <option value="hot">{t.addPersonModal.statusHot}</option>
                      </select>
                    </motion.div>
                  )}
                </div>

                {/* Circle Option */}
                <div className="border border-white/10 rounded-xl p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInCircle}
                      onChange={(e) => setIsInCircle(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-white">{t.addPersonModal.addToCircle}</span>
                  </label>

                  {isInCircle && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block text-sm font-medium text-white mb-2">
                        {t.addPersonModal.priorityCircle}
                      </label>
                      <select
                        value={circle}
                        onChange={(e) => setCircle(e.target.value as Circle)}
                        className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm [&>option]:bg-black [&>option]:text-white"
                      >
                        <option value="vip">{t.addPersonModal.circleVip}</option>
                        <option value="keep">{t.addPersonModal.circleKeep}</option>
                        <option value="watch">{t.addPersonModal.circleWatch}</option>
                      </select>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 p-4 flex gap-3 sticky bottom-0 bg-black/80 backdrop-blur-sm">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm hover:bg-white/10 text-white font-medium transition-colors text-sm"
                >
                  {t.addPersonModal.cancel}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!username.trim() || !displayName.trim() || (!isProspect && !isInCircle) || !accountId || isLoading || checkState === "checking"}
                  className={`flex-1 px-4 py-2 rounded-xl text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                    checkState === "not_found"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-[0_0_30px_rgba(245,158,11,0.5)]"
                      : "bg-gradient-to-r from-green-500 to-emerald-500 hover:shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                  }`}
                >
                  {checkState === "checking" ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.addPersonModal.checking}
                    </span>
                  ) : isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.addPersonModal.adding}
                    </span>
                  ) : checkState === "not_found" ? (
                    t.addPersonModal.addAnyway
                  ) : (
                    t.addPersonModal.add
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
