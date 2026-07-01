import { useLanguage } from "@/contexts/LanguageContext";

interface LanguageSwitcherProps {
  /** Use light styling for pages with a white/light background (legal pages). */
  variant?: "dark" | "light";
  className?: string;
}

/**
 * Compact EN/FR pill toggle. Rendered on every page (via NavBar for app/marketing
 * pages, standalone on pages that don't use the shared NavBar shell).
 */
export function LanguageSwitcher({ variant = "dark", className = "" }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();

  const isDark = variant === "dark";

  return (
    <div
      role="group"
      aria-label={t.common.languageSwitcher.label}
      className={`inline-flex items-center rounded-full p-0.5 border shrink-0 ${
        isDark ? "bg-white/5 border-white/10" : "bg-gray-100 border-gray-200"
      } ${className}`}
      data-testid="language-switcher"
    >
      {(["en", "fr"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={language === lang}
          data-testid={`button-language-${lang}`}
          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
            language === lang
              ? "bg-[#02c950] text-black"
              : isDark
              ? "text-gray-400 hover:text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
