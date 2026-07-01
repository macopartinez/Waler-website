import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useVerification } from "@/hooks/use-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadarBackground } from "@/components/RadarBackground";
import { GlassText } from "@/components/GlassText";
import { motion } from "framer-motion";
import { Copy, Check, Instagram, Loader2, ArrowRight, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Verification() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  
  const [verificationCode, setVerificationCode] = useState("");
  const [username, setUsername] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [step, setStep] = useState<"send" | "verify">("send");
  const [userToken, setUserToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const { generateCodeAsync, verifyCode, resendCodeAsync, isVerifying, isResending } = useVerification(user?.id || null);

  // Rediriger si déjà vérifié
  useEffect(() => {
    if (!authLoading && user) {
      if (user.isVerified) {
        navigate(`/dashboard/${user.id}`);
      } else {
        // Générer le code au chargement
        generateCodeAsync().then((data) => {
          setVerificationCode(data.verificationCode);
          setUsername(data.username);
          setExpiresAt(new Date(data.expiresAt));
        });
      }
    }
  }, [user, authLoading, navigate]);

  // Timer d'expiration
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(Math.floor(diff / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(verificationCode);
    setCopied(true);
    toast({
      title: t.verification.toastCopiedTitle,
      description: t.verification.toastCopiedDesc,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openMessenger = () => {
    window.open("https://www.instagram.com/direct/inbox/", "_blank");
  };

  const handleVerify = () => {
    if (!user || userToken.length !== 6) return;
    
    verifyCode(
      { userId: user.id, code: userToken },
      {
        onSuccess: () => {
          setTimeout(() => {
            navigate(`/dashboard/${user.id}`);
          }, 1500);
        },
      }
    );
  };

  const handleResend = async () => {
    const data = await resendCodeAsync();
    setVerificationCode(data.verificationCode);
    setUsername(data.username);
    setExpiresAt(new Date(data.expiresAt));
    setStep("send");
    setUserToken("");
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setUserToken(value);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#02c950]" />
      </div>
    );
  }

  const PlatformIcon = Instagram;
  const platformName = "Instagram";

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-body text-white relative overflow-hidden">
      <RadarBackground />

      {/* Navbar */}
      <nav className="fixed w-full top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <GlassText text="WALER" fontSize={32} />
          <LanguageSwitcher />
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen pt-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl border border-white/10 p-8 backdrop-blur-xl bg-white/5">
            {step === "send" ? (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-full bg-[#02c950]/20 flex items-center justify-center mx-auto mb-4">
                    <PlatformIcon className="w-8 h-8 text-[#02c950]" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2">{t.verification.title}</h1>
                  <p className="text-gray-400">
                    {t.verification.sendCodeTo} <span className="text-[#02c950]">@waler_official</span> {t.verification.fromAccount}{" "}
                    <span className="font-bold text-white">@{username}</span>
                  </p>
                </div>

                {/* Code à copier */}
                <div className="mb-6">
                  <div className="relative">
                    <div className="bg-white/10 rounded-xl p-4 border border-white/20 font-mono text-center text-lg">
                      {verificationCode || t.verification.loading}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-[#02c950]" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Avertissement */}
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-2 text-sm text-green-200">
                    <AlertTriangle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p>
                      <strong>{t.verification.important}</strong> {t.verification.mustSendFrom}{" "}
                      <strong>@{username}</strong>{t.verification.otherwiseFail}
                    </p>
                  </div>
                </div>

                {/* Timer */}
                {timeLeft > 0 && (
                  <div className="text-center mb-6">
                    <p className="text-sm text-gray-400">
                      {t.verification.codeExpiresIn}{" "}
                      <span className="font-mono text-[#02c950] font-bold">{formatTime(timeLeft)}</span>
                    </p>
                  </div>
                )}

                {/* Boutons */}
                <div className="space-y-3">
                  <a
                    href="https://www.instagram.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl flex items-center justify-center"
                  >
                    <Instagram className="w-5 h-5 mr-2" />
                    {t.verification.openInstagram}
                  </a>

                  <Button
                    onClick={() => setStep("verify")}
                    className="w-full h-12 bg-[#02c950] hover:bg-[#02c950]/90 text-black font-bold rounded-xl"
                  >
                    {t.verification.sentMessage}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-full bg-[#02c950]/20 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-[#02c950]" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2">{t.verification.enterCode}</h1>
                  <p className="text-gray-400">
                    {t.verification.repliedWithCode}
                  </p>
                </div>

                {/* Input code */}
                <div className="mb-6">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={userToken}
                    onChange={handleTokenChange}
                    placeholder="000000"
                    className="h-16 text-center text-2xl font-mono tracking-widest bg-white/10 border-white/20 rounded-xl"
                    maxLength={6}
                    autoFocus
                  />
                </div>

                {/* Boutons */}
                <div className="space-y-3">
                  <Button
                    onClick={handleVerify}
                    disabled={userToken.length !== 6 || isVerifying}
                    className="w-full h-12 bg-[#02c950] hover:bg-[#02c950]/90 text-black font-bold rounded-xl disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {t.verification.verifying}
                      </>
                    ) : (
                      t.verification.verify
                    )}
                  </Button>

                  <Button
                    onClick={handleResend}
                    disabled={isResending}
                    variant="outline"
                    className="w-full h-12 border-white/20 hover:bg-white/10 rounded-xl"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {t.verification.sending}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5 mr-2" />
                        {t.verification.resend}
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => setStep("send")}
                    variant="ghost"
                    className="w-full text-gray-400 hover:text-white"
                  >
                    {t.verification.back}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Aide */}
          <div className="mt-6 text-center text-sm text-gray-500">
            {t.verification.needHelp}{" "}
            <a href="https://instagram.com/waler_official" className="text-[#02c950] hover:underline">
              @waler_official
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
