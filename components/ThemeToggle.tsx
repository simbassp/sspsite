"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("ssp-theme");
  if (saved === "dark" || saved === "light") return saved;
  return "dark";
}

export function ThemeToggle() {
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
      <span className="theme-toggle-icon" aria-hidden="true">
        {isHydrated ? (theme === "dark" ? "🌙" : "☀️") : "🌓"}
      </span>
      <span className="theme-toggle-text">{isHydrated ? (theme === "dark" ? "Тёмная" : "Светлая") : "Тема"}</span>
    </button>
  );
}
