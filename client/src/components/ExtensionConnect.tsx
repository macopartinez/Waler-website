import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Puzzle,
  Instagram,
  Download,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Users,
} from "lucide-react";
import { WALER_EXTENSION_ID, sendToExtension } from "@/lib/extension";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

// Lien d'installation (Web Store).
const WALER_EXTENSION_STORE_URL =
  (import.meta as any).env?.VITE_WALER_EXTENSION_STORE_URL ||
  "https://chromewebstore.google.com/detail/waler-instagram-analytics/dbogablehjicifjkkgigabhdofbjjbmj";

interface ExtensionConnectProps {
  /** Login owner (utilisé pour le handshake d'auth de l'extension). */
  userId: number;
  /** Username saisi à l'inscription : sert d'indice, pas de contrainte dure. */
  claimedUsername?: string;
  /** Appelé une fois le compte lié côté backend. */
  onConnected: (info: { igUsername: string; dsUserId: string }) => void;
}

type Status =
  | "idle"
  | "connecting"
  | "not_installed"
  | "not_logged_in"
  | "review" // compte détecté ≠ username saisi → on demande confirmation
  | "linking"
  | "error";

/**
 * ExtensionConnect — étape post-paiement : l'utilisateur installe l'extension,
 * se connecte à UN compte Instagram (qui devient son compte de référence), et on
 * vérifie la propriété puis on lie le compte au login. En cas de compte détecté
 * différent du username saisi, on adopte le compte réellement connecté (après
 * confirmation) plutôt que de bloquer.
 */
export default function ExtensionConnect({
  userId,
  claimedUsername,
  onConnected,
}: ExtensionConnectProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [detected, setDetected] = useState<{ igUsername: string; dsUserId: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const { t } = useLanguage();

  /** Lie le compte détecté au login owner et notifie le parent. */
  const linkAccount = async (igUsername: string, dsUserId: string) => {
    setStatus("linking");
    try {
      const res = await fetch("/api/accounts/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ igUsername, dsUserId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t.extensionConnect.linkingFailed);
      }
      // Rafraîchir l'état de connexion (isConnected) du login.
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      onConnected({ igUsername, dsUserId });
    } catch (e: any) {
      setErrorMsg(e?.message || t.extensionConnect.genericError);
      setStatus("error");
    }
  };

  const connect = async () => {
    setStatus("connecting");
    setErrorMsg("");

    // 1) L'extension est-elle installée ?
    const ping = await sendToExtension({ type: "PING" }, 4000);
    if (!ping?.ok) {
      setStatus("not_installed");
      return;
    }

    // 2) Authentifier l'extension (handshake token). Non bloquant si déjà loggée.
    try {
      const tokenRes = await fetch("/api/extension/generate-token", {
        method: "POST",
        credentials: "include",
      });
      if (tokenRes.ok) {
        const { token, userId: tokenUserId } = await tokenRes.json();
        await sendToExtension({
          type: "WALER_AUTH",
          userId: tokenUserId ?? userId,
          token,
        });
      }
    } catch {
      // On continue : la vérification de propriété ne dépend pas du token.
    }

    // 3) Lire le compte Instagram réellement connecté.
    const result = await sendToExtension({
      type: "VERIFY_IG_OWNERSHIP",
      claimedUsername: (claimedUsername || "").trim(),
    });

    if (!result) {
      setStatus("not_installed");
      return;
    }
    if (!result.loggedIn || !result.dsUserId) {
      setStatus("not_logged_in");
      return;
    }

    const igUsername: string = result.igUsername || (claimedUsername || "").trim();
    const dsUserId: string = result.dsUserId;
    setDetected({ igUsername, dsUserId });

    // 4) Le compte connecté correspond-il au username saisi ?
    if (result.verified) {
      // Concordance parfaite → on lie directement.
      await linkAccount(igUsername, dsUserId);
    } else {
      // Compte différent → on adopte le compte connecté, après confirmation.
      setStatus("review");
    }
  };

  const busy = status === "connecting" || status === "linking";

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#0a0a0a]/95 border border-white/10 rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto"
      >
        <div className="p-7 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#02c950]/15 flex items-center justify-center">
              <Puzzle className="w-7 h-7 text-[#02c950]" />
            </div>
            <h2 className="text-2xl font-bold text-white">{t.extensionConnect.title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              {t.extensionConnect.subtitlePrefix} <span className="text-white font-medium">{t.extensionConnect.subtitleAccount}</span> {t.extensionConnect.subtitleMiddle}{" "}
              <span className="text-white font-medium">{t.extensionConnect.subtitleReference}</span> {t.extensionConnect.subtitleSuffix}
            </p>
          </div>

          {/* A→Z setup steps */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <ol className="space-y-3.5">
              {[
                <>{t.extensionConnect.step1} <span className="text-white font-medium">{t.extensionConnect.step1Extension}</span> {t.extensionConnect.step1End}</>,
                <>{t.extensionConnect.step2Prefix} <span className="text-white font-medium">{t.extensionConnect.step2Domain}</span> {t.extensionConnect.step2Middle}{claimedUsername ? <> (<span className="text-white">@{claimedUsername}</span>)</> : null}{t.extensionConnect.step2End}</>,
                <>{t.extensionConnect.step3} <span className="text-white font-medium">{t.extensionConnect.step3Button}</span>{t.extensionConnect.step3End}</>,
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-[#02c950] flex items-center justify-center text-[#02c950] text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-300 leading-relaxed pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <a
                href={WALER_EXTENSION_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t.extensionConnect.install}
              </a>
              <a
                href={claimedUsername ? `https://www.instagram.com/${claimedUsername}/` : "https://www.instagram.com/"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                <Instagram className="w-4 h-4" />
                {t.extensionConnect.openInstagram}
              </a>
            </div>
          </div>

          {/* Status feedback */}
          {status === "not_installed" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
              <Puzzle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">
                {t.extensionConnect.notInstalled}
              </p>
            </div>
          )}
          {status === "not_logged_in" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
              <Instagram className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">
                {t.extensionConnect.notLoggedIn}
              </p>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">{errorMsg}</p>
            </div>
          )}

          {/* Review : compte détecté différent du username saisi */}
          {status === "review" && detected && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300">
                  {t.extensionConnect.reviewLoggedInAs}{" "}
                  <strong className="text-white">@{detected.igUsername}</strong>
                  {claimedUsername ? (
                    <>, {t.extensionConnect.reviewNotAs} <strong className="text-white">@{claimedUsername}</strong></>
                  ) : null}
                  {t.extensionConnect.reviewWillUse} <strong className="text-white">@{detected.igUsername}</strong> {t.extensionConnect.reviewAsReference}
                </p>
              </div>
              <button
                onClick={() => linkAccount(detected.igUsername, detected.dsUserId)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#02c950] to-emerald-500 hover:from-[#02d955] hover:to-emerald-600 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(2,201,80,0.3)]"
              >
                <Users className="w-4 h-4" />
                {interpolate(t.extensionConnect.useAccount, { username: detected.igUsername })}
              </button>
              <button
                onClick={connect}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
              >
                {t.extensionConnect.switchRetry}
              </button>
            </div>
          )}

          {/* Primary action */}
          {status !== "review" && (
            <button
              onClick={connect}
              disabled={busy}
              className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                busy
                  ? "bg-white/5 text-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-[#02c950] to-emerald-500 hover:from-[#02d955] hover:to-emerald-600 text-white shadow-[0_0_20px_rgba(2,201,80,0.3)]"
              }`}
              data-testid="button-connect-extension"
            >
              {status === "connecting" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t.extensionConnect.detecting}
                </>
              ) : status === "linking" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t.extensionConnect.linking}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  {t.extensionConnect.connectButton}
                </>
              )}
            </button>
          )}

        </div>
      </motion.div>
    </div>
  );
}
