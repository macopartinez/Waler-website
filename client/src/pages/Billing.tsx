import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Check, CreditCard, Calendar, Shield, Sparkles, Users,
  Crown, AlertTriangle, ExternalLink, RefreshCw, Loader2, Clock,
} from 'lucide-react';
import { GlassText } from '@/components/GlassText';
import { RadarBackground } from '@/components/RadarBackground';
import { usePlans, useUserPlan, useCreateCheckout, useCustomerPortal } from '@/hooks/use-subscription';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage, interpolate } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import type { Translations } from '@/lib/i18n/en';

type BillingPeriod = 'monthly' | 'yearly';

// Le serveur stocke les prix en centimes (499 = 4.99€).
function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Statut Stripe → libellé + couleur lisibles.
function statusBadge(status: string | null | undefined, t: Translations): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: t.billing.status.active, className: 'bg-[#02c950]/15 border-[#02c950]/40 text-[#02c950]' };
    case 'trialing':
      return { label: t.billing.status.trialing, className: 'bg-[#02c950]/15 border-[#02c950]/40 text-[#02c950]' };
    case 'past_due':
      return { label: t.billing.status.pastDue, className: 'bg-amber-500/15 border-amber-500/40 text-amber-400' };
    case 'canceled':
      return { label: t.billing.status.canceled, className: 'bg-red-500/15 border-red-500/40 text-red-400' };
    case 'incomplete':
    case 'incomplete_expired':
      return { label: t.billing.status.incomplete, className: 'bg-amber-500/15 border-amber-500/40 text-amber-400' };
    default:
      return { label: t.billing.status.free, className: 'bg-white/10 border-white/20 text-gray-300' };
  }
}

export default function Billing() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { trialEndsAt, isTrialActive } = useSubscription();

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: userPlan, isLoading: userPlanLoading } = useUserPlan();
  const checkout = useCreateCheckout();
  const portal = useCustomerPortal();

  const subscription = userPlan?.subscription ?? null;
  const currentPlan = userPlan?.plan ?? null;
  const hasActiveSub = !!subscription?.stripeSubscriptionId;

  // Par défaut on aligne le sélecteur sur la période en cours de l'utilisateur.
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    (subscription?.billingPeriod as BillingPeriod) || 'yearly'
  );

  const loading = plansLoading || userPlanLoading;
  const badge = statusBadge(subscription?.status, t);

  // Plans triés Base puis Pro pour un comparatif stable.
  const orderedPlans = [...(plans ?? [])].sort((a, b) =>
    a.name === 'pro' ? 1 : b.name === 'pro' ? -1 : 0
  );

  const currentPrice = currentPlan
    ? subscription?.billingPeriod === 'monthly'
      ? currentPlan.priceMonthly
      : currentPlan.priceYearly
    : null;

  const handleSwitch = (planName: string, period: BillingPeriod) => {
    const plan = plans?.find((p) => p.name === planName);
    if (!plan) return;

    // Un abonnement Stripe existe déjà : changement de plan / période, moyen de
    // paiement, factures et résiliation passent par le portail client Stripe
    // (gestion de la proratisation incluse). Sinon, on lance un nouveau checkout.
    if (hasActiveSub) {
      portal.mutate();
      return;
    }

    const priceId = period === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) {
      toast({
        title: t.billing.unavailableToast.title,
        description: t.billing.unavailableToast.description,
        variant: 'destructive',
      });
      return;
    }
    checkout.mutate({ priceId, billingPeriod: period });
  };

  const busy = checkout.isPending || portal.isPending;

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-body text-white relative overflow-hidden">
      <RadarBackground />

      {/* Header */}
      <nav className="fixed w-full top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <button
            onClick={() => setLocation('/dashboard/1')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {t.billing.backToDashboard}
          </button>
          <GlassText text="WALER" fontSize={32} />
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="relative z-10 pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 bg-[#02c950]/10 border border-[#02c950]/30 rounded-full px-4 py-2 mb-4">
              <CreditCard className="w-4 h-4 text-[#02c950]" />
              <span className="text-[#02c950] font-semibold text-sm">{t.billing.badge}</span>
            </div>
            <h1 className="text-4xl font-bold text-gradient">{t.billing.title}</h1>
            <p className="text-gray-400 text-lg mt-2 max-w-2xl">
              {t.billing.subtitle}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              {t.billing.loadingSubscription}
            </div>
          ) : (
            <>
              {/* Current subscription summary */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="oled-card rounded-2xl p-6 md:p-8 mb-8"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#02c950]/12 border border-[#02c950]/25 flex items-center justify-center">
                      {currentPlan?.name === 'pro' ? (
                        <Crown className="w-7 h-7 text-[#02c950]" />
                      ) : (
                        <Sparkles className="w-7 h-7 text-[#02c950]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-white">
                          {interpolate(t.billing.planNameLabel, { plan: currentPlan?.displayName ?? t.billing.freePlan })}
                        </h2>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">
                        {currentPrice != null ? (
                          <>
                            <span className="text-white font-semibold">{formatPrice(currentPrice)}€</span>
                            {' '}/ {subscription?.billingPeriod === 'monthly' ? t.billing.perMonth : t.billing.perYear}
                          </>
                        ) : (
                          t.billing.noActiveSubscription
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {hasActiveSub && (
                      <button
                        onClick={() => portal.mutate()}
                        disabled={busy}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors disabled:opacity-50"
                      >
                        {portal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        {t.billing.managePayment}
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Detail grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <DetailTile
                    icon={<Calendar className="w-4 h-4 text-[#02c950]" />}
                    label={subscription?.cancelAtPeriodEnd ? t.billing.detail.accessUntil : t.billing.detail.nextRenewal}
                    value={formatDate(subscription?.currentPeriodEnd)}
                  />
                  <DetailTile
                    icon={<RefreshCw className="w-4 h-4 text-[#02c950]" />}
                    label={t.billing.detail.billingPeriod}
                    value={
                      subscription?.billingPeriod
                        ? subscription.billingPeriod === 'monthly'
                          ? t.billing.detail.monthly
                          : t.billing.detail.yearly
                        : '—'
                    }
                  />
                  <DetailTile
                    icon={<Users className="w-4 h-4 text-[#02c950]" />}
                    label={t.billing.detail.trackedAccounts}
                    value={
                      currentPlan
                        ? currentPlan.maxAccounts === 0
                          ? t.billing.detail.unlimited
                          : interpolate(t.billing.detail.upTo, { count: currentPlan.maxAccounts })
                        : '—'
                    }
                  />
                  <DetailTile
                    icon={<Clock className="w-4 h-4 text-[#02c950]" />}
                    label={t.billing.detail.history}
                    value={
                      currentPlan
                        ? currentPlan.maxHistoryDays === 0
                          ? t.billing.detail.unlimited
                          : interpolate(t.billing.detail.days, { count: currentPlan.maxHistoryDays })
                        : '—'
                    }
                  />
                </div>

                {/* Trial banner */}
                {isTrialActive && trialEndsAt && (
                  <div className="mt-6 flex items-center gap-3 rounded-xl border border-[#02c950]/30 bg-[#02c950]/10 px-4 py-3">
                    <Sparkles className="w-5 h-5 text-[#02c950] flex-shrink-0" />
                    <p className="text-sm text-gray-200">
                      {interpolate(t.billing.trialBanner, { date: formatDate(trialEndsAt) })}
                    </p>
                  </div>
                )}

                {/* Cancellation banner */}
                {subscription?.cancelAtPeriodEnd && (
                  <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-gray-200 flex-1 min-w-[12rem]">
                      {interpolate(t.billing.cancellationBanner, { date: formatDate(subscription.currentPeriodEnd) })}
                    </p>
                    <button
                      onClick={() => portal.mutate()}
                      disabled={busy}
                      className="text-sm font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 disabled:opacity-50"
                    >
                      {t.billing.reactivate}
                    </button>
                  </div>
                )}
              </motion.div>

              {/* Switch plan section */}
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">{t.billing.switchPlan.title}</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    {hasActiveSub
                      ? t.billing.switchPlan.subtitleWithSub
                      : t.billing.switchPlan.subtitleNoSub}
                  </p>
                </div>

                {/* Billing toggle */}
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1">
                  <button
                    onClick={() => setBillingPeriod('monthly')}
                    className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                      billingPeriod === 'monthly' ? 'bg-[#02c950] text-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t.billing.detail.monthly}
                  </button>
                  <button
                    onClick={() => setBillingPeriod('yearly')}
                    className={`relative px-5 py-2 rounded-full text-sm font-bold transition-all ${
                      billingPeriod === 'yearly' ? 'bg-[#02c950] text-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t.billing.detail.yearly}
                    <span className="absolute -top-2 -right-2 bg-[#02c950] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                      -20%
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {orderedPlans.map((plan) => {
                  const price = billingPeriod === 'yearly' ? plan.priceYearly : plan.priceMonthly;
                  const isCurrent =
                    currentPlan?.name === plan.name &&
                    (!hasActiveSub || subscription?.billingPeriod === billingPeriod);
                  const isPro = plan.name === 'pro';

                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative rounded-2xl p-8 ${
                        isPro
                          ? 'border-2 border-[#02c950]/50 bg-gradient-to-br from-[#02c950]/10 to-emerald-500/5 shadow-[0_0_30px_rgba(2,201,80,0.18)]'
                          : 'oled-card'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 bg-[#02c950]/15 border border-[#02c950]/40 text-[#02c950] px-3 py-1.5 rounded-full text-xs font-bold">
                          <Check className="w-3.5 h-3.5" />
                          {t.billing.currentPlan}
                        </div>
                      )}

                      <div className="w-14 h-14 rounded-2xl bg-[#02c950]/12 border border-[#02c950]/25 flex items-center justify-center mb-4">
                        {isPro ? <Crown className="w-7 h-7 text-[#02c950]" /> : <Sparkles className="w-7 h-7 text-[#02c950]" />}
                      </div>

                      <h3 className="text-2xl font-bold text-white mb-2">{plan.displayName}</h3>

                      <div className="mb-6">
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black text-white">{formatPrice(price)}€</span>
                          <span className="text-gray-400">/{billingPeriod === 'monthly' ? t.billing.perMonth : t.billing.perYear}</span>
                        </div>
                        {billingPeriod === 'yearly' && (
                          <p className="text-sm text-[#02c950] mt-1">
                            {interpolate(t.billing.saveVsMonthly, { amount: formatPrice(plan.priceMonthly * 12 - plan.priceYearly) })}
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 mb-8">
                        {plan.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#02c950]/15">
                              <Check className="w-3 h-3 text-[#02c950]" />
                            </div>
                            <span className="text-gray-300 text-sm leading-relaxed">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {isCurrent ? (
                        <div className="w-full py-3 rounded-xl font-bold text-center bg-white/10 text-white">
                          {t.billing.yourCurrentPlan}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSwitch(plan.name, billingPeriod)}
                          disabled={busy}
                          className={`w-full py-3 rounded-xl font-bold text-center transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2 ${
                            isPro
                              ? 'bg-[#02c950] text-black hover:bg-[#02da57]'
                              : 'bg-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                          {hasActiveSub ? interpolate(t.billing.switchTo, { plan: plan.displayName }) : interpolate(t.billing.chooseButton, { plan: plan.displayName })}
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Trust badges */}
              <div className="mt-12 flex flex-wrap justify-center gap-8 text-gray-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  <span>{t.billing.trust.securePayment}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  <span>{t.billing.trust.cancelAnytime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  <span>{t.billing.trust.proratedChanges}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}
