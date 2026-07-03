import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock } from "lucide-react";

interface ConnectDialogProps {
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export function ConnectDialog({ isOpen: controlledOpen, setIsOpen: setControlledOpen }: ConnectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoggingIn } = useAuth();
  const { t } = useLanguage();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    login(
      { email, password },
      {
        onSuccess: () => {
          setIsOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl border border-[#02c950]/30 shadow-[0_0_50px_rgba(2,201,80,0.1)] bg-black backdrop-blur-xl text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-white">{t.common.connectDialog.title}</DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            {t.common.connectDialog.subtitle}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleLogin} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-300">{t.common.connectDialog.emailLabel}</Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.common.connectDialog.emailPlaceholder}
                className="pl-10 rounded-xl border-white/10 h-12 bg-white/5 text-white placeholder:text-gray-600 focus:ring-[#02c950]/20 focus:border-[#02c950] transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-300">{t.common.connectDialog.passwordLabel}</Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 rounded-xl border-white/10 h-12 bg-white/5 text-white placeholder:text-gray-600 focus:ring-[#02c950]/20 focus:border-[#02c950] transition-all"
                required
                minLength={6}
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl text-base font-semibold bg-[#02c950] hover:bg-[#02c950]/90 text-black transition-all shadow-[0_0_20px_rgba(2,201,80,0.4)]"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t.common.connectDialog.loggingIn}
              </span>
            ) : (
              t.common.connectDialog.loginButton
            )}
          </Button>
        </form>

        <div className="text-center text-xs text-gray-500 mt-4">
          {t.common.connectDialog.noAccount} <a href="/onboard" className="text-[#02c950] hover:underline">{t.common.connectDialog.signUp}</a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
