export type UnitAssignment =
  | "platoon_1"
  | "platoon_2"
  | "platoon_3"
  | "company_4"
  | "staff"
  | "office";

export const UNIT_ASSIGNMENT_OPTIONS: UnitAssignment[] = [
  "platoon_1",
  "platoon_2",
  "platoon_3",
  "company_4",
  "staff",
  "office",
];

export const unitAssignmentLabel: Record<UnitAssignment, string> = {
  platoon_1: "1 взвод",
  platoon_2: "2 взвод",
  platoon_3: "3 взвод",
  company_4: "4 рота",
  staff: "Штаб",
  office: "Канцелярия",
};

/** Командиры подразделений для блока на главной. */
export const UNIT_COMMANDERS: Array<{ unit: UnitAssignment; commander: string }> = [
  { unit: "platoon_1", commander: "Валерий Шах" },
  { unit: "platoon_2", commander: "Максим Ермак" },
  { unit: "platoon_3", commander: "Рафаэл Будулай" },
  { unit: "company_4", commander: "Владислав Клиган" },
];

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
