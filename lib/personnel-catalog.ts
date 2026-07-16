export const PERSONNEL_EXAM_TYPES = ["ttx", "medicine", "verification", "physical", "shooting"] as const;
export type PersonnelExamType = (typeof PERSONNEL_EXAM_TYPES)[number];

export const personnelExamLabel: Record<PersonnelExamType, string> = {
  ttx: "ТТХ",
  medicine: "Медицина",
  verification: "Верификация ЗУ",
  physical: "Физо",
  shooting: "Стрельба",
};

export const PERSONNEL_LICENSE_CATEGORIES = ["B", "C", "CE"] as const;
export type PersonnelLicenseCategory = (typeof PERSONNEL_LICENSE_CATEGORIES)[number];

export const PERSONNEL_MEDAL_PRESETS = [
  { type: "medal_1", title: "Медаль 1" },
  { type: "medal_2", title: "Медаль 2" },
  { type: "medal_3", title: "Медаль 3" },
] as const;

export const PERSONNEL_REQUEST_TYPES = ["medal", "premium", "deployment", "exam"] as const;
export type PersonnelRequestType = (typeof PERSONNEL_REQUEST_TYPES)[number];

export const personnelRequestTypeLabel: Record<PersonnelRequestType, string> = {
  medal: "Медаль",
  premium: "Премия",
  deployment: "Командировка",
  exam: "Зачёт",
};

export const ROTA_PLATOON_OPTIONS = [1, 2] as const;
export const ROTA_SECTION_OPTIONS = [1, 2, 3, 4] as const;

export function rotaUnitLabel(platoon: number | null | undefined, section: number | null | undefined) {
  if (!platoon && !section) return "—";
  const p = platoon ? `${platoon} взвод` : "—";
  const s = section ? `${section} отделение` : "—";
  if (platoon && section) return `${p} / ${s}`;
  return platoon ? p : s;
}
