import { useState } from "react";
import { Hash, Plus, X, Loader2 } from "lucide-react";
import { useProKeywords, useAddProKeyword, useDeleteProKeyword } from "@/hooks/use-pro-keywords";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

/**
 * Gestion des mots-clés de campagne (« commente GUIDE ») du compte affiché.
 * Scopé PAR COMPTE via `accountUsername`. L'extension récupère cette liste et
 * matche les commentaires des People EN LOCAL (tolérant aux fautes de frappe) ;
 * un hit devient un signal d'intention fort (score + timeline).
 */
export function KeywordManager({ accountUsername }: { accountUsername?: string }) {
  const { t } = useLanguage();
  const { data: keywords = [], isLoading } = useProKeywords(accountUsername);
  const addKw = useAddProKeyword(accountUsername);
  const delKw = useDeleteProKeyword(accountUsername);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const v = input.trim();
    if (!v || addKw.isPending) return;
    setError(null);
    try {
      await addKw.mutateAsync(v);
      setInput("");
    } catch (e: any) {
      setError(e.message || "Error");
    }
  };

  return (
    <div className="bg-black/40 backdrop-blur-sm border border-[#02c950]/20 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Hash className="w-4 h-4 text-[#02c950]" />
        <h3 className="text-white font-bold">{t.proDashboard.keywords.title}</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">{t.proDashboard.keywords.subtitle}</p>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t.proDashboard.keywords.placeholder}
          maxLength={40}
          className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#02c950] transition-colors text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={!input.trim() || addKw.isPending}
          className="px-3 py-2 rounded-xl bg-[#02c950]/15 hover:bg-[#02c950]/25 border border-[#02c950]/30 text-[#02c950] text-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
        >
          {addKw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t.proDashboard.keywords.add}
        </button>
      </div>

      {error && (
        <div className="mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : keywords.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{t.proDashboard.keywords.empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keywords.map((k) => (
            <span
              key={k.id}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-[#02c950]/10 border border-[#02c950]/30 text-[#02c950] text-sm font-medium"
            >
              {k.keyword}
              <button
                onClick={() => delKw.mutate(k.id)}
                title={t.proDashboard.keywords.remove}
                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-500/20 hover:text-red-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {accountUsername && (
        <p className="mt-3 text-[11px] text-gray-600">
          {interpolate(t.proDashboard.keywords.accountHint, { username: accountUsername })}
        </p>
      )}
    </div>
  );
}
