import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { RadarBackground } from "@/components/RadarBackground";
import { BackgroundWaler } from "@/components/BackgroundWaler";
import { GlassText } from "@/components/GlassText";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ArrowRight, Heart, Users, TrendingDown, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Storytelling() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();

  const storyBeats = t.storytelling.beats.map((beat, i) => ({
    ...beat,
    icon: [Users, Heart, TrendingDown, Shield][i],
    color: "text-green-400",
  }));

  return (
    <div className="min-h-screen bg-transparent font-body text-white relative overflow-hidden">
      <RadarBackground />
      <BackgroundWaler />

      {/* Navbar */}
      <nav className="fixed w-full top-0 z-50 bg-transparent">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button onClick={() => navigate("/")}>
            <GlassText text="WALER" fontSize={36} />
          </button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={() => navigate("/onboard")}
              className="text-base font-bold px-6 py-2.5 rounded-full transition-all duration-300 bg-[#02c950]/20 backdrop-blur-md border border-white/20 hover:shadow-[0_0_20px_rgba(2,201,80,0.4)] hover:bg-[#02c950]/30 text-white"
            >
              {t.storytelling.nav.cta}
            </button>
          </div>
        </div>
      </nav>

      {/* Story Content */}
      <div className="relative z-10 min-h-screen pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-24"
          >
            <h1 className="text-5xl md:text-7xl font-display font-black leading-tight mb-6 text-white tracking-tighter">
              {t.storytelling.hero.title} <span className="text-gradient">{t.storytelling.hero.titleHighlight}</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              {t.storytelling.hero.subtitle}
            </p>
          </motion.div>

          {/* Story Beats */}
          <div className="space-y-32">
            {storyBeats.map((beat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className={`w-24 h-24 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center mb-8 ${beat.color}`}
                >
                  <beat.icon className="w-12 h-12" />
                </motion.div>
                <h2 className="text-3xl md:text-5xl font-display font-black mb-6 text-white tracking-tight">
                  {beat.title}
                </h2>
                <p className="text-lg md:text-xl text-gray-400 max-w-2xl leading-relaxed">
                  {beat.description}
                </p>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mt-32"
          >
            <h2 className="text-4xl md:text-6xl font-display font-black mb-8 text-white tracking-tighter">
              {t.storytelling.cta.title} <span className="text-gradient">{t.storytelling.cta.titleHighlight}</span>
            </h2>
            <button
              onClick={() => navigate("/onboard")}
              className="text-lg px-10 py-5 rounded-full transition-all duration-300 bg-[#02c950]/20 backdrop-blur-md border border-white/20 hover:shadow-[0_0_30px_rgba(2,201,80,0.5)] hover:bg-[#02c950]/30 font-bold text-white inline-flex items-center gap-3"
            >
              {t.storytelling.cta.button} <ArrowRight className="w-6 h-6" />
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
