import { ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS, rotaPlatoonLabel, rotaSectionLabel } from "@/lib/personnel-catalog";

export type RotaPlatoon = (typeof ROTA_PLATOON_OPTIONS)[number];
export type RotaSection = (typeof ROTA_SECTION_OPTIONS)[number];

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

export function rotaUnitCompactLabel(
  platoon: number | null | undefined,
  section: number | null | undefined,
) {
  if (!platoon && !section) return "";
  const parts: string[] = [];
  if (platoon) parts.push(rotaPlatoonLabel(platoon));
  if (section) parts.push(rotaSectionLabel(section));
  return parts.join(" / ");
}
