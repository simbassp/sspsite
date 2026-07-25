export type UnitAssignment =
  | "platoon_1"
  | "platoon_2"
  | "platoon_3"
  | "company_4"
  | "staff"
  | "office"
  | "observation"
  | "vohr"
  | "fpv"
  | "eger"
  | "preparation"
  | "vpv"
  | "uik";

export const UNIT_ASSIGNMENT_OPTIONS: UnitAssignment[] = [
  "platoon_1",
  "platoon_2",
  "platoon_3",
  "company_4",
  "staff",
  "office",
  "observation",
  "vohr",
  "fpv",
  "eger",
  "preparation",
  "vpv",
  "uik",
];

export const unitAssignmentLabel: Record<UnitAssignment, string> = {
  platoon_1: "В1",
  platoon_2: "В2",
  platoon_3: "В3",
  company_4: "4р",
  staff: "Ш",
  office: "К",
  observation: "Н",
  vohr: "ВО",
  fpv: "Ф",
  eger: "Е",
  preparation: "П",
  vpv: "В",
  uik: "У",
};

const VALID = new Set<string>(UNIT_ASSIGNMENT_OPTIONS);

export function normalizeUnitAssignment(raw: unknown): UnitAssignment | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s || !VALID.has(s)) return null;
  return s as UnitAssignment;
}

export function unitAssignmentLabelOrEmpty(value: UnitAssignment | null | undefined) {
  if (!value) return "Не указан";
  return unitAssignmentLabel[value];
}

export type UnitAssignmentFilter = "all" | "unset" | UnitAssignment;

export function matchesUnitFilter(filter: UnitAssignmentFilter, unit: UnitAssignment | null | undefined) {
  if (filter === "all") return true;
  if (filter === "unset") return !unit;
  return unit === filter;
}

export function normalizeBroadcastUnitFilter(raw: unknown): UnitAssignmentFilter {
  if (raw === null || raw === undefined || raw === "" || raw === "all") return "all";
  if (raw === "unset" || raw === "none" || raw === "not_set") return "unset";
  const unit = normalizeUnitAssignment(raw);
  return unit ?? "all";
}

export function broadcastUnitFilterLabel(filter: UnitAssignmentFilter): string {
  if (filter === "all") return "всем пользователям";
  if (filter === "unset") return "без указанного подразделения";
  return unitAssignmentLabel[filter];
}

export type RotaPlatoonFilter = "all" | "1" | "2";
export type RotaSectionFilter = "all" | "1" | "2" | "3" | "4";

export function matchesResultsUnitFilter(
  unitFilter: UnitAssignmentFilter,
  platoon: RotaPlatoonFilter,
  section: RotaSectionFilter,
  row: {
    unitAssignment?: UnitAssignment | null;
    rotaPlatoon?: number | null;
    rotaSection?: number | null;
  },
) {
  if (!matchesUnitFilter(unitFilter, row.unitAssignment)) return false;
  if (unitFilter !== "company_4") return true;
  if (platoon !== "all" && row.rotaPlatoon !== Number(platoon)) return false;
  if (section !== "all" && row.rotaSection !== Number(section)) return false;
  return true;
}

export function formatUnitAssignmentSaveError(raw: string | undefined) {
  const message = (raw ?? "").trim();
  const lower = message.toLowerCase();
  if (
    lower.includes("app_users_unit_assignment_check") ||
    (lower.includes("check constraint") && lower.includes("unit_assignment")) ||
    lower.includes("violates check constraint")
  ) {
    return "Не удалось сохранить: в базе ещё не добавлены новые подразделения. В Supabase выполните SQL-миграцию (файл 20260722120000_user_unit_assignment_extended.sql).";
  }
  if (message === "invalid_unit_assignment") {
    return "Некорректное подразделение.";
  }
  if (message === "not_found") {
    return "Профиль не найден. Выйдите и войдите снова.";
  }
  return message || "Не удалось сохранить подразделение.";
}
