import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BarChart3, Eye, TrendingUp, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Translations } from "@/lib/i18n/en";

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

function buildSteps(t: Translations) {
  return [
    {
      id: 1,
      title: t.onboardingComponent.step1.title,
      description: t.onboardingComponent.step1.description,
      icon: Shield,
      content: (
        <div className="space-y-4">
          <p className="text-gray-300">
            {t.onboardingComponent.step1.body1} <strong className="text-green-400">{t.onboardingComponent.step1.body1Highlight}</strong>{t.onboardingComponent.step1.body1End}
          </p>
          <p className="text-gray-300">
            {t.onboardingComponent.step1.body2}
          </p>
        </div>
      ),
    },
    {
      id: 2,
      title: t.onboardingComponent.step2.title,
      description: t.onboardingComponent.step2.description,
      icon: Eye,
      content: (
        <div className="space-y-4">
          <div className="bg-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-xl p-4">
            <h4 className="font-semibold text-green-400 mb-2">{t.onboardingComponent.step2.cardTitle}</h4>
            <p className="text-sm text-gray-300">
              {t.onboardingComponent.step2.cardBody}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-300">
              <li>• <strong className="text-green-400">{t.onboardingComponent.step2.unfollowDetection}</strong>{t.onboardingComponent.step2.unfollowDetectionDesc}</li>
              <li>• <strong className="text-green-400">{t.onboardingComponent.step2.ghostDetection}</strong>{t.onboardingComponent.step2.ghostDetectionDesc}</li>
            </ul>
          </div>
          <p className="text-gray-400 text-sm">
            {t.onboardingComponent.step2.footer}
          </p>
        </div>
      ),
    },
    {
      id: 4,
      title: t.onboardingComponent.step3.title,
      description: t.onboardingComponent.step3.description,
      icon: TrendingUp,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-gradient-to-r from-amber-500/10 to-red-500/10 backdrop-blur-sm border border-amber-500/30 rounded-xl p-3">
              <h5 className="font-semibold text-amber-400 text-sm mb-1">📉 {t.onboardingComponent.step3.unfollowersTitle}</h5>
              <p className="text-xs text-gray-300">
                {t.onboardingComponent.step3.unfollowersDesc}
              </p>
            </div>

            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 backdrop-blur-sm border border-green-500/30 rounded-xl p-3">
              <h5 className="font-semibold text-green-400 text-sm mb-1">📈 {t.onboardingComponent.step3.followersTitle}</h5>
              <p className="text-xs text-gray-300">
                {t.onboardingComponent.step3.followersDesc}
              </p>
            </div>

            <div className="bg-gradient-to-r from-purple-500/10 to-gray-500/10 backdrop-blur-sm border border-purple-500/30 rounded-xl p-3">
              <h5 className="font-semibold text-purple-400 text-sm mb-1">👻 {t.onboardingComponent.step3.ghostsTitle}</h5>
              <p className="text-xs text-gray-300">
                {t.onboardingComponent.step3.ghostsDesc}
              </p>
            </div>
          </div>

          <div className="bg-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-xl p-3">
            <div className="flex items-start gap-2 text-sm text-gray-300">
              <BarChart3 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <p><strong className="text-green-400">{t.onboardingComponent.step3.chartsLabel}</strong> {t.onboardingComponent.step3.chartsDesc}</p>
            </div>
          </div>
        </div>
      ),
    },
  ];
}

export default function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { t } = useLanguage();

  const filteredSteps = buildSteps(t);

  const currentStepData = filteredSteps[currentStep];
  const isLastStep = currentStep === filteredSteps.length - 1;
  const StepIcon = currentStepData.icon;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-b border-green-500/30 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 backdrop-blur-sm border border-green-500/30 rounded-full flex items-center justify-center">
                <StepIcon className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{currentStepData.title}</h2>
                <p className="text-gray-400 text-sm">{currentStepData.description}</p>
              </div>
            </div>
            <button
              onClick={onSkip}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex gap-2">
            {filteredSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all ${
                  index <= currentStep ? 'bg-green-500' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-250px)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentStepData.content}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-6 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
            >
              {t.onboardingComponent.skip}
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-4 py-2 text-gray-300 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {t.onboardingComponent.previous}
                </button>
              )}

              <button
                onClick={handleNext}
                className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
              >
                {isLastStep ? t.onboardingComponent.getStarted : t.onboardingComponent.next}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
