import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Check, Target, FileText, Sparkles, Crown, Star, Eye, Flame, Thermometer, Activity, Heart } from "lucide-react";
import { useState } from "react";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";

// Clé localStorage versionnée : on incrémente la version quand le contenu du
// tutoriel change significativement, afin qu'il se ré-affiche UNE seule fois
// pour les utilisateurs ayant déjà vu l'ancienne version, puis plus jamais.
export const PRO_TUTORIAL_STORAGE_KEY = 'pro-tutorial-completed-v2';

interface ProTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

type TutorialStep = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  details: string[];
  tip: string;
  image?: string;
};

// Icônes associées à chaque étape, dans le même ordre que `proTutorial.steps`
// dans les dictionnaires i18n (le texte est traduit, les icônes non).
const TUTORIAL_ICONS = [Crown, Target, Flame, Star, Activity, Thermometer, Heart, Sparkles, FileText, Eye];

export function ProTutorial({ isOpen, onClose }: ProTutorialProps) {
  const { t } = useLanguage();
  const tutorialSteps: TutorialStep[] = t.proTutorial.steps.map((s, i) => ({
    ...s,
    icon: TUTORIAL_ICONS[i],
  }));
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const handleNext = () => {
    setCompletedSteps(prev => new Set(Array.from(prev).concat(currentStep)));
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (index: number) => {
    setCurrentStep(index);
  };

  // Toute fermeture (Terminer, croix, clic sur le fond) marque le tutoriel comme
  // vu : il ne se ré-affichera donc plus automatiquement à la prochaine entrée Pro.
  const markCompletedAndClose = () => {
    setCompletedSteps(prev => new Set(Array.from(prev).concat(currentStep)));
    localStorage.setItem(PRO_TUTORIAL_STORAGE_KEY, 'true');
    onClose();
  };

  const handleFinish = markCompletedAndClose;

  const step = tutorialSteps[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={markCompletedAndClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100]"
          />

          {/* Tutorial Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="bg-gradient-to-br from-black via-green-950/20 to-black border border-green-500/30 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="border-b border-green-500/20 p-5 bg-black/50 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                      <Crown className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-black text-white">{t.proTutorial.headerTitle}</h2>
                      <p className="text-sm text-gray-400">{t.proTutorial.headerSubtitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={markCompletedAndClose}
                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-emerald-500"
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>{interpolate(t.proTutorial.stepLabel, { current: currentStep + 1, total: tutorialSteps.length })}</span>
                  <span>{interpolate(t.proTutorial.percentComplete, { percent: Math.round(progress) })}</span>
                </div>
              </div>

              {/* Content */}
              <div className="flex h-[calc(90vh-200px)]">
                {/* Step Navigation Sidebar */}
                <div className="w-56 border-r border-green-500/20 bg-black/30 p-3 overflow-y-auto">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t.proTutorial.chapters}</h3>
                  <div className="space-y-2">
                    {tutorialSteps.map((s, index) => {
                      const StepIcon = s.icon;
                      const isCompleted = completedSteps.has(index);
                      const isCurrent = index === currentStep;
                      
                      return (
                        <button
                          key={index}
                          onClick={() => handleStepClick(index)}
                          className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${
                            isCurrent
                              ? 'bg-green-500/20 border border-green-500/40 text-white'
                              : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isCurrent ? 'bg-green-500/30' : 'bg-white/5'
                          }`}>
                            {isCompleted ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : (
                              <StepIcon className="w-4 h-4" />
                            )}
                          </div>
                          <span className="text-xs font-medium line-clamp-2">{s.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* Step Icon and Title */}
                      <div className="flex items-start gap-4 mb-5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-7 h-7 text-green-400" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-display font-black text-white mb-2">{step.title}</h3>
                          <p className="text-base text-gray-400">{step.description}</p>
                        </div>
                      </div>

                      {/* Details List */}
                      <div className="space-y-3 mb-6">
                        {step.details.map((detail, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                          >
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{detail}</p>
                          </motion.div>
                        ))}
                      </div>

                      {/* Tips Box */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
                          <div>
                            <h4 className="font-semibold text-white mb-2">{t.proTutorial.proTip}</h4>
                            <p className="text-sm text-gray-300">{step.tip}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer Navigation */}
              <div className="border-t border-green-500/20 p-5 bg-black/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePrevious}
                    disabled={currentStep === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    {t.proTutorial.previous}
                  </button>

                  <div className="flex gap-2">
                    {tutorialSteps.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => handleStepClick(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentStep
                            ? 'bg-green-500 w-8'
                            : completedSteps.has(index)
                            ? 'bg-emerald-500'
                            : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>

                  {currentStep === tutorialSteps.length - 1 ? (
                    <button
                      onClick={handleFinish}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all"
                    >
                      <Check className="w-5 h-5" />
                      {t.proTutorial.finish}
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all"
                    >
                      {t.proTutorial.next}
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
