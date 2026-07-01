import { motion } from "framer-motion";
import { Sparkles, Check, Users, Star } from "lucide-react";
import { QuestionnaireAnswers, UsageMode } from "@/types/questionnaire";
import { getLocalizedPricingPlans } from "@/config/pricing";
import { useOfferCountdown, resolveYearlyPrice, yearlyStandardPrice } from "@/hooks/use-offer-countdown";
import { useMemo } from "react";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";
import type { Translations } from "@/lib/i18n/en";

type BillingPeriod = 'monthly' | 'yearly';

interface PaywallStepProps {
  answers: QuestionnaireAnswers;
  selectedPlan: 'premium' | 'pro' | null;
  onPlanSelect: (planId: 'premium' | 'pro') => void;
  usageMode?: UsageMode | null;
  billingPeriod: BillingPeriod;
  onBillingPeriodChange: (period: BillingPeriod) => void;
}

// Insights « professionnels » : on lit les réponses du questionnaire pro
// (ids préfixés `p_`) pour résumer la maturité du pipeline du prospect.
// Les réponses à choix multiples sont stockées comme l'INDEX de l'option
// sélectionnée (voir Onboard.tsx) plutôt que son libellé traduit, pour que
// cette logique reste valable quelle que soit la langue active.
function generateProInsights(answers: QuestionnaireAnswers, t: Translations) {
  const i = t.onboard.paywall.insights.pro;
  const tracking = answers.p_tracking as number | undefined; // 0: head, 1: notes, 2: CRM, 3: don't track
  const noSystem = tracking === 0 || tracking === 3;
  const hasCrm = tracking === 2;

  const gap = answers.p_gap as number | undefined; // 0: first message, 1: mid-conversation, 2: offer/price, 3: no follow-up
  const goal = answers.p_goal as number | undefined; // 0: cold leads, 1: pipeline, 2: convert, 3: save time

  return {
    pattern: noSystem ? i.patternNoSystem : hasCrm ? i.patternCrm : i.patternManual,

    attachmentStyle:
      gap === 0 ? i.styleFirstMessage
      : gap === 2 ? i.styleOfferPrice
      : gap === 3 ? i.styleFollowUp
      : i.styleBalanced,

    primaryInsight:
      goal === 0 ? i.insightCold
      : goal === 1 ? i.insightPipeline
      : i.insightDefault,
  };
}

function generatePersonalInsights(answers: QuestionnaireAnswers, t: Translations) {
  const i = t.onboard.paywall.insights.personal;
  // Chaque carte est pilotée par une question DISTINCTE pour éviter les
  // redondances : Pattern ← q2_pattern, Style ← q1, Insight ← q8.
  const pattern = answers.q2_pattern as number | undefined; // 0: new, 1: similar, 2: more often, 3: not sure
  const style = answers.q1 as number | undefined; // 0: investment, 1: distance, 2: balanced, 3: anxiety
  const reaction = answers.q8 as number | undefined; // 0: anger, 1: sadness, 2: confusion, 3: relief, 4: several

  const patternInsight =
    pattern === 2 ? i.patternRecurring
    : pattern === 0 ? i.patternNew
    : pattern === 1 ? i.patternSimilar
    : i.patternDefault;

  const styleInsight =
    style === 0 ? i.styleInvested
    : style === 1 ? i.styleDistance
    : style === 2 ? i.styleBalanced
    : style === 3 ? i.styleAnxiety
    : i.styleDefault;

  const primaryInsight =
    reaction === 0 ? i.insightAnger
    : reaction === 1 ? i.insightSadness
    : reaction === 2 ? i.insightConfusion
    : reaction === 3 ? i.insightRelief
    : reaction === 4 ? i.insightSeveral
    : i.insightDefault;

  return {
    pattern: patternInsight,
    attachmentStyle: styleInsight,
    primaryInsight,
  };
}

function generateInsights(answers: QuestionnaireAnswers, t: Translations, usageMode?: UsageMode | null) {
  return usageMode === 'professional'
    ? generateProInsights(answers, t)
    : generatePersonalInsights(answers, t);
}

export function PaywallStep({ answers, selectedPlan, onPlanSelect, usageMode, billingPeriod, onBillingPeriodChange }: PaywallStepProps) {
  const { t } = useLanguage();
  const insights = generateInsights(answers, t, usageMode);
  const isPro = usageMode === 'professional';
  const localizedPlans = useMemo(() => getLocalizedPricingPlans(t), [t]);

  // Reorder plans based on usage mode - recommended plan first
  const orderedPlans = useMemo(() => {
    if (usageMode === 'professional') {
      // Pro first for professional users
      return [...localizedPlans].sort((a, b) => (a.id === 'pro' ? -1 : b.id === 'pro' ? 1 : 0));
    } else {
      // Premium first for personal users
      return [...localizedPlans].sort((a, b) => (a.id === 'premium' ? -1 : b.id === 'premium' ? 1 : 0));
    }
  }, [usageMode, localizedPlans]);

  const recommendedPlan = usageMode === 'professional' ? 'pro' : 'premium';

  // L'offre limitée, c'est la remise annuelle (partagée avec les autres pages de
  // tarification) : une fois le compte à rebours expiré, l'annuel redevient 12× le mensuel.
  const { offerActive } = useOfferCountdown();

  const planMonthly = (planId: 'premium' | 'pro') => (planId === 'premium' ? 4.99 : 14.99);
  const planYearlyOffer = (planId: 'premium' | 'pro') => (planId === 'premium' ? 47.99 : 143.99);

  // Prix dynamiques selon le billing period
  const getPlanPrice = (planId: 'premium' | 'pro') => {
    if (billingPeriod === 'monthly') {
      return planMonthly(planId);
    }
    return resolveYearlyPrice(planMonthly(planId), planYearlyOffer(planId), offerActive);
  };

  const getYearlySavings = (planId: 'premium' | 'pro') => {
    return yearlyStandardPrice(planMonthly(planId)) - planYearlyOffer(planId);
  };

  const yearlyDiscount = Math.round((1 - (143.99 / (14.99 * 12))) * 100);
  
  return (
    <div className="w-full max-w-6xl space-y-12">
      {/* Reflection summary (based on the user's own answers — no AI) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#02c950]/10 border border-[#02c950]/30 mb-4">
          <Sparkles className="w-4 h-4 text-[#02c950]" />
          <span className="text-sm font-bold text-[#02c950]">{t.onboard.paywall.badge}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-display font-black text-white mb-3">
          {t.onboard.paywall.title} <span className="text-gradient">{t.onboard.paywall.titleHighlight}</span>
        </h2>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          {isPro ? t.onboard.paywall.subtitlePro : t.onboard.paywall.subtitlePersonal}
        </p>
      </motion.div>

      {/* Free Preview Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid md:grid-cols-3 gap-4 mb-8"
      >
        <div className="oled-card rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#02c950] mt-2 shrink-0 shadow-[0_0_8px_rgba(2,201,80,0.7)]"></div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">{isPro ? t.onboard.paywall.cardPipeline : t.onboard.paywall.cardPattern}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{insights.pattern}</p>
            </div>
          </div>
        </div>

        <div className="oled-card rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#02c950] mt-2 shrink-0 shadow-[0_0_8px_rgba(2,201,80,0.7)]"></div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">{isPro ? t.onboard.paywall.cardSellingStyle : t.onboard.paywall.cardRelationalStyle}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{insights.attachmentStyle}</p>
            </div>
          </div>
        </div>

        <div className="oled-card rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#02c950] mt-2 shrink-0 shadow-[0_0_8px_rgba(2,201,80,0.7)]"></div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">{t.onboard.paywall.cardKeyInsight}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{insights.primaryInsight}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Pricing Plans */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-2xl font-bold text-white text-center mb-6">
          {t.onboard.paywall.choosePlan}
        </h3>
        
        {/* Billing Toggle */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-1 bg-[#060606]/85 backdrop-blur-xl border border-white/10 rounded-full p-1">
            <button
              onClick={() => onBillingPeriodChange('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.45)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.onboard.paywall.monthly}
            </button>
            <button
              onClick={() => onBillingPeriodChange('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all relative ${
                billingPeriod === 'yearly'
                  ? 'bg-[#02c950] text-black shadow-[0_0_20px_rgba(2,201,80,0.45)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.onboard.paywall.yearly}
              {offerActive && (
                <span className="absolute -top-2 -right-2 bg-[#02c950] text-black text-xs font-bold px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(2,201,80,0.5)]">
                  -{yearlyDiscount}%
                </span>
              )}
            </button>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {orderedPlans.map((plan) => (
            <motion.div
              key={plan.id}
              onClick={() => onPlanSelect(plan.id)}
              className={`relative rounded-2xl p-8 border transition-all cursor-pointer backdrop-blur-xl ${
                selectedPlan === plan.id
                  ? 'border-[#02c950] bg-[#02c950]/[0.06] shadow-[0_0_40px_-8px_rgba(2,201,80,0.55)]'
                  : plan.id === recommendedPlan
                  ? 'border-[#02c950]/45 bg-[#060606]/85 hover:border-[#02c950]/70'
                  : 'border-white/10 bg-[#060606]/85 hover:border-white/25'
              }`}
            >
              {/* Badges — une seule rangée centrée pour ne jamais se chevaucher */}
              {(plan.id === recommendedPlan || selectedPlan === plan.id) && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap">
                  {plan.id === recommendedPlan && (
                    <span className="px-3 py-1 rounded-full bg-[#02c950]/15 border border-[#02c950]/40 text-[#02c950] text-xs font-bold flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" />
                      {t.onboard.paywall.recommended}
                    </span>
                  )}
                  {selectedPlan === plan.id && (
                    <span className="px-3 py-1 rounded-full bg-[#02c950] text-black text-xs font-bold flex items-center gap-1.5 shadow-[0_0_18px_rgba(2,201,80,0.5)]">
                      <Check className="w-3.5 h-3.5" />
                      {t.onboard.paywall.selected}
                    </span>
                  )}
                </div>
              )}

              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[#02c950]/12 border border-[#02c950]/25">
                {plan.id === 'premium' ? (
                  <Sparkles className="w-7 h-7 text-[#02c950]" />
                ) : (
                  <Users className="w-7 h-7 text-[#02c950]" />
                )}
              </div>

              {/* Plan name */}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  {billingPeriod === 'yearly' && offerActive && (
                    <span className="text-2xl font-bold text-gray-500 line-through">{yearlyStandardPrice(planMonthly(plan.id)).toFixed(2)}€</span>
                  )}
                  <span className="text-5xl font-black text-white">{getPlanPrice(plan.id).toFixed(2)}€</span>
                  <span className="text-gray-400">{billingPeriod === 'monthly' ? t.onboard.paywall.perMonth : t.onboard.paywall.perYear}</span>
                </div>
                {billingPeriod === 'yearly' && offerActive && (
                  <p className="text-sm text-[#02c950] mt-1">
                    {interpolate(t.onboard.paywall.saveVsMonthly, { amount: getYearlySavings(plan.id).toFixed(2) })}
                  </p>
                )}
                <p className="text-sm text-gray-400 mt-1">
                  {interpolate(t.onboard.paywall.freeTrialCancel, { days: plan.trialDays })}
                </p>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#02c950]/15 border border-[#02c950]/25">
                      <Check className="w-3 h-3 text-[#02c950]" />
                    </div>
                    <span className="text-gray-300 text-sm leading-relaxed">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA Indicator */}
              <div className={`w-full py-3 rounded-xl font-bold text-center transition-all ${
                selectedPlan === plan.id
                  ? 'bg-[#02c950] text-black shadow-[0_0_24px_-6px_rgba(2,201,80,0.6)]'
                  : plan.id === recommendedPlan
                  ? 'bg-[#02c950]/15 text-[#02c950] border border-[#02c950]/40'
                  : 'bg-white/5 text-white border border-white/10'
              }`}>
                {selectedPlan === plan.id ? t.onboard.paywall.selected : plan.id === recommendedPlan ? t.onboard.paywall.recommended : t.onboard.paywall.selectPlan}
              </div>
            </motion.div>
          ))}
        </div>

        {selectedPlan && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 text-center"
          >
            <p className="text-gray-400 text-sm">
              {interpolate(t.onboard.paywall.continueHint, { plan: selectedPlan === 'premium' ? localizedPlans.find(p => p.id === 'premium')!.name : localizedPlans.find(p => p.id === 'pro')!.name })}
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Trust Indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-center gap-6 text-sm text-gray-500 flex-wrap"
      >
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#02c950]" />
          <span>{t.onboard.paywall.trust.trial}</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#02c950]" />
          <span>{t.onboard.paywall.trust.cancel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#02c950]" />
          <span>{t.onboard.paywall.trust.payment}</span>
        </div>
      </motion.div>
    </div>
  );
}
