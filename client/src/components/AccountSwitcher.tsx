import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Plus, User } from "lucide-react";
import { useAccounts, type InstagramAccount } from "@/hooks/use-accounts";
import { fallbackAvatar } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface AccountSwitcherProps {
  /** Compte Instagram actuellement affiché par le dashboard (sélection locale). */
  value: number | null;
  /** Appelé quand l'utilisateur choisit un autre compte. */
  onChange: (accountId: number) => void;
}

/**
 * Sélecteur de compte Instagram (multi-compte) pour la navbar du dashboard
 * (modes Personal et Professional). Composant CONTRÔLÉ : il ne touche pas à la
 * session serveur (qui est pilotée par l'extension selon l'onglet Instagram
 * ouvert). Le dashboard décide seul quel compte il affiche, via ?accountId.
 */
export function AccountSwitcher({ value, onChange }: AccountSwitcherProps) {
  const { data, isLoading } = useAccounts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (isLoading || !data) return null;

  // On n'affiche que les vrais comptes Instagram (avec un username). Le row
  // « owner » du login (inscription par email) n'a pas de compte Instagram lié
  // et apparaîtrait sinon comme un compte fantôme « @— ».
  const accounts = (data.accounts || []).filter((a) => a.username && a.username.trim());
  if (accounts.length === 0) return null;

  const selectedId = value ?? data.ownerId;
  const active =
    accounts.find((a) => a.id === selectedId) ||
    accounts.find((a) => a.isOwner) ||
    accounts[0];

  const avatarFor = (a: InstagramAccount) =>
    fallbackAvatar(a.username);

  const handleSelect = (a: InstagramAccount) => {
    if (a.id !== selectedId) onChange(a.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold text-gray-200 bg-black/40 border border-white/10 hover:border-white/20 transition-colors"
      >
        {active ? (
          <img src={avatarFor(active)} alt={active.username} className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <User className="w-4 h-4" />
        )}
        <span className="max-w-[120px] truncate">@{active?.username || "—"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#161616] border border-white/10 shadow-2xl overflow-hidden z-[60]">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
            {t.accountSwitcher.instagramAccounts}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {accounts.map((a) => {
              const isActive = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  onClick={() => handleSelect(a)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isActive ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <img src={avatarFor(a)} alt={a.username} className="w-8 h-8 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">@{a.username}</div>
                    <div className="text-[11px] text-gray-500">
                      {a.isOwner ? t.accountSwitcher.primaryAccount : t.accountSwitcher.linkedAccount}
                      {typeof a.followersCount === "number" ? ` · ${a.followersCount} ${t.accountSwitcher.followersSuffix}` : ""}
                    </div>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-green-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <a
            href="https://www.instagram.com/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 border-t border-white/10 text-sm font-semibold text-green-400 hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t.accountSwitcher.linkAccount}
          </a>
        </div>
      )}
    </div>
  );
}
