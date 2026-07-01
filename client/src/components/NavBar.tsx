import { ReactNode } from "react";
import { useLocation } from "wouter";
import { GlassText } from "@/components/GlassText";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface NavBarProps {
  /** Logo size in px (36 on marketing pages, 32 on app pages). */
  logoSize?: number;
  /** Optional centered cluster (e.g. the dashboard mode switcher). Sits in the
   *  normal flex flow on mobile and is absolutely centered from `md` up. */
  center?: ReactNode;
  /** Right-aligned actions (CTAs, account switcher, logout…). */
  actions?: ReactNode;
}

/**
 * Shared top navigation shell.
 *
 * Replaces the per-page `position:absolute; left:15px` inline hacks that broke
 * on narrow screens: the logo, the optional center cluster and the actions live
 * in a single responsive flex row so they shrink instead of overlapping.
 */
export function NavBar({ logoSize = 32, center, actions }: NavBarProps) {
  const [, navigate] = useLocation();

  return (
    <nav className="fixed w-full top-0 z-50 bg-transparent">
      <div className="relative w-full px-4 sm:px-6 h-20 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate("/")}
          className="shrink-0"
          aria-label="Waler home"
          data-testid="link-home"
        >
          <GlassText text="WALER" fontSize={logoSize} />
        </button>

        {center && (
          <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
            {center}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LanguageSwitcher />
          {actions}
        </div>
      </div>
    </nav>
  );
}
