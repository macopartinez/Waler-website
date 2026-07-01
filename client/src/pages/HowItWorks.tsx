import { Shield, UserPlus, Eye, TrendingUp, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage, interpolate } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function HowItWorks() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-end mb-6">
            <LanguageSwitcher />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-bold mb-6"
          >
            {t.howItWorks.heroTitle}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-blue-100"
          >
            {t.howItWorks.heroSubtitle}
          </motion.p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Le Concept */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-blue-600" />
            <h2 className="text-3xl font-bold text-gray-900">{t.howItWorks.concept.title}</h2>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
            <p className="text-lg text-gray-700 mb-4">
              Waler is a <strong>{t.howItWorks.concept.p1Bold}</strong>{t.howItWorks.concept.p1Rest}
            </p>
            <p className="text-gray-600">
              {t.howItWorks.concept.p2}
            </p>
          </div>
        </section>

        {/* Le Processus */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <h2 className="text-3xl font-bold text-gray-900">{t.howItWorks.process.title}</h2>
          </div>

          <div className="space-y-4">
            {t.howItWorks.process.steps.map((item, idx) => ({
              step: idx + 1,
              title: item.title,
              description: item.description,
              icon: "",
              highlight: idx === 2,
            })).map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: item.step * 0.1 }}
                className={`flex gap-4 p-6 rounded-xl border-2 ${
                  item.highlight
                    ? 'bg-orange-50 border-orange-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                    item.highlight ? 'bg-orange-200' : 'bg-gray-100'
                  }`}>
                    {item.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${
                      item.highlight ? 'text-orange-600' : 'text-gray-500'
                    }`}>
                      {interpolate(t.howItWorks.process.stepLabel, { step: item.step })}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Compte Privé */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Lock className="w-8 h-8 text-orange-600" />
            <h2 className="text-3xl font-bold text-gray-900">{t.howItWorks.privateAccount.title}</h2>
          </div>

          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-8">
            <div className="flex items-start gap-4 mb-6">
              <AlertCircle className="w-8 h-8 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-orange-900 mb-2">
                  {t.howItWorks.privateAccount.alertTitle}
                </h3>
                <p className="text-orange-800">
                  {t.howItWorks.privateAccount.alertDescription}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 border border-orange-200">
              <h4 className="font-bold text-gray-900 mb-4">{t.howItWorks.privateAccount.howToTitle}</h4>
              <ol className="space-y-3 text-gray-700">
                {t.howItWorks.privateAccount.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="font-bold text-orange-600 flex-shrink-0">{idx + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-6 p-4 bg-orange-100 rounded-lg">
              <p className="text-sm text-orange-900">
                <strong>{t.howItWorks.privateAccount.noteBold}</strong>{t.howItWorks.privateAccount.noteRest}
              </p>
            </div>
          </div>
        </section>

        {/* Manual Blocker Marking */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <UserPlus className="w-8 h-8 text-red-600" />
            <h2 className="text-3xl font-bold text-gray-900">{t.howItWorks.blockers.title}</h2>
          </div>

          <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-8">
            <div className="space-y-4">
              <p className="text-gray-700">
                <strong className="text-red-900">{t.howItWorks.blockers.importantBold}</strong>{t.howItWorks.blockers.importantMid}<strong>{t.howItWorks.blockers.importantBold2}</strong>{t.howItWorks.blockers.importantRest}
              </p>
              
              <div className="bg-white rounded-lg p-6 border border-red-200">
                <h4 className="font-bold text-gray-900 mb-3">{t.howItWorks.blockers.howItWorksTitle}</h4>
                <ol className="space-y-3 text-gray-700 text-sm">
                  {t.howItWorks.blockers.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="font-bold text-red-600 flex-shrink-0">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                  <li className="ml-6 space-y-2">
                    <div className="flex items-center gap-2 text-xs bg-green-50 px-3 py-2 rounded border border-green-200">
                      <span className="text-green-600">OK</span>
                      <span><strong>{t.howItWorks.blockers.optionOkBold}</strong>{t.howItWorks.blockers.optionOkRest}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs bg-red-50 px-3 py-2 rounded border border-red-200">
                      <span className="text-red-600">X</span>
                      <span><strong>{t.howItWorks.blockers.optionBlockedBold}</strong>{t.howItWorks.blockers.optionBlockedRest}</span>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="bg-orange-100 rounded-lg p-4 border border-orange-300">
                <p className="text-sm text-orange-900">
                  <strong>{t.howItWorks.blockers.emotionalSupportBold}</strong>{t.howItWorks.blockers.emotionalSupportRest}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <h5 className="font-bold text-gray-900 mb-2">{t.howItWorks.blockers.ghostsTitle}</h5>
                  <p className="text-sm text-gray-600">
                    {t.howItWorks.blockers.ghostsDescription}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <h5 className="font-bold text-gray-900 mb-2">{t.howItWorks.blockers.blockersTitle}</h5>
                  <p className="text-sm text-gray-600">
                    {t.howItWorks.blockers.blockersDescription}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sécurité & Confidentialité */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-green-600" />
            <h2 className="text-3xl font-bold text-gray-900">{t.howItWorks.security.title}</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <h3 className="font-bold text-green-900 mb-3">{t.howItWorks.security.dataProtectedTitle}</h3>
              <ul className="space-y-2 text-green-800 text-sm">
                {t.howItWorks.security.dataProtected.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-3">{t.howItWorks.security.privacyTitle}</h3>
              <ul className="space-y-2 text-blue-800 text-sm">
                {t.howItWorks.security.privacy.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
