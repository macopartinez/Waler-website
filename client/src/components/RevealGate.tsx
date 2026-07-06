import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Heart, Check } from "lucide-react";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";
import type { Translations } from "@/lib/i18n/en";

interface RevealGateProps {
  onReveal: () => void;
  onClose: () => void;
}

interface RevealAnswers {
  feeling?: string;
  recentTension?: string;
  unresolved?: string;
  firstInstinct?: string;
  commitments?: string[];
}

interface QuestionTheme {
  id: keyof RevealAnswers;
  type: 'single' | 'multiple';
  subtitle?: string;
  // Plusieurs formulations neutres par thème : on en tire une au hasard à
  // chaque ouverture pour que le questionnaire ne reste jamais identique,
  // tout en gardant les `value` (et donc le schéma des réponses) stables.
  titles: string[];
  options: { value: string; label: string }[];
}

// Construit le pool de questions à partir des traductions courantes. Les
// libellés restent introspectifs, doux et ouverts — un signal, pas un
// verdict (voir la philosophie du tunnel de vente). Les `value` restent
// indépendants de la langue pour ne pas casser l'analytics stocké en localStorage.
function buildQuestionPool(t: Translations): QuestionTheme[] {
  const q = t.revealGate.questions;
  return [
    { id: 'feeling', type: 'single', titles: q.feeling.titles, options: q.feeling.options },
    { id: 'recentTension', type: 'single', titles: q.recentTension.titles, options: q.recentTension.options },
    { id: 'unresolved', type: 'single', titles: q.unresolved.titles, options: q.unresolved.options },
    { id: 'firstInstinct', type: 'single', titles: q.firstInstinct.titles, options: q.firstInstinct.options },
    { id: 'commitments', type: 'multiple', subtitle: q.commitments.subtitle, titles: q.commitments.titles, options: q.commitments.options },
  ];
}

// Tire une variante de titre au hasard pour chaque thème.
function buildQuestions(t: Translations) {
  return buildQuestionPool(t).map((theme) => ({
    ...theme,
    title: theme.titles[Math.floor(Math.random() * theme.titles.length)],
  }));
}

export function RevealGate({ onReveal, onClose }: RevealGateProps) {
  const { t } = useLanguage();
  // Construit le questionnaire une seule fois par montage → la sélection
  // aléatoire reste stable pendant toute la session du gate.
  const [questions] = useState(() => buildQuestions(t));
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<RevealAnswers>({});
  const [showTransition, setShowTransition] = useState(false);

  const question = questions[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;
  const isMultiple = question.type === 'multiple';

  const currentAnswer = answers[question.id];
  const canProceed = isMultiple
    ? ((currentAnswer as string[] | undefined)?.length ?? 0) > 0
    : !!currentAnswer;

  // Fermeture au clavier (Escape) — accessibilité.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSelect = (value: string) => {
    if (isMultiple) {
      const current = (answers[question.id] as string[]) || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      setAnswers({ ...answers, [question.id]: updated });
    } else {
      setAnswers({ ...answers, [question.id]: value });
    }
  };

  const handleNext = () => {
    if (!canProceed) return;

    if (isLastQuestion) {
      setShowTransition(true);
    } else {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestion === 0) {
      onClose();
    } else {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  if (showTransition) {
    // Synthèse déterministe : chaque ligne est indexée sur une réponse choisie.
    // Mêmes réponses → même texte, aucun appel réseau, aucune IA. C'est ce qui
    // referme la boucle d'introspection au lieu d'afficher directement la liste.
    const synth = t.revealGate.synthesis;
    const pick = <T extends Record<string, string>>(map: T, key?: string) =>
      (key && map[key as keyof T]) || "";
    const feelingLine = pick(synth.feeling, answers.feeling);
    const tensionLine = pick(synth.tension, answers.recentTension);
    const unresolvedLine = pick(synth.unresolved, answers.unresolved);
    const contextLine = `${tensionLine} ${unresolvedLine}`.trim();
    const instinctLine = pick(synth.instinct, answers.firstInstinct);
    const commitmentEchoes = (answers.commitments ?? [])
      .map((c) => pick(synth.commitmentEcho, c))
      .filter(Boolean);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 backdrop-blur-sm py-12"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto px-6 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring" }}
            className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center"
          >
            <Heart className="w-10 h-10 text-green-400" />
          </motion.div>

          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-3xl md:text-4xl font-display font-black text-white mb-6"
          >
            {t.revealGate.transition.title}
          </motion.h2>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-xl text-gray-400 mb-8"
          >
            {t.revealGate.transition.subtitle}
          </motion.p>

          {/* Synthèse personnalisée — reflète les réponses au lieu du texte générique */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-left max-w-xl mx-auto mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 space-y-4"
          >
            <div className="text-xs font-bold tracking-widest text-green-400/80 uppercase">
              {synth.heading}
            </div>
            {feelingLine && (
              <p className="text-xl text-white font-medium leading-snug">{feelingLine}</p>
            )}
            {contextLine && (
              <p className="text-gray-300 leading-relaxed">{contextLine}</p>
            )}
            {instinctLine && (
              <p className="text-gray-300 leading-relaxed">{instinctLine}</p>
            )}
            {commitmentEchoes.length > 0 && (
              <div className="pt-2">
                <div className="text-sm text-gray-400 mb-2">{synth.commitmentsLead}</div>
                <ul className="space-y-1.5">
                  {commitmentEchoes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-white/90">
                      <Check className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-lg text-gray-500 mb-12 max-w-xl mx-auto"
          >
            {synth.closing}
          </motion.p>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.2 }}
            autoFocus
            onClick={() => {
              // Sauvegarder les réponses dans localStorage (analytics tunnel)
              localStorage.setItem('revealGateAnswers', JSON.stringify(answers));
              // Afficher les comptes
              onReveal();
            }}
            className="px-8 py-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-lg hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all duration-300 flex items-center gap-3 mx-auto"
          >
            {t.revealGate.viewAccounts}
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto"
    >
      <div className="max-w-3xl w-full mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-gray-500">
              {interpolate(t.revealGate.progressLabel, { current: currentQuestion + 1, total: questions.length })}
            </span>
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              {t.revealGate.cancel}
            </button>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-3xl md:text-4xl font-display font-black text-white mb-3 leading-tight">
              {question.title}
            </h2>
            {question.subtitle && (
              <p className="text-gray-400 mb-8">{question.subtitle}</p>
            )}

            <div
              role={isMultiple ? 'group' : 'radiogroup'}
              aria-label={question.title}
              className="space-y-3 mb-12"
            >
              {question.options.map((option) => {
                const isSelected = isMultiple
                  ? (currentAnswer as string[] | undefined)?.includes(option.value)
                  : currentAnswer === option.value;

                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    role={isMultiple ? 'checkbox' : 'radio'}
                    aria-checked={isSelected}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`w-full p-6 rounded-2xl text-left transition-all duration-300 ${
                      isSelected
                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-2 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                        : 'bg-white/5 border-2 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                        isSelected ? 'border-green-500 bg-green-500' : 'border-white/30'
                      }`}>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-2 h-2 rounded-full bg-white"
                          />
                        )}
                      </div>
                      <span className="text-white font-medium text-lg">{option.label}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className={`flex items-center ${currentQuestion === 0 ? 'justify-end' : 'justify-between'}`}>
              {currentQuestion > 0 && (
                <button
                  onClick={handleBack}
                  className="px-6 py-3 rounded-full text-gray-400 hover:text-white transition-colors font-bold"
                >
                  {t.revealGate.back}
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`px-8 py-3 rounded-full font-bold transition-all duration-300 flex items-center gap-2 ${
                  canProceed
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                    : 'bg-white/10 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isLastQuestion ? t.revealGate.continueLabel : t.revealGate.next}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
