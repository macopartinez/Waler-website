import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, AlertCircle, Heart, User } from "lucide-react";
import { useState } from "react";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

interface UnfollowerModalProps {
  unfollower: {
    id: number;
    username: string;
    avatarUrl: string | null;
    detectedAt: Date | string;
  };
  onClose: () => void;
  onMarkAsBlocker: (unfollowerId: number) => Promise<void>;
}

export default function UnfollowerModal({ unfollower, onClose, onMarkAsBlocker }: UnfollowerModalProps) {
  const [selectedOption, setSelectedOption] = useState<"unfollow" | "blocked" | null>(null);
  const [showPsychologyMessage, setShowPsychologyMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();

  const instagramUrl = `https://www.instagram.com/${unfollower.username}`;
  const formattedDate = new Date(unfollower.detectedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleOptionSelect = (option: "unfollow" | "blocked") => {
    setSelectedOption(option);
    if (option === "blocked") {
      setShowPsychologyMessage(true);
    } else {
      setShowPsychologyMessage(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedOption) return;

    if (selectedOption === "blocked") {
      setIsSubmitting(true);
      try {
        await onMarkAsBlocker(unfollower.id);
        onClose();
      } catch (error) {
        console.error("Error marking as blocker:", error);
        alert(t.unfollowerModal.markBlockerFailed);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Just close, it stays as unfollower
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500/20 to-red-500/20 border-b border-amber-500/30 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{t.unfollowerModal.title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center overflow-hidden">
              {unfollower.avatarUrl ? (
                <img src={unfollower.avatarUrl} alt={unfollower.username} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-green-400" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">@{unfollower.username}</h3>
              <p className="text-sm text-gray-400">{interpolate(t.unfollowerModal.unfollowedOn, { date: formattedDate })}</p>
            </div>
          </div>

          {/* Link to Instagram */}
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl text-green-300 hover:bg-green-500/30 transition-all"
          >
            <ExternalLink className="w-5 h-5" />
            <span className="font-medium">{t.unfollowerModal.viewOnInstagram}</span>
          </a>

          <div className="border-t border-white/10 pt-4">
            <p className="text-sm text-gray-400 mb-4">
              {t.unfollowerModal.checkProfile}
            </p>

            {/* Options */}
            <div className="space-y-3">
              <button
                onClick={() => handleOptionSelect("unfollow")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedOption === "unfollow"
                    ? "bg-green-500/20 border-green-500/50 text-green-300"
                    : "bg-white/5 border-white/10 text-gray-300 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedOption === "unfollow" ? "border-green-500 bg-green-500" : "border-gray-500"
                  }`}>
                    {selectedOption === "unfollow" && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="font-semibold">{t.unfollowerModal.optionUnfollowTitle}</p>
                    <p className="text-xs text-gray-400">{t.unfollowerModal.optionUnfollowDesc}</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleOptionSelect("blocked")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedOption === "blocked"
                    ? "bg-red-500/20 border-red-500/50 text-red-300"
                    : "bg-white/5 border-white/10 text-gray-300 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedOption === "blocked" ? "border-red-500 bg-red-500" : "border-gray-500"
                  }`}>
                    {selectedOption === "blocked" && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="font-semibold">{t.unfollowerModal.optionBlockedTitle}</p>
                    <p className="text-xs text-gray-400">{t.unfollowerModal.optionBlockedDesc}</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Psychology Message */}
          <AnimatePresence>
            {showPsychologyMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2 text-sm text-gray-300">
                    <p className="font-semibold text-orange-300">{t.unfollowerModal.reflectionTitle}</p>
                    <p>
                      {t.unfollowerModal.reflectionBody1Prefix} <strong className="text-white">{t.unfollowerModal.reflectionBody1Highlight}</strong>{t.unfollowerModal.reflectionBody1Suffix}
                    </p>
                    <p>
                      {t.unfollowerModal.reflectionBody2} <strong className="text-white">{t.unfollowerModal.reflectionBody2Highlight}</strong>{t.unfollowerModal.reflectionBody2Suffix}
                    </p>
                    <p className="text-orange-300 italic">
                      {t.unfollowerModal.reflectionQuote}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-6 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:bg-white/10 rounded-lg transition-colors"
            >
              {t.unfollowerModal.cancel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedOption || isSubmitting}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                selectedOption
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-gray-600 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? t.unfollowerModal.saving : t.unfollowerModal.confirm}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
