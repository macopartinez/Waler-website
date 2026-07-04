import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { NavBar } from "@/components/NavBar";
import { RadarBackground } from "@/components/RadarBackground";
import { BackgroundWaler } from "@/components/BackgroundWaler";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, ArrowLeft, Loader2, Mail, AtSign, Lock, Puzzle, Instagram, CheckCircle2, AlertTriangle } from "lucide-react";
import { QUESTIONNAIRE_STEPS, getQuestionnaireSteps, QuestionnaireAnswers, UsageMode } from "@/types/questionnaire";
import { QuestionOption } from "@/components/questionnaire/QuestionOption";
import { QuestionScale } from "@/components/questionnaire/QuestionScale";
import { QuestionTextarea } from "@/components/questionnaire/QuestionTextarea";
import { WarningBox } from "@/components/questionnaire/WarningBox";
import { UsageCard } from "@/components/questionnaire/UsageCard";
import { PaywallStep } from "@/components/PaywallStep";
import { useLanguage } from "@/contexts/LanguageContext";

// Flux: Questionnaire (0-7) → Setting up account (8, identifiant du compte de
// référence) → PAYWALL (9) → Email (10) → Password (11).
// L'installation + la vérification de propriété de l'extension se font APRÈS le
// paiement (sur le dashboard), pour ne pas mettre la friction la plus forte
// (installer une extension) avant l'achat. Voir <ExtensionConnect>.
const QUESTIONNAIRE_END = QUESTIONNAIRE_STEPS.length - 1; // Summary (dernière étape du questionnaire)
const SETUP_STEP = QUESTIONNAIRE_END + 1;
const PAYWALL_STEP = SETUP_STEP + 1;
const EMAIL_STEP = PAYWALL_STEP + 1;
const PASSWORD_STEP = EMAIL_STEP + 1;
const TOTAL_STEPS = PASSWORD_STEP + 1;

export default function Onboard() {
  const { t, language } = useLanguage();
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  useAuth();

  // Onboard s'inscrit via un fetch brut (pas la mutation du hook), donc on suit
  // nous-mêmes l'état de chargement du bouton « Continue » de l'étape password :
  // il reste en chargement le temps de l'inscription ET de la redirection
  // (création de session / checkout), jusqu'à ce que la page change.
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Questionnaire state
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<QuestionnaireAnswers>({});
  const [usageMode, setUsageMode] = useState<UsageMode | null>(null);
  const [consent, setConsent] = useState(false);
  
  // Technical steps state
  const [platform, setPlatform] = useState<"instagram" | null>("instagram");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  // Pricing state
  const [selectedPricingPlan, setSelectedPricingPlan] = useState<'premium' | 'pro' | null>(null);
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');

  // Jeu d'étapes affiché : personnel par défaut, professionnel dès que le mode
  // « professional » est choisi (étape 1). Les étapes 0/1 sont identiques en
  // structure, donc le basculement après sélection est transparent.
  const questionnaireSteps = getQuestionnaireSteps(usageMode, language);

  const isQuestionnairePhase = step <= QUESTIONNAIRE_END;

  // Scroll to top whenever step changes
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  const updateAnswer = (questionId: string, value: any) => {
    setQuestionnaireAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const stepTitle = useMemo(() => {
    if (step <= QUESTIONNAIRE_END) {
      return questionnaireSteps[step]?.title || '';
    }
    if (step === SETUP_STEP) return t.onboard.stepTitles.setup;
    if (step === PAYWALL_STEP) return t.onboard.stepTitles.paywall;
    if (step === EMAIL_STEP) return t.onboard.stepTitles.email;
    if (step === PASSWORD_STEP) return t.onboard.stepTitles.password;
    return '';
  }, [step, questionnaireSteps, t]);

  const stepPhase = useMemo(() => {
    if (step <= QUESTIONNAIRE_END) {
      return questionnaireSteps[step]?.phase || '';
    }
    if (step === SETUP_STEP) return t.onboard.stepPhases.setup;
    if (step === PAYWALL_STEP) return t.onboard.stepPhases.paywall;
    if (step === EMAIL_STEP) return t.onboard.stepPhases.email;
    if (step === PASSWORD_STEP) return t.onboard.stepPhases.password;
    return '';
  }, [step, questionnaireSteps, t]);

  const canProceed = () => {
    // Questionnaire phase
    if (step === 0) return consent;
    if (step === 1) return usageMode !== null;
    if (step === QUESTIONNAIRE_END) return true; // Summary page
    if (step > 1 && step < QUESTIONNAIRE_END) {
      // Une étape est valide quand toutes ses questions requises ont une réponse.
      // (index 0 est une réponse valide pour les questions à choix : on vérifie
      // donc l'absence de valeur plutôt que sa «truthiness»).
      return questionnaireSteps[step].questions.every(
        (q) => !q.required || (questionnaireAnswers[q.id] !== undefined && questionnaireAnswers[q.id] !== '')
      );
    }

    // Setting up account step - on demande seulement l'identifiant du compte de
    // référence. La vérification de propriété (extension) se fera après paiement.
    if (step === SETUP_STEP) return username.trim().length > 0;

    // Paywall step - MUST select a plan to proceed
    if (step === PAYWALL_STEP) return selectedPricingPlan !== null;

    // Email step
    if (step === EMAIL_STEP) return email.trim().length > 0 && email.includes("@");

    // Password step
    if (step === PASSWORD_STEP) return password.trim().length >= 8;

    return false;
  };

  const goNext = async () => {
    if (!canProceed()) return;

    // Si on est à l'étape password, créer le compte (puis redirection dashboard)
    if (step === PASSWORD_STEP) {
      handleSubmit();
      return;
    }

    setDirection(1);
    setStep(prev => prev + 1);
  };

  const goBack = () => {
    if (step === 0) {
      setShowIntro(true);
      return;
    }
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (!platform || !username || !email || !password) {
      console.error("Missing required fields:", { platform, username, email, password: password ? "***" : null });
      return;
    }
    
    // SECURITY: Verify that a plan was selected before allowing account creation
    if (!selectedPricingPlan) {
      console.error("Cannot create account without selecting a pricing plan");
      setDirection(-1);
      setStep(PAYWALL_STEP);
      return;
    }
    
    console.log("Registering with:", { username, email, platform, usageMode });

    setIsSubmitting(true);
    try {
      // Créer le compte avec le plan sélectionné
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username, 
          email, 
          password, 
          platform,
          usageMode: usageMode || 'personal',
          selectedPlan: selectedPricingPlan,
          // La propriété du compte Instagram est vérifiée après paiement, via
          // l'extension (voir <ExtensionConnect> sur le dashboard).
          instagramVerified: false,
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Registration failed:", error);
        alert(error.message || error.error || t.onboard.errors.registrationFailed);
        setIsSubmitting(false);
        return;
      }
      
      const data = await response.json();
      console.log("Registration successful:", data);

      // IMPORTANT : on s'est inscrit via un fetch brut (pas la mutation du hook),
      // donc le cache react-query de l'auth est encore sur l'ancien utilisateur.
      // On le met à jour pour que <Dashboard> ne redirige pas vers un id périmé
      // (sinon : redirect /dashboard/<ancien id> → 403 car la session est le
      // nouvel utilisateur).
      if (data.user) {
        queryClient.setQueryData(["auth", "me"], data.user);
      }

      // Sauvegarder l'ID utilisateur dans localStorage
      const newUserId = data.user?.id;
      if (newUserId) {
        localStorage.setItem('lastUserId', newUserId.toString());
        console.log("Saved user ID to localStorage:", newUserId);
      }

      // Redirect to Stripe checkout — extension only activates after successful payment.
      try {
        const checkoutRes = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            planName: selectedPricingPlan,
            billingPeriod: selectedBillingPeriod,
          }),
        });
        if (checkoutRes.ok) {
          const { url } = await checkoutRes.json();
          if (url) {
            window.location.href = url;
            return;
          }
        }
      } catch (error) {
        console.error('Checkout session error:', error);
      }

      // Fallback (e.g. Stripe not configured in dev): go straight to dashboard.
      if (newUserId) {
        setLocation(`/dashboard/${newUserId}`);
      } else {
        setLocation("/");
      }
    } catch (error) {
      console.error("Registration error:", error);
      alert(t.onboard.errors.genericError);
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goNext();
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  // ── INTRO : guide rapide façon Trendtrack, avant le questionnaire ──
  if (showIntro) {
    const introIcons = [CheckCircle2, Instagram, Puzzle];
    const introCards = t.onboard.intro.cards.map((card, i) => ({
      num: i + 1,
      title: card.title,
      desc: card.desc,
      icon: introIcons[i],
    }));

    return (
      <div className="min-h-screen w-full bg-[#0a0a0a] relative font-body text-white">
        <RadarBackground />
        <BackgroundWaler />

        <NavBar logoSize={36} />

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-2xl"
          >
            <div className="text-center mb-14">
              <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-tight mb-3 text-readable">
                {t.onboard.intro.title}
              </h1>
              <p className="text-gray-400 text-lg text-readable">
                {t.onboard.intro.subtitle}
              </p>
            </div>

            <div className="space-y-4">
              {introCards.map(({ num, title, desc, icon: Icon }) => (
                <div
                  key={num}
                  className="flex items-start gap-5 p-6 rounded-2xl bg-[#111] border border-white/10"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-[#02c950] flex items-center justify-center">
                    <span className="text-[#02c950] text-sm font-bold">{num}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-[#02c950] flex-shrink-0" />
                      <h3 className="text-white font-bold">{title}</h3>
                    </div>
                    <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-10">
              <button
                onClick={() => setLocation("/")}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-colors"
                data-testid="button-intro-back"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.onboard.intro.back}
              </button>
              <button
                onClick={() => setShowIntro(false)}
                className="flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold bg-[#02c950] text-black shadow-[0_0_30px_rgba(2,201,80,0.4)] hover:shadow-[0_0_40px_rgba(2,201,80,0.6)] transition-all duration-300"
                data-testid="button-intro-continue"
              >
                {t.onboard.intro.getStarted}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="min-h-screen w-full bg-[#0a0a0a] relative font-body text-white">
      <RadarBackground />
      <BackgroundWaler />

      <NavBar logoSize={36} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-32">
        <div className="w-full max-w-3xl my-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider text-readable">
                {stepPhase}
              </span>
              <span className="text-xs text-gray-500 text-readable">
                {step + 1} / {TOTAL_STEPS}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full transition-all duration-500"
                  style={{
                    flex: i === step ? 2 : 1,
                    backgroundColor: i <= step
                      ? (i <= QUESTIONNAIRE_END ? "rgba(2,201,80,0.5)" : "#02c950")
                      : "rgba(255,255,255,0.1)",
                  }}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="flex flex-col items-center"
            >
              <h1
                className="text-3xl md:text-5xl font-display font-black text-center mb-4 tracking-tight text-white text-readable"
                data-testid="onboard-question"
              >
                {stepTitle}
              </h1>

              {(isQuestionnairePhase && questionnaireSteps[step]?.subtitle) && (
                <p className="text-center text-gray-400 mb-12 max-w-2xl text-readable">
                  {questionnaireSteps[step].subtitle}
                </p>
              )}

              {/* QUESTIONNAIRE STEPS */}
              {step === 0 && (
                <div className="w-full max-w-2xl space-y-6">
                  {questionnaireSteps[0].warningBoxes?.map((warning, i) => (
                    <WarningBox key={i} warning={warning} />
                  ))}
                  <div
                    onClick={() => setConsent(!consent)}
                    className="flex items-start gap-4 p-5 rounded-xl bg-[#1a1a1a] border border-white/30 cursor-pointer hover:bg-[#222222] hover:border-white/40 transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded accent-[#02c950] cursor-pointer"
                    />
                    <span className="text-sm text-gray-300 leading-relaxed">
                      {usageMode === 'professional'
                        ? t.onboard.consent.professional
                        : t.onboard.consent.personal}
                    </span>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-4xl">
                  <UsageCard
                    mode="personal"
                    selected={usageMode === 'personal'}
                    onClick={() => setUsageMode('personal')}
                  />
                  <UsageCard
                    mode="professional"
                    selected={usageMode === 'professional'}
                    onClick={() => setUsageMode('professional')}
                  />
                </div>
              )}

              {/* Generic renderer for all question steps (2 .. QUESTIONNAIRE_END - 1) */}
              {step > 1 && step < QUESTIONNAIRE_END && (
                <div className="w-full max-w-2xl space-y-8">
                  {questionnaireSteps[step].questions.map((q) => (
                    <div key={q.id} className="space-y-4">
                      <label className="block text-base font-medium text-white text-readable">{q.label}</label>
                      {q.hint && q.type !== 'textarea' && <p className="text-sm text-gray-400 -mt-2 text-readable">{q.hint}</p>}

                      {q.type === 'textarea' && (
                        <QuestionTextarea
                          value={(questionnaireAnswers[q.id] as string) || ''}
                          onChange={(value) => updateAnswer(q.id, value)}
                          placeholder={q.placeholder}
                          hint={q.hint}
                        />
                      )}

                      {q.type === 'options' && (
                        <div className="space-y-2">
                          {q.options?.map((opt, i) => (
                            <QuestionOption
                              key={i}
                              option={opt}
                              selected={questionnaireAnswers[q.id] === i}
                              onClick={() => updateAnswer(q.id, i)}
                            />
                          ))}
                        </div>
                      )}

                      {q.type === 'scale' && (
                        <QuestionScale
                          steps={q.scaleSteps || 5}
                          minLabel={q.scaleMin || ''}
                          maxLabel={q.scaleMax || ''}
                          selected={questionnaireAnswers[q.id] as number || null}
                          onSelect={(value) => updateAnswer(q.id, value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary (last questionnaire step) */}
              {step === QUESTIONNAIRE_END && (
                <div className="w-full max-w-2xl space-y-8">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-white/30 text-sm mb-6">
                    {usageMode === 'personal' ? t.onboard.summary.badgePersonal : t.onboard.summary.badgeProfessional}
                  </div>

                  <div className="bg-[#1a1a1a] border border-white/30 rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white">{t.onboard.summary.doneTitle}</h3>
                    <p className="text-gray-300 leading-relaxed">
                      {usageMode === 'professional'
                        ? t.onboard.summary.doneProfessional
                        : t.onboard.summary.donePersonal}
                    </p>
                  </div>

                  <div className="bg-[#1a1a1a] border border-white/30 rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white">{t.onboard.summary.nextTitle}</h3>
                    <p className="text-gray-300 leading-relaxed">
                      {usageMode === 'professional'
                        ? t.onboard.summary.nextProfessional
                        : t.onboard.summary.nextPersonal}
                    </p>
                  </div>
                </div>
              )}

              {/* Step: Setting up account — identifiant du compte de référence */}
              {step === SETUP_STEP && (
                <div className="w-full max-w-md space-y-6">
                  <p className="text-center text-gray-400 -mt-2 text-readable">
                    {t.onboard.setup.question}{' '}
                    <span className="text-white font-medium">{t.onboard.setup.mainAccount}</span> {t.onboard.setup.questionEnd}
                  </p>

                  {/* Identifiant du compte de référence */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300 px-1 text-readable">
                      {t.onboard.setup.label}
                    </label>
                    <div className="relative">
                      <AtSign className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t.onboard.setup.placeholder}
                        autoFocus
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-[#060606]/90 backdrop-blur-xl border border-white/10 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-[#02c950] focus:shadow-[0_0_30px_rgba(2,201,80,0.15)] transition-all"
                        data-testid="input-username"
                      />
                    </div>
                    {/* On ne peut pas vérifier l'existence ici (l'extension n'est
                        pas encore installée) : on alerte juste contre les fautes
                        de frappe avant de valider l'identifiant. */}
                    {username.trim().length > 0 && (
                      <div className="flex items-start gap-2 px-1">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300/90 leading-snug text-readable">
                          {t.onboard.setup.typoWarning}{' '}
                          <span className="font-medium text-amber-200">@{username.trim()}</span> {t.onboard.setup.typoWarningEnd}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Explication : la vérif se fera après paiement, via l'extension */}
                  <div className="oled-card rounded-2xl p-5 space-y-3">
                    <h3 className="flex items-center gap-2 text-white font-bold text-sm">
                      <Puzzle className="w-4 h-4 text-[#02c950]" />
                      {t.onboard.setup.whatsNext}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {t.onboard.setup.whatsNextBody} <span className="text-white">{t.onboard.setup.extension}</span>{' '}
                      {t.onboard.setup.whatsNextBody2}{' '}
                      <span className="text-white">{t.onboard.setup.referenceAccount}</span>.
                    </p>
                    <p className="text-sm text-gray-400 leading-relaxed flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#02c950] flex-shrink-0 mt-0.5" />
                      <span>{t.onboard.setup.whatsNextBullet} <span className="text-white">{t.onboard.setup.additionalAccounts}</span> {t.onboard.setup.whatsNextBulletEnd}</span>
                    </p>
                  </div>

                  <div className="flex items-start gap-2 px-1">
                    <Instagram className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-300 leading-snug text-readable">
                      {t.onboard.setup.tip} <span className="text-white font-medium">@{username || t.onboard.setup.tipAccount}</span> {t.onboard.setup.tipEnd}
                    </p>
                  </div>
                </div>
              )}

              {/* Step 13: PAYWALL */}
              {step === PAYWALL_STEP && (
                <PaywallStep
                  answers={questionnaireAnswers}
                  selectedPlan={selectedPricingPlan}
                  onPlanSelect={(planId) => setSelectedPricingPlan(planId)}
                  usageMode={usageMode}
                  billingPeriod={selectedBillingPeriod}
                  onBillingPeriodChange={setSelectedBillingPeriod}
                />
              )}

              {/* Step 14: Email */}
              {step === EMAIL_STEP && (
                <div className="w-full max-w-md">
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="email@example.com"
                      autoFocus
                      className="w-full pl-14 pr-6 py-5 rounded-2xl bg-white/5 border border-white/10 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-[#02c950] focus:shadow-[0_0_30px_rgba(2,201,80,0.15)] transition-all"
                      data-testid="input-email"
                    />
                  </div>
                </div>
              )}

              {/* Step 15: Password */}
              {step === PASSWORD_STEP && (
                <div className="w-full max-w-md">
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="••••••••"
                      autoFocus
                      minLength={8}
                      className="w-full pl-14 pr-6 py-5 rounded-2xl bg-white/5 border border-white/10 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-[#02c950] focus:shadow-[0_0_30px_rgba(2,201,80,0.15)] transition-all"
                      data-testid="input-password"
                    />
                  </div>
                  <p className="text-gray-500 text-sm mt-3 text-center text-readable">{t.onboard.buttons.minChars}</p>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-12 w-full max-w-md mx-auto">
            <button
              onClick={goBack}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.onboard.buttons.back}
            </button>

            <button
              onClick={goNext}
              disabled={!canProceed() || isSubmitting}
              className={`flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold transition-all duration-300 ${
                canProceed()
                  ? "bg-[#02c950] text-black shadow-[0_0_30px_rgba(2,201,80,0.4)] hover:shadow-[0_0_40px_rgba(2,201,80,0.6)]"
                  : "bg-white/5 text-gray-600 cursor-not-allowed"
              }`}
              data-testid="button-next"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.onboard.buttons.creatingAccount}
                </>
              ) : (
                <>
                  {t.onboard.buttons.continue}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      
    </div>
  );
}
