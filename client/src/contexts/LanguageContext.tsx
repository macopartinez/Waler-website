import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import type { Translations } from "@/lib/i18n/en";

export type Language = "en" | "fr";

const dictionaries: Record<Language, Translations> = { en, fr };

const STORAGE_KEY = "waler_language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "fr") return stored;
  const browserLang = window.navigator.language?.toLowerCase() ?? "";
  return browserLang.startsWith("fr") ? "fr" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);
  const toggleLanguage = () => setLanguageState((prev) => (prev === "en" ? "fr" : "en"));

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, toggleLanguage, t: dictionaries[language] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

/** Replaces `{{key}}` placeholders in a translated string with the given values. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (str, [key, value]) => str.replace(new RegExp(`{{${key}}}`, "g"), String(value)),
    template
  );
}
