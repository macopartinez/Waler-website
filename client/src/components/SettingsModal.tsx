import { motion, AnimatePresence } from "framer-motion";
import { X, User, LogOut, Settings, Monitor, Database, Trash2, Crown, Loader2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAccounts, useDeleteAccount, useResetAccount, type InstagramAccount } from "@/hooks/use-accounts";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { maxAccountsForTier, maxAccountsLabel } from "@shared/accounts";
import { fallbackAvatar } from "@/lib/utils";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  user: {
    username?: string;
    email?: string;
  };
  /**
   * Si fourni, affiche l'onglet « Data » (gestion des données locales).
   * Spécifique au mode Pro, qui stocke ses personnes en localStorage.
   */
  onClearData?: () => void;
}

export function SettingsModal({ isOpen, onClose, onLogout, user, onClearData }: SettingsModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'account' | 'display' | 'data'>('account');
  const [disableAnimation, setDisableAnimation] = useState(() => {
    return localStorage.getItem('disableBackgroundAnimation') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('disableBackgroundAnimation', disableAnimation.toString());
    window.dispatchEvent(new CustomEvent('animationPreferenceChanged', { detail: { disabled: disableAnimation } }));
  }, [disableAnimation]);

  const tabs = [
    { id: 'account', label: t.settingsModal.tabs.account, icon: User },
    { id: 'display', label: t.settingsModal.tabs.display, icon: Monitor },
    ...(onClearData ? [{ id: 'data', label: t.settingsModal.tabs.data, icon: Database }] : []),
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-2xl bg-black rounded-2xl border border-[#02c950]/30 max-h-[80vh] overflow-hidden"
              style={{ boxShadow: "0 24px 60px -24px rgba(0,0,0,0.85), 0 0 60px -16px rgba(2,201,80,0.25)" }}
            >

              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#02c950]/10 border border-[#02c950]/30 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-[#02c950]" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">{t.settingsModal.title}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 px-6 pt-4 border-b border-white/10 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-t-xl transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-white/10 text-white border-b-2 border-[#02c950]'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
                {activeTab === 'account' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">{t.settingsModal.account.heading}</h3>
                      <div className="space-y-4">
                        <div className="bg-white/5 rounded-xl p-4">
                          <label className="text-sm text-gray-400 block mb-1">{t.settingsModal.account.emailLabel}</label>
                          <p className="text-white font-medium">{user.email || t.settingsModal.account.notSet}</p>
                        </div>
                      </div>
                    </div>

                    <AccountsManager />

                    <div className="pt-4 border-t border-white/10">
                      <button
                        onClick={onLogout}
                        className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        {t.settingsModal.account.logout}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'display' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white mb-4">{t.settingsModal.display.heading}</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-white/5 rounded-xl p-4">
                        <div>
                          <p className="text-white font-medium">{t.settingsModal.display.disableAnimTitle}</p>
                          <p className="text-sm text-gray-400">{t.settingsModal.display.disableAnimDesc}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={disableAnimation}
                            onChange={(e) => setDisableAnimation(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#02c950]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'data' && onClearData && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white mb-4">{t.settingsModal.data.heading}</h3>
                    <div className="space-y-4">
                      <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-white font-medium mb-2">{t.settingsModal.data.clearTitle}</p>
                        <p className="text-sm text-gray-400 mb-4">{t.settingsModal.data.clearDesc}</p>
                        <button
                          onClick={() => {
                            if (confirm(t.settingsModal.data.clearConfirm)) {
                              localStorage.removeItem('pro-people');
                              localStorage.removeItem('pro-connections');
                              localStorage.removeItem('pro-prospects');
                              onClearData();
                              window.location.reload();
                            }
                          }}
                          className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t.settingsModal.data.clearButton}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Gestion multi-compte dans les paramètres : compteur N/max selon le plan,
 * statut de chaque compte (Principal / Lié), définir un compte comme principal,
 * et suppression d'un compte lié. Toutes les actions sont fonctionnelles (API).
 */
function AccountsManager() {
  const { t } = useLanguage();
  const { data, isLoading } = useAccounts();
  const { tier } = useSubscription();
  const deleteAccount = useDeleteAccount();
  const resetAccount = useResetAccount();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="pt-4 border-t border-white/10 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t.settingsModal.account.loadingAccounts}
      </div>
    );
  }

  const accounts = (data.accounts || []).filter((a) => a.username && a.username.trim());
  const max = maxAccountsForTier(tier);
  const maxLabel = maxAccountsLabel(tier);
  const atLimit = accounts.length >= max;
  const ownerUsername = accounts.find((a) => a.isOwner)?.username || "";
  const linkedCount = accounts.filter((a) => !a.isOwner).length;

  const handleDelete = async (a: InstagramAccount) => {
    if (!confirm(interpolate(t.settingsModal.account.deleteConfirm, { username: a.username }))) return;
    setError(null);
    setBusyId(a.id);
    try {
      await deleteAccount.mutateAsync(a.id);
    } catch (e: any) {
      setError(e.message || t.settingsModal.account.deleteError);
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async () => {
    if (resetInput.trim().toLowerCase() !== ownerUsername.toLowerCase()) return;
    setResetError(null);
    setResetBusy(true);
    try {
      await resetAccount.mutateAsync(resetInput.trim());
      setShowResetConfirm(false);
      setResetInput("");
    } catch (e: any) {
      setResetError(e.message || t.settingsModal.account.resetError);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">{t.settingsModal.account.accountsHeading}</h3>
        <span
          className={`text-sm font-semibold px-2.5 py-1 rounded-lg border ${
            atLimit
              ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
              : 'text-[#02c950] bg-[#02c950]/10 border-[#02c950]/30'
          }`}
        >
          {accounts.length} / {maxLabel}
        </span>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((a) => {
          const isPrimary = a.isOwner;
          const isBusy = busyId === a.id;
          return (
            <div key={a.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
              <img src={fallbackAvatar(a.username)} alt={a.username} className="w-9 h-9 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">@{a.username}</span>
                  {isPrimary ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#02c950] bg-[#02c950]/10 border border-[#02c950]/30 px-1.5 py-0.5 rounded">
                      <Crown className="w-3 h-3" /> {t.settingsModal.account.primary}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                      {t.settingsModal.account.linked}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500">
                  {typeof a.followersCount === "number" ? interpolate(t.settingsModal.account.followersCount, { count: a.followersCount }) : t.settingsModal.account.noData}
                </div>
              </div>

              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : (
                !isPrimary && (
                  <button
                    onClick={() => handleDelete(a)}
                    title={t.settingsModal.account.deleteTooltip}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {atLimit && max !== Infinity && (
        <p className="mt-3 text-xs text-gray-500">
          {t.settingsModal.account.limitReached}
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-red-500/20">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h4 className="text-sm font-bold text-red-300">{t.settingsModal.account.resetHeading}</h4>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {linkedCount > 0
            ? interpolate(t.settingsModal.account.resetDesc, { count: linkedCount })
            : t.settingsModal.account.resetDescNoLinked}
        </p>

        {!showResetConfirm ? (
          <button
            onClick={() => { setShowResetConfirm(true); setResetError(null); setResetInput(""); }}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {t.settingsModal.account.resetButton}
          </button>
        ) : (
          <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4 space-y-3">
            {resetError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {resetError}
              </div>
            )}
            <label className="text-xs text-gray-400 block">
              {interpolate(t.settingsModal.account.resetConfirmLabel, { username: ownerUsername })}
            </label>
            <input
              type="text"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder={ownerUsername}
              className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50"
              disabled={resetBusy}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowResetConfirm(false); setResetInput(""); setResetError(null); }}
                disabled={resetBusy}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {t.settingsModal.account.resetCancel}
              </button>
              <button
                onClick={handleReset}
                disabled={resetBusy || resetInput.trim().toLowerCase() !== ownerUsername.toLowerCase()}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/20 disabled:text-red-400/50 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {resetBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t.settingsModal.account.resetConfirmButton}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
