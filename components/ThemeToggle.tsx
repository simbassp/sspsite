"use client";

import { useEffect, useState } from "react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_SEC, type ThemePreference } from "@/lib/theme-preference";

type Theme = ThemePreference;

const iconSvgProps = {
  viewBox: "0 0 24 24" as const,
  width: 22,
  height: 22,
  stroke: "currentColor" as const,
  fill: "none" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function MoonIcon() {
  return (
    <svg {...iconSvgProps} aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...iconSvgProps} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function readThemeCookie(): Theme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )ssp-theme=(dark|light)(?:;|$)/);
  return match?.[1] === "light" || match?.[1] === "dark" ? match[1] : null;
}

function persistTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  window.localStorage.setItem(THEME_COOKIE, next);
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const fromCookie = readThemeCookie();
  if (fromCookie) return fromCookie;
  const saved = window.localStorage.getItem(THEME_COOKIE);
  if (saved === "dark" || saved === "light") return saved;
  return "dark";
}

export type ThemeToggleProps = {
  /** На мобильной шапке — только иконка */
  showLabels?: boolean;
  /** SVG вместо эмодзи */
  preferSvgIcon?: boolean;
};

export function ThemeToggle({ showLabels = true, preferSvgIcon = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const next = readTheme();
    setTheme(next);
    persistTheme(next);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    persistTheme(theme);
  }, [isHydrated, theme]);

  const onToggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persistTheme(next);
  };

  return (
    <button type="button" onClick={onToggle} className="btn theme-toggle-btn" aria-label="Переключить тему">
      {preferSvgIcon ? (
        <span className="theme-toggle-icon-svg" aria-hidden="true">
          {!isHydrated ? <MoonIcon /> : theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </span>
      ) : (
        <span className="theme-toggle-icon" aria-hidden="true">
          {isHydrated ? (theme === "dark" ? "🌙" : "☀️") : "🌓"}
        </span>
      )}
      {showLabels && (
        <span className="theme-toggle-text">
          {isHydrated ? (theme === "dark" ? "Тёмная" : "Светлая") : "Тема"}
        </span>
      )}
    </button>
  );
}
