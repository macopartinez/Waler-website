import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, Settings, CreditCard, Bell, Monitor, LogOut } from "lucide-react";
import { fallbackAvatar } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface UserMenuProps {
  user: {
    username?: string;
    email?: string;
  };
  onOpenSettings: () => void;
  onLogout: () => void;
}

/**
 * Menu utilisateur façon dropdown (inspiré de Trendtrack) : une pastille profil
 * ancrée en bas à gauche du dashboard qui ouvre un menu vers le haut. Regroupe
 * l'accès aux réglages détaillés, à la facturation, et la déconnexion.
 */
export function UserMenu({ user, onOpenSettings, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const [disableAnimation, setDisableAnimation] = useState(
    () => localStorage.getItem("disableBackgroundAnimation") === "true"
  );

  useEffect(() => {
    localStorage.setItem("disableBackgroundAnimation", disableAnimation.toString());
    window.dispatchEvent(
      new CustomEvent("animationPreferenceChanged", { detail: { disabled: disableAnimation } })
    );
  }, [disableAnimation]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const avatar = fallbackAvatar(user.username || "user");

  const ProfileRow = (
    <div className="flex items-center gap-3 min-w-0">
      <img
        src={avatar}
        alt={user.username || "user"}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
      <div className="min-w-0 text-left">
        <p className="text-white font-semibold text-sm truncate leading-tight">
          {user.username ? `@${user.username}` : t.userMenu.defaultUser}
        </p>
        <p className="text-gray-500 text-xs truncate mt-0.5">{user.email || ""}</p>
      </div>
    </div>
  );

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <div ref={ref} className="fixed bottom-6 left-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl bg-[#111] border border-white/10 shadow-2xl overflow-hidden"
          >
            {/* Profile header */}
            <div className="px-4 py-4 border-b border-white/10">{ProfileRow}</div>

            {/* Primary actions */}
            <div className="p-2">
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-left"
              >
                <Settings className="w-4 h-4 flex-shrink-0 text-gray-400" />
                {t.userMenu.settings}
              </button>
              <button
                onClick={() => go("/billing")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-left"
              >
                <CreditCard className="w-4 h-4 flex-shrink-0 text-gray-400" />
                {t.userMenu.plansAndBilling}
              </button>
              <button
                disabled
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 cursor-not-allowed text-left"
              >
                <Bell className="w-4 h-4 flex-shrink-0" />
                {t.userMenu.notifications}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-600">{t.userMenu.soon}</span>
              </button>
            </div>

            {/* Display toggle */}
            <div className="px-2 pb-2 pt-1 border-t border-white/10">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Monitor className="w-4 h-4 flex-shrink-0 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">{t.userMenu.backgroundAnimation}</span>
                <label className="relative inline-flex items-center cursor-pointer ml-auto">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={!disableAnimation}
                    onChange={(e) => setDisableAnimation(!e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-[#02c950] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
            </div>

            {/* Log out */}
            <div className="p-2 border-t border-white/10">
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {t.userMenu.logOut}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-3 pl-2 pr-3 py-2 rounded-full bg-[#111] border transition-colors shadow-lg ${
          open ? "border-[#02c950]/40" : "border-white/10 hover:border-white/20"
        }`}
        aria-label={t.userMenu.ariaLabel}
      >
        {ProfileRow}
        <ChevronUp
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "" : "rotate-180"}`}
        />
      </button>
    </div>
  );
}
