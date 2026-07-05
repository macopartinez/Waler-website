import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, Users, Zap } from "lucide-react";
import { PRICING_PLANS } from "@/config/pricing";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlan?: 'premium' | 'pro';
  onPlanSelected?: (planId: 'premium' | 'pro') => void;
  requireSelection?: boolean;
}

export function PricingModal({ isOpen, onClose, defaultPlan, onPlanSelected, requireSelection = false }: PricingModalProps) {
  const { upgradeToPremium, upgradeToPro } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'premium' | 'pro' | null>(null);

  const handleUpgrade = async (planId: 'premium' | 'pro') => {
    setIsLoading(true);
    setSelectedPlan(planId);
    
    if (onPlanSelected) {
      onPlanSelected(planId);
    }
    
    try {
      if (planId === 'premium') {
        await upgradeToPremium();
      } else {
        await upgradeToPro();
      }
    } catch (error) {
      console.error('Upgrade failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requireSelection ? undefined : onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-black border border-white/10 rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto">
              {/* Header */}
              <div className="sticky top-0 bg-black/95 backdrop-blur-xl border-b border-white/10 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-display font-black text-white mb-1">
                    Choose Your Plan
                  </h2>
                  <p className="text-gray-400">Start your free trial today. Cancel anytime.</p>
                </div>
                {!requireSelection && (
                  <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Plans */}
              <div className="p-6 grid md:grid-cols-2 gap-6">
                {PRICING_PLANS.map((plan) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative rounded-2xl p-8 border-2 transition-all ${
                      plan.popular
                        ? 'border-green-500 bg-gradient-to-br from-green-500/10 to-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold">
                        Most Popular
                      </div>
                    )}

                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
                      plan.id === 'premium' 
                        ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20' 
                        : 'bg-gradient-to-br from-green-500/20 to-emerald-500/20'
                    }`}>
                      {plan.id === 'premium' ? (
                        <Sparkles className="w-7 h-7 text-green-400" />
                      ) : (
                        <Users className="w-7 h-7 text-green-400" />
                      )}
                    </div>

                    {/* Plan name */}
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white">{plan.price}€</span>
                        <span className="text-gray-400">/{plan.interval}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {plan.trialDays}-day free trial • Cancel anytime
                      </p>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isLoading}
                      className={`w-full py-4 rounded-xl font-bold text-lg mb-6 transition-all ${
                        plan.popular
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-[0_0_30px_rgba(34,197,94,0.5)]'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        plan.cta
                      )}
                    </button>

                    {/* Features */}
                    <div className="space-y-3">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            plan.popular ? 'bg-green-500/20' : 'bg-green-500/20'
                          }`}>
                            <Check className={`w-3 h-3 ${
                              plan.popular ? 'text-green-400' : 'text-green-400'
                            }`} />
                          </div>
                          <span className="text-gray-300 text-sm leading-relaxed">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 p-6 bg-white/5">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span>Secure payment powered by Stripe • Your data is encrypted and safe</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
