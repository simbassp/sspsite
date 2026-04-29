import type { Position } from "@/lib/types";

export const POSITION_OPTIONS: readonly Position[] = [
  "Младший специалист",
  "Специалист",
  "Ведущий специалист",
  "Главный специалист",
  "Командир взвода",
] as const;

/** Классы совпадают с `.admin-users-position-badge` в `globals.css`. */
export function getPositionBadgeClass(position: string): string {
  const normalized = position.trim().toLowerCase();
  if (normalized === "младший специалист") return "is-junior";
  if (normalized === "специалист") return "is-specialist";
  if (normalized === "ведущий специалист") return "is-lead";
  if (normalized === "главный специалист") return "is-chief";
  if (normalized === "командир взвода") return "is-commander";
  return "is-default";
}
