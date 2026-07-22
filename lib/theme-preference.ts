export const THEME_COOKIE = "ssp-theme";

export type ThemePreference = "dark" | "light";

export function normalizeThemePreference(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "dark";
}

export const THEME_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;
