import { useState } from "react";
import { useLocation } from "wouter";
import { usePlans, useCreateCheckout, useUserPlan } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { RadarBackground } from "@/components/RadarBackground";
import { NavBar } from "@/components/NavBar";
import { motion } from "framer-motion";
import { Check, Zap, Crown, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Pricing() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const { user } = useAuth();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: userPlan } = useUserPlan();
  const { mutate: createCheckout, isPending: isCheckoutPending } = useCreateCheckout();

  const handleSubscribe = (planName: string, priceId: string | null) => {
    if (!user) {
      navigate("/onboard");
      return;
    }

    // Sauvegarder le plan sélectionné dans localStorage
    localStorage.setItem('selectedPlan', JSON.stringify({
      planName,
      priceId,
      billingPeriod
    }));

    // Rediriger vers l'onboarding pour compléter le questionnaire
    navigate("/onboard");
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#02c950]" />
      </div>
    );
  }

  const getPlanIcon = (planName: string) => {
    switch (planName) {
      case "base":
        return Zap;
      case "pro":
        return Crown;
      default:
        return Zap;
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  const currentPlanName = userPlan?.plan.name || "base";

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-body text-white relative overflow-hidden">
      <RadarBackground />

      {/* Navbar */}
      <NavBar
        actions={
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-white hover:text-[#02c950]"
          >
            {t.pricing.nav.back}
          </Button>
        }
      />

      {/* Main Content */}
      <div className="relative z-10 pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-6xl font-bold mb-6"
            >
              {t.pricing.title} <span className="text-[#02c950]">{t.pricing.titleHighlight}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-gray-400 max-w-2xl mx-auto"
            >
              {t.pricing.subtitle}
            </motion.p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex rounded-full p-1 bg-white/5 border border-white/10">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  billingPeriod === "monthly"
                    ? "bg-[#02c950] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t.pricing.monthly}
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  billingPeriod === "yearly"
                    ? "bg-[#02c950] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t.pricing.yearly}
                <span className="ml-2 text-xs bg-[#02c950]/20 text-[#02c950] px-2 py-1 rounded-full">
                  {t.pricing.yearlyDiscount}
                </span>
              </button>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans?.map((plan, index) => {
              const Icon = getPlanIcon(plan.name);
              const price = billingPeriod === "monthly" ? plan.priceMonthly : plan.priceYearly;
              const priceId =
                billingPeriod === "monthly"
                  ? plan.stripePriceIdMonthly
                  : plan.stripePriceIdYearly;
              const isCurrentPlan = currentPlanName === plan.name;
              const isPopular = plan.name === "pro";

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative rounded-3xl border p-8 backdrop-blur-xl ${
                    isPopular
                      ? "border-[#02c950] bg-[#02c950]/5 scale-105"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#02c950] text-black px-4 py-1 rounded-full text-sm font-bold">
                      {t.pricing.mostPopular}
                    </div>
                  )}

                  {isCurrentPlan && (
                    <div className="absolute top-4 right-4 bg-[#02c950] text-black px-3 py-1 rounded-full text-xs font-bold">
                      {t.pricing.currentPlan}
                    </div>
                  )}

                  <div className="mb-6">
                    <div className="w-12 h-12 rounded-full bg-[#02c950]/20 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-[#02c950]" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{plan.displayName}</h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold">{formatPrice(price)}€</span>
                      <span className="text-gray-400">
                        /{billingPeriod === "monthly" ? t.pricing.perMonth : t.pricing.perYear}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-[#02c950] flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-3">
                    <Button
                      onClick={() => handleSubscribe(plan.name, priceId)}
                      disabled={isCurrentPlan || isCheckoutPending}
                      className={`w-full h-12 rounded-xl font-bold ${
                        isPopular
                          ? "bg-[#02c950] hover:bg-[#02c950]/90 text-black"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }`}
                    >
                      {isCheckoutPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t.pricing.loading}
                        </>
                      ) : isCurrentPlan ? (
                        t.pricing.currentPlan
                      ) : (
                        t.pricing.choosePlanButton
                      )}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* FAQ or Additional Info */}
          <div className="mt-20 text-center">
            <p className="text-gray-400">
              {t.pricing.needHelp}{" "}
              <a href="mailto:support@waler.app" className="text-[#02c950] hover:underline">
                {t.pricing.contactUs}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
