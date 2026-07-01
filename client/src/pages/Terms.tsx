import { motion } from "framer-motion";
import { FileText, CreditCard, RefreshCw, Lock, AlertTriangle, CheckCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function Terms() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="flex justify-end mb-8">
          <LanguageSwitcher />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-center mb-16">
            <div className="w-20 h-20 rounded-3xl bg-green-500/10 backdrop-blur-md border border-green-500/20 flex items-center justify-center mx-auto mb-8">
              <FileText className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
              {t.termsPage.title1} <span className="text-gradient">{t.termsPage.title2}</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              {t.termsPage.subtitle}
            </p>
          </div>

          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.acceptance.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.termsPage.acceptance.p1}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.service.title}</h2>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    {t.termsPage.service.p1}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.subscriptions.title}</h2>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    {t.termsPage.subscriptions.p1}
                  </p>
                  <ul className="space-y-2 text-gray-400">
                    {t.termsPage.subscriptions.items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.cancellation.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.termsPage.cancellation.p1Before}{' '}
                    <a href="mailto:walerwebsite@outlook.com" className="text-green-400 hover:text-green-300 transition-colors">
                      walerwebsite@outlook.com
                    </a>{t.termsPage.cancellation.p1After}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-gradient-to-r from-green-500/10 to-blue-500/10 backdrop-blur-xl rounded-3xl border border-green-500/20 p-8"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.yourData.title}</h2>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    <strong className="text-green-400">{t.termsPage.yourData.bold}</strong>
                  </p>
                  <p className="text-gray-300 leading-relaxed">
                    {t.termsPage.yourData.p2Before}{' '}
                    <a href="/privacy" className="text-green-400 hover:text-green-300 transition-colors">{t.termsPage.yourData.p2LinkText}</a>{t.termsPage.yourData.p2After}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.termsPage.acceptableUse.title}</h2>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    {t.termsPage.acceptableUse.p1}
                  </p>
                  <p className="text-gray-300 leading-relaxed">
                    {t.termsPage.acceptableUse.p2}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8"
            >
              <h2 className="text-2xl font-bold mb-4 text-white">{t.termsPage.contact.title}</h2>
              <p className="text-gray-300 leading-relaxed">
                {t.termsPage.contact.prefix}{' '}
                <a href="mailto:walerwebsite@outlook.com" className="text-green-400 hover:text-green-300 transition-colors">
                  walerwebsite@outlook.com
                </a>
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-center text-sm text-gray-500 pt-8"
            >
              {t.termsPage.lastUpdated}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
