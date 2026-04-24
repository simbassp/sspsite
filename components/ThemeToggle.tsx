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
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const onToggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("ssp-theme", next);
  };

  return (
    <button type="button" onClick={onToggle} className="btn">
      {theme === "dark" ? "🌙 Тёмная" : "☀️ Светлая"}
    </button>
  );
}
