import { RadarBackground } from "@/components/RadarBackground";
import { BackgroundWaler } from "@/components/BackgroundWaler";
import { NavBar } from "@/components/NavBar";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, ShieldCheck, Zap, Eye, Search, Lock, ChevronDown, ArrowRight, Users, Heart, TrendingDown, Shield, Star, User, Crown, Target, TrendingUp, Network, MessageCircle, Activity, Clock, Link, UserPlus, Sparkles, Flame, Repeat, Check, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AnalyticsPreview } from "@/components/AnalyticsPreview";
import { ConnectDialog } from "@/components/ConnectDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Étapes du process complet : scan → détection → identification (anonymisée)
const DETECTION_STEPS = [
  { label: "Scanning your followers", Icon: Search },
  { label: "Change detected", Icon: TrendingDown },
  { label: "Unfollower identified", Icon: UserMinus },
];

function BrowserNotification() {
  const [followers, setFollowers] = useState(1248);
  // phase: -1 = caché, 0..2 = étape en cours, 3 = terminé (carte maintenue)
  const [phase, setPhase] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      if (cancelled) return;
      setPhase(-1);
      setFollowers(1248);
      timers.push(setTimeout(() => setPhase(0), 500));   // scan
      timers.push(setTimeout(() => {                     // détection (-1 abonné)
        setPhase(1);
        setFollowers((f) => f - 1);
      }, 1900));
      timers.push(setTimeout(() => setPhase(2), 3300));  // identification
      timers.push(setTimeout(() => setPhase(3), 4400));  // terminé
      timers.push(setTimeout(() => setPhase(-1), 7200)); // disparition
      timers.push(setTimeout(runCycle, 8600));           // boucle
    }

    timers.push(setTimeout(runCycle, 1400));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="w-[400px] bg-[#1a1a1a] rounded-2xl border border-[#2d2d2d] shadow-2xl overflow-hidden">
      {/* Barre du navigateur */}
      <div className="flex items-center gap-2 px-4 h-10 bg-[#2a2a2a] border-b border-black/40">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-2 h-6 rounded-full bg-[#1a1a1a] flex items-center px-3 gap-2">
          <Lock className="w-3 h-3 text-gray-500" />
          <span className="text-[11px] text-gray-400">instagram.com</span>
        </div>
        {/* Icône de l'extension Waler épinglée */}
        <div className="w-6 h-6 rounded-md bg-[#02c950] flex items-center justify-center text-[11px] font-black text-black shadow-[0_0_12px_rgba(2,201,80,0.6)]">W</div>
      </div>

      {/* Page Instagram (factice) + notification de l'extension */}
      <div className="relative h-[230px] bg-gradient-to-b from-[#2d9f5e] to-[#1e7a42] overflow-hidden">
        <div className="absolute inset-0 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-white/25 border-2 border-white/40 shrink-0" />
            <div className="flex-1">
              <div className="h-2.5 w-20 rounded bg-white/35 mb-2.5" />
              <div className="flex gap-4">
                <div>
                  <div className="text-white font-bold text-sm leading-none">86</div>
                  <div className="text-[9px] text-white/60 mt-0.5">posts</div>
                </div>
                <div>
                  <div className="text-white font-bold text-sm leading-none tabular-nums transition-all duration-300">
                    {followers.toLocaleString("en-US")}
                  </div>
                  <div className="text-[9px] text-white/60 mt-0.5">followers</div>
                </div>
                <div>
                  <div className="text-white font-bold text-sm leading-none">312</div>
                  <div className="text-[9px] text-white/60 mt-0.5">following</div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-white/15" />
            ))}
          </div>
        </div>

        {/* Notification Waler — process complet, identité anonymisée */}
        <AnimatePresence>
          {phase >= 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
              className="absolute bottom-3 right-3 w-[262px] rounded-2xl border border-[#02c950]/30 bg-black/90 backdrop-blur-xl p-3.5 shadow-[0_18px_45px_rgba(0,0,0,0.6),0_0_34px_-8px_rgba(2,201,80,0.45)]"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-[18px] h-[18px] rounded-[5px] bg-[#02c950] flex items-center justify-center text-[11px] font-black text-black">W</div>
                <div className="text-[13px] font-semibold text-white">Waler</div>
                <div className="ml-auto text-[11px] text-white/40">now</div>
              </div>

              <div className="space-y-2">
                {DETECTION_STEPS.map((step, idx) => {
                  const done = idx < phase;
                  const active = idx === phase;
                  const shown = idx <= phase;
                  return (
                    <div key={idx} className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                          done || active ? "border-[#02c950]/40 bg-[#02c950]/12" : "border-white/10"
                        }`}
                      >
                        {done ? (
                          <Check className="w-3 h-3 text-[#02c950]" />
                        ) : active ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#02c950] animate-pulse" />
                        ) : (
                          <step.Icon className="w-3 h-3 text-white/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[12.5px] leading-tight ${active ? "font-semibold text-white" : shown ? "text-white/85" : "text-white/30"}`}
                        >
                          {step.label}
                        </div>
                        {/* Identité anonymisée révélée à la dernière étape */}
                        {idx === 2 && phase >= 2 && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] border border-white/10 px-2 py-1"
                          >
                            <Lock className="w-2.5 h-2.5 text-[#02c950] shrink-0" />
                            <span className="text-[11px] font-mono tracking-wider text-white/70 select-none" style={{ filter: "blur(0.4px)" }}>
                              @t•••••_95
                            </span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Landing() {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const words = ["personal", "networker", "mentor", "professional", "closer"];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % words.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <div className="h-screen overflow-y-auto snap-y snap-mandatory bg-transparent font-body text-white relative" data-testid="scroll-container">
      <RadarBackground />
      <BackgroundWaler />
      <div className="grain-overlay z-0" aria-hidden="true" />
      <ConnectDialog isOpen={isOpen} setIsOpen={setIsOpen} />
      <NavBar
        logoSize={36}
        actions={
          <>
            <button
              onClick={() => setIsOpen(true)}
              className="text-sm font-bold text-white hover:text-white/80 transition-colors order-1 sm:order-none"
              data-testid="button-login"
            >
              Welcome Back
            </button>
            <button
              onClick={() => navigate("/onboard")}
              className="text-sm sm:text-base font-bold px-4 sm:px-6 py-2.5 rounded-full transition-all duration-300 bg-[#02c950]/20 backdrop-blur-md border border-white/20 hover:shadow-[0_0_20px_rgba(2,201,80,0.4)] hover:bg-[#02c950]/30 text-white whitespace-nowrap"
              data-testid="button-start-tracking"
            >
              Begin Your Journey
            </button>
          </>
        }
      />
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-hero">
        <div className="max-w-5xl mx-auto text-center">
          {/* Hero renders visible immediately (no opacity:0 entrance): it's the
              LCP element and above the fold, so animating it in would delay LCP
              and flicker against the static hero painted from index.html. */}
          <div className="text-paper">
            <h1 className="text-6xl md:text-8xl font-display font-black leading-[1] mb-8 text-white tracking-tighter">
              The first relationship <br />
              clarity tool for{" "}
              <span className="inline-block w-[280px] md:w-[520px] whitespace-nowrap align-bottom">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentWordIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-gradient inline-block"
                  >
                    {words[currentWordIndex]}.
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
              Waler detects when someone close leaves your digital circle — and guides you through what it really means about you and your relationship.
            </p>
          </div>
        </div>
      </section>
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-how-it-works">
        <div className="max-w-5xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="text-center mb-16 text-paper">
              <h2 className="text-4xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                How it <span className="text-gradient">works</span>
              </h2>
              <p className="text-lg max-w-2xl mx-auto text-[#ffffff]">Three steps to turn signals into self-knowledge.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  title: "Connect",
                  desc: "Add the browser extension and stay logged into Instagram as usual. Waler reads only what you already see — never your password.",
                  icon: Eye
                },
                {
                  step: "02",
                  title: "Notice",
                  desc: "When someone close leaves — unfollows, blocks, disappears — Waler catches it before you do.",
                  icon: BarChart3
                },
                {
                  step: "03",
                  title: "Reflect",
                  desc: "Not just a number. A guided introspection to understand your role in what just changed.",
                  icon: Zap
                }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.6 }}
                  className="text-center text-paper"
                  data-testid={`step-${i}`}
                >
                  <div className="oled-card w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <item.icon className="w-7 h-7 text-[#02c950]" />
                  </div>
                  <div className="text-sm font-bold text-[#02c950] mb-2 tracking-widest">{item.step}</div>
                  <h3 className="text-2xl font-bold mb-3 text-white">{item.title}</h3>
                  <p className="leading-relaxed max-w-xs mx-auto text-[#ffffff]">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-testimonials">
        <div className="max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="text-center mb-16 text-paper">
              <h2 className="text-4xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                What people <span className="text-gradient">say</span>
              </h2>
              <p className="text-lg max-w-2xl mx-auto text-white/70">From people who stopped guessing and started understanding.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  name: "Sarah M.",
                  role: "Content creator · 12.4k followers",
                  text: "I used to refresh my follower count five times a day. Waler told me exactly who left and when — so I could finally stop guessing and just move on.",
                  rating: 5
                },
                {
                  name: "Alex K.",
                  role: "Coach · runs his client list in Pro",
                  text: "The relationship scores changed how I prioritise. I can see at a glance who's actually engaging versus who just followed and went quiet.",
                  rating: 5
                },
                {
                  name: "Emma L.",
                  role: "Photographer",
                  text: "It runs quietly in my browser — I never gave it a password. Two months in and it's caught every unfollow and block I'd otherwise have missed.",
                  rating: 5
                }
              ].map((testimonial, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.6 }}
                  className="oled-card rounded-3xl p-8 flex flex-col"
                  data-testid={`testimonial-${i}`}
                >
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, starIndex) => (
                      <Star key={starIndex} className="w-4 h-4 fill-[#02c950] text-[#02c950]" />
                    ))}
                  </div>
                  <p className="text-gray-300 leading-relaxed mb-6 text-[15px] flex-1">
                    "{testimonial.text}"
                  </p>
                  <div className="flex items-center gap-3 pt-5 border-t border-white/5">
                    <div className="w-11 h-11 rounded-full bg-[#02c950]/12 border border-[#02c950]/30 flex items-center justify-center text-[#02c950] font-bold text-lg shrink-0">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white">{testimonial.name}</div>
                      <div className="text-sm text-gray-400 truncate">{testimonial.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
      {/* Pro Mode Introduction */}
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-pro-intro">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-paper"
          >
            <div className="inline-flex items-center gap-2 bg-[#02c950]/10 backdrop-blur-md border border-[#02c950]/30 rounded-full px-6 py-3 mb-8 shadow-[0_0_30px_rgba(2,201,80,0.15)]">
              <Crown className="w-5 h-5 text-[#02c950]" />
              <span className="text-[#02c950] font-bold tracking-wider text-sm">PRO MODE</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-black mb-8 text-white tracking-tighter leading-tight">
              Turn insights into <br />
              <span className="text-gradient">business growth</span>
            </h2>
            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              Go beyond your own profile. Track a list of contacts, score every relationship, and surface the connections worth your attention — all from one dashboard.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                { value: "0–100", label: "Relationship score per contact" },
                { value: "Multi-account", label: "Profiles from one dashboard" },
                { value: "Real-time", label: "Follower & engagement sync" }
              ].map((stat, i) => (
                <div key={i} className="oled-card rounded-3xl p-6">
                  <div className="text-3xl font-black text-[#02c950] mb-2">{stat.value}</div>
                  <div className="text-gray-400 font-medium text-sm leading-snug">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pro Feature 1: Client Management - Base du système */}
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-pro-clients">
        <div className="max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div className="order-2 lg:order-1">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-[#02c950]/15 blur-[110px] rounded-full" />
                <div className="oled-card relative rounded-[40px] p-8">
                  <div className="space-y-4">
                    {[
                      { name: "Sarah Johnson", followers: "12.5K", score: 92, status: "active" },
                      { name: "Mike Chen", followers: "8.3K", score: 85, status: "active" },
                      { name: "Emma Davis", followers: "15.2K", score: 78, status: "pending" }
                    ].map((client, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-2xl p-4 hover:border-[#02c950]/30 transition-all"
                      >
                        <div className="w-12 h-12 rounded-full bg-[#02c950]/12 border border-[#02c950]/30 flex items-center justify-center text-[#02c950] font-bold">
                          {client.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-white">{client.name}</div>
                          <div className="text-sm text-gray-400">{client.followers} followers</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-white">{client.score}</div>
                          <div className="text-xs text-gray-400">Score</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="order-1 lg:order-2 text-center lg:text-left text-paper">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-8 mx-auto lg:mx-0">
                <Users className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                Manage <span className="text-gradient">multiple clients</span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed mb-6">
                Track unlimited clients and their Instagram circles from one unified dashboard. Monitor engagement, analyze patterns, and build stronger relationships at scale.
              </p>
              <ul className="space-y-3 text-left">
                {["Unlimited client profiles", "Real-time sync", "Automated tracking", "Custom categories"].map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ x: -20, opacity: 0 }}
                    whileInView={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 text-gray-300"
                  >
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-400" />
                    {item}
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pro Feature 2: Relationship Scoring - Analyser les clients */}
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-pro-scoring">
        <div className="max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div className="order-2 lg:order-1">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-[#02c950]/15 blur-[110px] rounded-full" />
                <div className="oled-card relative rounded-[40px] p-8">
                  <div className="text-center mb-6">
                    <div className="text-7xl font-black text-[#02c950] mb-2 drop-shadow-[0_0_24px_rgba(2,201,80,0.45)]">
                      92
                    </div>
                    <div className="text-gray-400 font-medium">Relationship Score</div>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "Engagement", value: 30, max: 30, color: "from-green-400 to-emerald-500" },
                      { label: "Likes Received", value: 18, max: 20, color: "from-green-500 to-emerald-600" },
                      { label: "Connection Streak", value: 20, max: 20, color: "from-emerald-400 to-green-500" },
                      { label: "Seniority", value: 12, max: 15, color: "from-green-300 to-emerald-400" },
                      { label: "Mutual Connections", value: 12, max: 15, color: "from-emerald-500 to-green-600" }
                    ].map((metric, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-300">{metric.label}</span>
                          <span className="text-white font-bold">{metric.value}/{metric.max}</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${(metric.value / metric.max) * 100}%` }}
                            transition={{ delay: i * 0.1 + 0.3, duration: 0.8 }}
                            className={`h-full bg-gradient-to-r ${metric.color} rounded-full`}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="order-1 lg:order-2 text-center lg:text-left text-paper">
              <div className="oled-card w-20 h-20 rounded-3xl flex items-center justify-center mb-8 mx-auto lg:mx-0">
                <Target className="w-10 h-10 text-[#02c950]" />
              </div>
              <h2 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                Precision <span className="text-gradient">relationship scoring</span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed mb-6">
                Every connection gets a clear 0–100 score, built from what's actually measurable: how often they engage, the likes they leave, how long they've stayed, and the followers you share. Know exactly who matters most.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Engagement", Icon: MessageCircle },
                  { label: "Consistency", Icon: Activity },
                  { label: "Seniority", Icon: Clock },
                  { label: "Network", Icon: Link }
                ].map((factor, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="oled-card rounded-2xl p-4 text-center"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#02c950]/10 border border-[#02c950]/20 flex items-center justify-center mx-auto mb-3">
                      <factor.Icon className="w-5 h-5 text-[#02c950]" />
                    </div>
                    <div className="text-sm text-gray-300">{factor.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pro Feature 3: Mutual Connections - Découvrir le réseau */}
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-pro-connections">
        <div className="max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div className="text-center lg:text-left text-paper">
              <div className="oled-card w-20 h-20 rounded-3xl flex items-center justify-center mb-8 mx-auto lg:mx-0">
                <Network className="w-10 h-10 text-[#02c950]" />
              </div>
              <h2 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                Discover <span className="text-gradient">hidden connections</span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed mb-6">
                Waler maps the followers your contacts have in common, so you can see who's connected to whom and which shared contacts are worth an introduction.
              </p>
              <div className="oled-card rounded-3xl p-6 text-left">
                <div className="text-xs text-[#02c950] font-bold mb-2 tracking-widest">EXAMPLE</div>
                <div className="text-white font-medium mb-1">Sarah & Mike share 12 mutual followers</div>
                <div className="text-gray-400 text-sm">Including @john_doe, @emma_wilson, @alex_smith…</div>
              </div>
            </div>
            <div className="order-first lg:order-last">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="relative w-full h-[400px] flex items-center justify-center"
              >
                <div className="absolute inset-0 bg-[#02c950]/12 blur-[120px] rounded-full" />
                {/* Network visualization */}
                <div className="relative w-full h-full">
                  {/* Center node — pastille verte de marque (comme le bouton Login) */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-[#02c950] flex items-center justify-center text-black font-bold text-2xl shadow-[0_0_40px_rgba(2,201,80,0.5)] z-20">
                    You
                  </div>
                  {/* Lignes de connexion statiques */}
                  {[
                    { angle: 0, name: "Client A" },
                    { angle: 120, name: "Client B" },
                    { angle: 240, name: "Client C" }
                  ].map((node, i) => {
                    const radius = 140;
                    const x = Math.cos((node.angle * Math.PI) / 180) * radius;
                    const y = Math.sin((node.angle * Math.PI) / 180) * radius;
                    return (
                      <div key={i}>
                        {/* Ligne de connexion — démarre exactement au centre ("You") et pointe vers le nœud */}
                        <div
                          className="absolute top-1/2 left-1/2 h-[2px] bg-gradient-to-r from-[#02c950]/60 via-[#02c950]/30 to-transparent origin-left z-0"
                          style={{ width: `${radius}px`, transform: `translateY(-50%) rotate(${node.angle}deg)` }}
                        />
                        {/* Nœud client — disque OLED sombre cerclé de vert néon */}
                        <div
                          className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full bg-black/70 backdrop-blur-md border border-[#02c950]/40 flex items-center justify-center text-white font-semibold text-xs shadow-[0_0_24px_rgba(2,201,80,0.18)] z-10"
                          style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                        >
                          {node.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>


      {/* Pro Feature 4: Advanced Analytics */}
      <section className="h-screen snap-start snap-always flex items-center justify-center relative px-6" data-testid="section-pro-analytics">
        <div className="max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div className="text-center lg:text-left text-paper">
              <div className="oled-card w-20 h-20 rounded-3xl flex items-center justify-center mb-8 mx-auto lg:mx-0">
                <TrendingUp className="w-10 h-10 text-[#02c950]" />
              </div>
              <h2 className="text-5xl md:text-6xl font-display font-black mb-6 text-white tracking-tighter">
                Behavioral <span className="text-gradient">analytics</span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed mb-6">
                Waler reads the patterns behind the numbers — like streaks, engagement timing, and follow-then-unfollow moves — and groups each contact into clear behavior types you can act on.
              </p>
              <div className="space-y-3">
                {[
                  { type: "Follows then engages", strength: 100, color: "from-[#02c950] to-[#02c950]/70" },
                  { type: "Consistent liker", strength: 85, color: "from-[#02c950] to-[#02c950]/70" },
                  { type: "Recurring visitor", strength: 78, color: "from-[#02c950] to-[#02c950]/70" }
                ].map((signal, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: -20, opacity: 0 }}
                    whileInView={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="oled-card rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-bold">{signal.type}</span>
                      <span className="text-sm text-gray-400">{signal.strength}/100</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${signal.strength}%` }}
                        transition={{ delay: i * 0.1 + 0.3, duration: 0.8 }}
                        className={`h-full bg-gradient-to-r ${signal.color} rounded-full`}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="order-first lg:order-last">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-[#02c950]/15 blur-[110px] rounded-full" />
                <div className="oled-card relative rounded-[40px] p-8">
                  <div className="text-xs text-[#02c950] font-bold mb-6 tracking-widest">ENGAGEMENT TIMELINE</div>
                  <div className="relative space-y-6">
                    {/* Connecting rail — centré sur les icônes (w-9 = 36px → centre à 18px) */}
                    <div className="absolute left-[18px] top-[18px] bottom-[18px] w-px -translate-x-1/2 bg-gradient-to-b from-[#02c950]/40 via-[#02c950]/20 to-transparent" />
                    {[
                      { day: "Day 1", event: "Followed you", Icon: UserPlus },
                      { day: "Day 2", event: "Liked 3 posts", Icon: Heart },
                      { day: "Day 5", event: "Liked 5 posts", Icon: Flame },
                      { day: "Day 7", event: "Still engaging", Icon: Activity }
                    ].map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        transition={{ delay: i * 0.15 }}
                        className="relative flex items-center gap-4"
                      >
                        <div className="relative z-10 w-9 h-9 rounded-full bg-[#02c950]/12 border border-[#02c950]/30 flex items-center justify-center shrink-0">
                          <item.Icon className="w-4 h-4 text-[#02c950]" />
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-bold">{item.event}</div>
                          <div className="text-sm text-gray-400">{item.day}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="h-screen snap-start snap-always relative overflow-hidden group/features" data-testid="section-features">
                
        {/* Nested snap container */}
        <div className="h-full overflow-y-auto snap-y snap-mandatory relative z-10 scrollbar-hide">
          {[
            {
              icon: Search,
              title: "Notice what matters, when it matters",
              desc: "No more wondering. Waler gently catches every shift in your connections — so you can understand what changed, not just react to it.",
              color: "text-[#02c950]",
              tag: "AWARENESS",
              animation: true
            },
            {
              icon: BarChart3,
              title: "Relationship Insights",
              desc: "Understand patterns in your connections. See who stays, who leaves, and what it reveals about your relationships.",
              color: "text-[#02c950]",
              tag: "INSIGHTS",
              preview: true
            },
            {
              icon: Lock,
              title: "Account Safety",
              desc: "Waler runs in your own browser and never asks for your password or logs into your account. Your data is encrypted, and your account stays untouched — no intrusion, ever.",
              color: "text-[#02c950]",
              tag: "SECURITY"
            }
          ].map((feature, i) => (
            <div key={i} className="h-screen snap-start snap-always flex items-center justify-center px-6">
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.5 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
              >
                {feature.preview ? (
                  <div className="order-2 lg:order-1 flex justify-center lg:justify-start">
                    <AnalyticsPreview />
                  </div>
                ) : feature.animation ? (
                  <div className="order-2 lg:order-1 flex justify-center lg:justify-start">
                    <div className="container relative w-[600px] h-[600px] flex items-center justify-center">
                      {/* Orbites décoratives */}
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        className="absolute w-[350px] h-[350px] border border-white/5 rounded-full pointer-events-none"
                      />
                      <motion.div 
                        animate={{ rotate: -360 }}
                        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                        className="absolute w-[450px] h-[450px] border border-white/5 rounded-full pointer-events-none"
                      />

                      {/* Navigateur desktop avec l'extension Waler */}
                      <div className="relative z-[100]">
                        <BrowserNotification />
                      </div>

                      {/* Profils gravitants */}
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Profile 1 */}
                        <motion.div 
                          animate={{ y: [0, -10, 0] }} 
                          transition={{ duration: 3, repeat: Infinity }}
                          className="absolute top-[5%] right-[4%] w-[60px] h-[60px] rounded-full bg-[#4a4a4a] border-2 border-white/20 flex items-center justify-center text-[24px] text-white z-[110] shadow-xl"
                        ><User className="w-6 h-6 text-[#02c950]" /></motion.div>
                        
                        {/* Profile 2 */}
                        <motion.div 
                          animate={{ y: [0, -10, 0] }} 
                          transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                          className="absolute top-[12%] left-[3%] w-[60px] h-[60px] rounded-full bg-[#4a4a4a] border-2 border-white/20 flex items-center justify-center text-[24px] text-white z-[110] shadow-xl"
                        ><User className="w-6 h-6 text-[#02c950]" /></motion.div>
                        
                        {/* Profile 3 (Disappears) */}
                        <motion.div 
                          key={`profile-disappear-${i}`}
                          initial={{ opacity: 0, scale: 0.05, filter: "blur(10px)" }}
                          whileInView={{ 
                            opacity: [0, 1, 1, 0.6, 0.3, 0], 
                            scale: [0.05, 1, 1, 0.95, 0.7, 0.05],
                            filter: ["blur(10px)", "blur(0px)", "blur(0px)", "blur(2px)", "blur(5px)", "blur(10px)"]
                          }}
                          transition={{ 
                            duration: 10,
                            times: [0, 0.05, 0.3, 0.35, 0.45, 0.55], 
                            repeat: Infinity, 
                            repeatType: "loop"
                          }}
                          className="absolute bottom-[28%] right-[3%] w-[60px] h-[60px] rounded-full bg-[#4a4a4a] border-2 border-white/20 flex items-center justify-center text-[24px] text-white z-[110] shadow-xl"
                        ><User className="w-6 h-6 text-[#02c950]" /></motion.div>
                        
                        {/* Profile 4 */}
                        <motion.div 
                          animate={{ y: [0, -10, 0] }} 
                          transition={{ duration: 3, repeat: Infinity }}
                          className="absolute bottom-[8%] left-[6%] w-[60px] h-[60px] rounded-full bg-[#4a4a4a] border-2 border-white/20 flex items-center justify-center text-[24px] text-white z-[110] shadow-xl"
                        ><User className="w-6 h-6 text-[#02c950]" /></motion.div>

                        {/* Radar Waves from disappearing profile (Profile 3) */}
                        {[0, 1, 2].map((waveIndex) => (
                          <motion.div
                            key={`wave-${i}-${waveIndex}`}
                            initial={{ width: 0, height: 0, opacity: 0 }}
                            whileInView={{ 
                              width: [0, 0, 450],
                              height: [0, 0, 450],
                              opacity: [0, 0.8, 0] 
                            }}
                            transition={{ 
                              delay: 3 + (waveIndex * 0.4), 
                              duration: 2, 
                              ease: "easeOut", 
                              repeat: Infinity, 
                              repeatDelay: 8,
                              times: [0, 0.1, 1]
                            }}
                            className="absolute border-4 border-[#39ff14]/80 rounded-full z-[105] pointer-events-none shadow-[0_0_15px_rgba(57,255,20,0.6)]"
                            style={{
                              bottom: "calc(28% + 30px)",
                              right: "calc(3% + 30px)",
                              transform: "translate(50%, 50%)",
                              transformOrigin: "center"
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : feature.tag === "SECURITY" ? (
                  <div className="order-2 lg:order-1 flex justify-center lg:justify-start">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                      whileInView={{ scale: 1, opacity: 1, rotate: 0 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="relative w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] flex items-center justify-center"
                    >
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-[#02c950]/12 blur-[110px] rounded-full" />
                      <div className="oled-card relative z-10 p-12 rounded-[60px]">
                        <ShieldCheck className="w-32 h-32 lg:w-48 lg:h-48 text-[#02c950] drop-shadow-[0_0_30px_rgba(2,201,80,0.5)]" />
                      </div>
                      
                      {/* Floating particles */}
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            y: [0, -20, 0],
                            opacity: [0.2, 0.5, 0.2]
                          }}
                          transition={{
                            duration: 3 + i,
                            repeat: Infinity,
                            delay: i * 0.5
                          }}
                          className="absolute w-2 h-2 bg-green-400 rounded-full"
                          style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`
                          }}
                        />
                      ))}
                    </motion.div>
                  </div>
                ) : null}

                <div className={`order-1 lg:order-2 text-center lg:text-left text-paper ${(!feature.animation && !feature.preview && feature.tag !== "SECURITY") ? 'lg:col-span-2 lg:text-center' : ''}`}>
                  <div className="flex flex-col items-center lg:items-start">
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className={`oled-card w-20 h-20 rounded-3xl flex items-center justify-center mb-8 ${feature.color}`}
                    >
                      <feature.icon className="w-10 h-10" />
                    </motion.div>
                    <h2 className="text-5xl md:text-7xl font-display font-black mb-8 text-white tracking-tighter leading-tight">
                      {feature.title.split(' ')[0]} <br />
                      <span className="text-gradient">{feature.title.split(' ').slice(1).join(' ')}</span>
                    </h2>
                  </div>
                  <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto lg:mx-0 leading-loose tracking-wide">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      <section className="h-screen snap-start snap-always relative overflow-y-auto scrollbar-hide" data-testid="section-faq">
        <div className="max-w-4xl w-full mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16 text-paper"
          >
            <h2 className="text-4xl md:text-6xl font-display font-black text-white mb-6 tracking-tighter">
              Common <span className="text-gradient">Questions</span>
            </h2>
            <p className="text-xl text-gray-400">Everything you need to know about Waler.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="oled-card rounded-[40px] p-8 md:p-12"
          >
            <Accordion type="single" collapsible className="w-full space-y-4">
              {[
                {
                  q: "Is Waler safe for my account?",
                  a: "Yes. Waler never asks for your Instagram password and never logs into your account. It runs as a secure browser extension on your own device, reading only the information you can already see yourself, and your data is encrypted in transit and at rest."
                },
                {
                  q: "Do I need to provide my login credentials?",
                  a: "Never. You stay logged into Instagram as usual — Waler's extension works inside your own browser and never sees or stores your password."
                },
                {
                  q: "How does the tracking work exactly?",
                  a: "Waler's browser extension reads your follower list while you browse Instagram normally, then compares it over time. That's how it detects exactly who unfollowed you, who followed you, and which accounts were deactivated or deleted — without ever touching your password."
                },
                {
                  q: "Can I track multiple accounts?",
                  a: "Absolutely. Our premium plans allow you to connect and monitor multiple Instagram profiles from a single dashboard."
                },
                {
                  q: "Is it possible to see who viewed my profile?",
                  a: "Instagram doesn't expose a list of profile visitors, and no tool can honestly provide one. Waler focuses on what's real and verifiable: who engages with you, who follows and unfollows you, and how those patterns evolve over time."
                },
                {
                  q: "How often are the stats updated?",
                  a: "We provide real-time tracking. As soon as a change is detected on your profile, your dashboard is updated and notifications are sent."
                },
                {
                  q: "Will the people I track be notified?",
                  a: "No. Waler is a silent monitoring tool. Your tracking activity is completely private and invisible to the accounts you monitor."
                },
                {
                  q: "How fast will I receive a notification after a change occurs?",
                  a: "Notifications are sent as soon as our system detects a change during its regular monitoring cycles. While not always instantaneous due to high demand, we strive to keep you updated as quickly as possible."
                },
                {
                  q: "Is there a free trial available?",
                  a: "Yes! You can connect your account for free to see your current stats. Advanced historical tracking and real-time alerts require a premium subscription."
                }
              ].map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-b border-white/10 last:border-0 pb-2">
                  <AccordionTrigger className="text-xl md:text-2xl font-bold text-white hover:text-[#02c950] transition-colors py-6 text-left hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-lg text-gray-400 leading-relaxed pb-6">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      <section className="min-h-screen snap-start snap-always relative px-6 py-20" data-testid="section-story">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-24 text-paper"
          >
            <h2 className="text-5xl md:text-7xl font-display font-black leading-tight mb-6 text-white tracking-tighter">
              Every follower has a <span className="text-gradient">story</span>
            </h2>
            <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              And every story deserves to be known
            </p>
          </motion.div>

          <div className="space-y-24 mb-32">
            {[
              { icon: Users, title: "You built something real", desc: "Every follower represents a connection. A person who chose to see your content, to be part of your journey.", color: "text-[#02c950]", transition: null },
              { icon: Heart, title: "But relationships change", desc: "Some stay. Some fade away. Some disappear without a trace. And you're left wondering... what happened?", color: "text-[#02c950]", transition: "And then, without warning..." },
              { icon: TrendingDown, title: "The invisible shift", desc: "They unfollow in silence. They block without explanation. Your numbers drop — but behind every number, there's a relationship worth understanding.", color: "text-[#02c950]", transition: "That silence... it means something." },
              { icon: Shield, title: "Until now", desc: "Waler turns that signal into self-knowledge. See exactly who unfollowed, who blocked you, and when it happened — then understand what it means about you.", color: "text-[#02c950]", transition: "But what if you could know?" }
            ].map((beat, index) => (
              <div key={index}>
                {beat.transition && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center text-xl italic text-gray-400 mb-12 font-medium text-paper"
                  >
                    {beat.transition}
                  </motion.p>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 60 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  className="flex flex-col items-center text-center text-paper"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className={`oled-card w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${beat.color}`}
                  >
                    <beat.icon className="w-10 h-10" />
                  </motion.div>
                  <h3 className="text-3xl md:text-4xl font-display font-black mb-4 text-white tracking-tight">
                    {beat.title}
                  </h3>
                  <p className="text-lg md:text-xl text-gray-400 max-w-2xl leading-relaxed">
                    {beat.desc}
                  </p>
                </motion.div>
              </div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="text-paper">
              <h2 className="text-4xl md:text-6xl font-display font-black mb-8 text-white tracking-tighter">
                Ready to understand <span className="text-gradient">yourself better</span>?
              </h2>
              <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                Join thousands of people who chose reflection over reaction.
              </p>
            </div>
            <div className="flex items-center justify-center mb-16">
              <button 
                onClick={() => navigate("/onboard")}
                className="text-lg px-10 py-5 rounded-full transition-all duration-300 bg-[#02c950]/20 backdrop-blur-md border border-white/20 hover:shadow-[0_0_30px_rgba(2,201,80,0.5)] hover:bg-[#02c950]/30 font-bold text-white inline-flex items-center gap-3"
                data-testid="button-cta-start-tracking"
              >
                Begin Your Journey <ArrowRight className="w-6 h-6" />
              </button>
            </div>
            <footer className="border-t border-white/10 pt-8 mt-16">
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-6">
                <a href="https://instagram.com/waler.web" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  @waler.web
                </a>
                <a href="mailto:walerwebsite@outlook.com" className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  walerwebsite@outlook.com
                </a>
                <a href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </a>
                <a href="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </a>
                <a href="/legal" className="text-gray-400 hover:text-white transition-colors">
                  Legal Notice
                </a>
                <a href="/cookies" className="text-gray-400 hover:text-white transition-colors">
                  Cookies
                </a>
              </div>
              <div className="text-sm text-gray-500 text-center">
                &copy; {new Date().getFullYear()} Waler Analytics. All rights reserved.
              </div>
            </footer>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
