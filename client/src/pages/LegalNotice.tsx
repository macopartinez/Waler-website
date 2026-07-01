import { motion } from "framer-motion";
import { Building2, Server, Mail, Globe, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function LegalNotice() {
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
              <Building2 className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
              {t.legalNoticePage.title1} <span className="text-gradient">{t.legalNoticePage.title2}</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              {t.legalNoticePage.subtitle}
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
                  <Building2 className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.legalNoticePage.publisher.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.legalNoticePage.publisher.p1Before} <strong className="text-white">{t.legalNoticePage.publisher.companyName}</strong>{t.legalNoticePage.publisher.p1After}
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
                  <Mail className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.legalNoticePage.contact.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.legalNoticePage.contact.emailLabel}{' '}
                    <a href="mailto:walerwebsite@outlook.com" className="text-green-400 hover:text-green-300 transition-colors">
                      walerwebsite@outlook.com
                    </a>
                    <br />
                    {t.legalNoticePage.contact.instagramLabel}{' '}
                    <a href="https://instagram.com/waler.web" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 transition-colors">
                      @waler.web
                    </a>
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
                  <Server className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.legalNoticePage.hosting.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.legalNoticePage.hosting.p1Before} <strong className="text-green-400">{t.legalNoticePage.hosting.bold}</strong>{t.legalNoticePage.hosting.p1After}{' '}
                    <a href="/privacy" className="text-green-400 hover:text-green-300 transition-colors">{t.legalNoticePage.hosting.linkText}</a> {t.legalNoticePage.hosting.p1End}
                  </p>
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
                  <Globe className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.legalNoticePage.ip.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    {t.legalNoticePage.ip.p1}
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
                  <Shield className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-white">{t.legalNoticePage.commitment.title}</h2>
                  <p className="text-gray-300 leading-relaxed">
                    <strong className="text-green-400">{t.legalNoticePage.commitment.bold}</strong> {t.legalNoticePage.commitment.p2}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="text-center text-sm text-gray-500 pt-8"
            >
              {t.legalNoticePage.lastUpdated}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
