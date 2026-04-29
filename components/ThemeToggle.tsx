"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

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

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("ssp-theme");
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
    document.documentElement.setAttribute("data-theme", next);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [isHydrated, theme]);

  const onToggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("ssp-theme", next);
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
