import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, UserCheck, Puzzle, MousePointerClick, ArrowDownToLine } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnalyzingOverlayProps {
  username: string;
  onClose?: () => void;
}

export function AnalyzingOverlay({ username, onClose }: AnalyzingOverlayProps) {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl"
    >
      <div className="max-w-md w-full mx-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="oled-card rounded-3xl p-8 text-center"
        >
          {/* Confirmation icon (la personne est bien ajoutée) */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <UserCheck className="w-10 h-10 text-green-400" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-display font-black text-white mb-2">
            <span className="text-green-400">@{username}</span> {t.analyzingOverlay.added}
          </h2>

          {/* Subtitle — honnête : aucune analyse ne tourne ici */}
          <p className="text-gray-400 mb-6">
            {t.analyzingOverlay.subtitlePrefix}{" "}
            <span className="text-gray-200 font-semibold">{t.analyzingOverlay.subtitleExtension}</span>{t.analyzingOverlay.subtitleEnd}
          </p>

          {/* Vraies étapes à suivre (pas de fausse progression) */}
          <div className="space-y-3 mb-6 text-left">
            <NextStep
              icon={<Puzzle className="w-4 h-4 text-green-400" />}
              label={t.analyzingOverlay.step1}
            />
            <NextStep
              icon={<MousePointerClick className="w-4 h-4 text-green-400" />}
              label={t.analyzingOverlay.step2}
            />
            <NextStep
              icon={<ArrowDownToLine className="w-4 h-4 text-green-400" />}
              label={t.analyzingOverlay.step3}
            />
          </div>

          {/* Indicateur d'attente réel : on poll le statut côté serveur */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t.analyzingOverlay.waiting}</span>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold text-sm hover:bg-green-500/20 transition-colors"
            >
              {t.analyzingOverlay.gotIt}
            </button>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function NextStep({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-8 h-8 shrink-0 rounded-lg bg-green-500/5 border border-green-500/10 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-gray-300">{label}</span>
    </div>
  );
}
