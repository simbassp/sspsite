export const PROFILE_NAME_COLOR_PRESETS = [
  { id: "default", label: "Обычный", sample: "А" },
  { id: "green", label: "Зелёный", sample: "А" },
  { id: "blue", label: "Синий", sample: "А" },
  { id: "gold", label: "Золотой", sample: "А" },
  { id: "crimson", label: "Красный", sample: "А" },
  { id: "violet", label: "Фиолетовый", sample: "А" },
  { id: "cyan", label: "Бирюза", sample: "А" },
  { id: "gradient-aurora", label: "Аврора", sample: "А" },
  { id: "gradient-gold", label: "Золотой перелив", sample: "А" },
  { id: "gradient-ocean", label: "Океан", sample: "А" },
] as const;

export type ProfileNameColorId = (typeof PROFILE_NAME_COLOR_PRESETS)[number]["id"];

const VALID_IDS = new Set<string>(PROFILE_NAME_COLOR_PRESETS.map((item) => item.id));

export function normalizeProfileNameColor(raw: unknown): ProfileNameColorId | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || value === "default") return null;
  return VALID_IDS.has(value) ? (value as ProfileNameColorId) : null;
}

export function profileNameColorClass(color: ProfileNameColorId | null | undefined): string {
  if (!color || color === "default") return "";
  return `profile-name-color profile-name-color--${color}`;
}

export function profileNameColorStorageValue(color: ProfileNameColorId | null): string | null {
  if (!color || color === "default") return null;
  return color;
}
