import type { Position } from "@/lib/types";

export const POSITION_OPTIONS: readonly Position[] = [
  "Стажер",
  "Младший специалист",
  "Специалист",
  "Ведущий специалист",
  "Главный специалист",
  "Командир взвода",
  "Командир 4 роты",
] as const;

const POSITION_DISPLAY_LABEL: Record<string, string> = {
  стажер: "СТ",
  "младший специалист": "МС",
  специалист: "С",
  "ведущий специалист": "ВС",
  "главный специалист": "ГС",
};

/** Короткая подпись должности для UI (в БД хранится полное название). */
export function positionDisplayLabel(position: string): string {
  const key = position.trim().toLowerCase();
  return POSITION_DISPLAY_LABEL[key] ?? (position.trim() || "—");
}

/** Классы совпадают с `.admin-users-position-badge` в `globals.css`. */
export function getPositionBadgeClass(position: string): string {
  const normalized = position.trim().toLowerCase();
  if (normalized === "стажер") return "is-trainee";
  if (normalized === "младший специалист") return "is-junior";
  if (normalized === "специалист") return "is-specialist";
  if (normalized === "ведущий специалист") return "is-lead";
  if (normalized === "главный специалист") return "is-chief";
  if (normalized === "командир взвода") return "is-commander";
  if (normalized === "командир 4 роты") return "is-rota-commander";
  return "is-default";
}
