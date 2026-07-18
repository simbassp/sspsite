import { ROTA_MODULE_OPTIONS, ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS } from "@/lib/personnel-catalog";

export type RotaPlatoon = (typeof ROTA_PLATOON_OPTIONS)[number];
export type RotaSection = (typeof ROTA_SECTION_OPTIONS)[number];
export type RotaModule = (typeof ROTA_MODULE_OPTIONS)[number];

export function normalizeRotaPlatoon(value: unknown): RotaPlatoon | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return ROTA_PLATOON_OPTIONS.includes(n as RotaPlatoon) ? (n as RotaPlatoon) : null;
}

export function normalizeRotaSection(value: unknown): RotaSection | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return ROTA_SECTION_OPTIONS.includes(n as RotaSection) ? (n as RotaSection) : null;
}

export function normalizeRotaModule(value: unknown): RotaModule | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return ROTA_MODULE_OPTIONS.includes(n as RotaModule) ? (n as RotaModule) : null;
}

export function rotaUnitCompactLabel(
  platoon: number | null | undefined,
  section: number | null | undefined,
  module: number | null | undefined = null,
) {
  if (!platoon && !section && !module) return "";
  const parts: string[] = [];
  if (platoon) parts.push(`${platoon} взвод`);
  if (section) parts.push(`${section} отделение`);
  if (module) parts.push(`${module} мод.`);
  return parts.join(" / ");
}
