export const PERSONNEL_EXAM_TYPES = ["ttx", "medicine", "verification", "physical", "shooting"] as const;
export type PersonnelExamType = (typeof PERSONNEL_EXAM_TYPES)[number];

export const personnelExamLabel: Record<PersonnelExamType, string> = {
  ttx: "ТТХ",
  medicine: "Медицина",
  verification: "Верификация ЗУ",
  physical: "Физо",
  shooting: "Стрельба",
};

export const PERSONNEL_LICENSE_CATEGORIES = ["M", "A", "B", "C", "D"] as const;
export type PersonnelLicenseCategory = (typeof PERSONNEL_LICENSE_CATEGORIES)[number];

export function isPersonnelLicenseCategory(value: unknown): value is PersonnelLicenseCategory {
  return typeof value === "string" && (PERSONNEL_LICENSE_CATEGORIES as readonly string[]).includes(value);
}

export function normalizePersonnelLicenseCategories(values: unknown): PersonnelLicenseCategory[] {
  if (!Array.isArray(values)) return [];
  return values.filter(isPersonnelLicenseCategory);
}

export const PERSONNEL_MEDAL_SVO_TYPE = "svo_victory_contribution" as const;

export const PERSONNEL_MEDAL_PRESETS = [
  {
    type: PERSONNEL_MEDAL_SVO_TYPE,
    title: "За вклад в победу спецоперации",
    shortTitle: "За вклад в победу СВО",
  },
] as const;

export type PersonnelMedalPresetType = (typeof PERSONNEL_MEDAL_PRESETS)[number]["type"];

export function isSvoContributionMedal(medalType?: string | null, title?: string | null) {
  if (medalType === PERSONNEL_MEDAL_SVO_TYPE) return true;
  const t = (title ?? "").toLowerCase();
  return t.includes("спецопера") || t.includes("вклад в победу");
}

export function getMedalDisplayTitle(medalType?: string | null, title?: string | null) {
  const preset = PERSONNEL_MEDAL_PRESETS.find((m) => m.type === medalType);
  if (preset) return preset.title;
  return title?.trim() || "Медаль";
}

export function getMedalShortTitle(medalType?: string | null, title?: string | null) {
  const preset = PERSONNEL_MEDAL_PRESETS.find((m) => m.type === medalType);
  if (preset) return preset.shortTitle;
  const full = getMedalDisplayTitle(medalType, title);
  return full.length > 32 ? `${full.slice(0, 32)}…` : full;
}

export const PERSONNEL_REQUEST_TYPES = ["medal", "premium", "deployment", "exam"] as const;
export type PersonnelRequestType = (typeof PERSONNEL_REQUEST_TYPES)[number];

/** Отдельная премия для корректировки итога в сводке командировок (редактируют админ/модератор). */
export const PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE = "Доп. премия за сбитие";

/** Заголовок премии из командировки при отображении во вкладке «Премии». */
export const PERSONNEL_DEPLOYMENT_PREMIUM_TITLE = "Премия за сбитие";

export const personnelRequestTypeLabel: Record<PersonnelRequestType, string> = {
  medal: "Медаль",
  premium: "Премия",
  deployment: "Командировка",
  exam: "Зачёт",
};

export const personnelExamStatusLabel: Record<"passed" | "failed", string> = {
  passed: "Сдан",
  failed: "Не сдан",
};

function payloadStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function payloadMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

function payloadDate(value: unknown): string {
  const raw = payloadStr(value);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("ru-RU");
}

function examTypeLabel(examType: unknown): string {
  const key = payloadStr(examType) as PersonnelExamType;
  return personnelExamLabel[key] ?? key.toUpperCase();
}

function medalTitle(payload: Record<string, unknown>): string {
  const custom = payloadStr(payload.title);
  if (custom) return custom;
  const preset = PERSONNEL_MEDAL_PRESETS.find((m) => m.type === payloadStr(payload.medalType));
  return preset?.title ?? "Медаль";
}

export function formatPersonnelRequestSummary(
  requestType: PersonnelRequestType,
  payload: Record<string, unknown>,
): string {
  if (requestType === "exam") {
    const exam = examTypeLabel(payload.examType);
    const status =
      payload.status === "failed" ? personnelExamStatusLabel.failed : personnelExamStatusLabel.passed;
    const date = payloadDate(payload.passedAt);
    return date ? `${exam}, ${status.toLowerCase()} (${date})` : `${exam}, ${status.toLowerCase()}`;
  }
  if (requestType === "premium") {
    const title = payloadStr(payload.title) || "Премия за сбитие";
    const amount = payloadMoney(payload.amount);
    const date = payloadDate(payload.awardedAt);
    return date ? `${title} — ${amount} (${date})` : `${title} — ${amount}`;
  }
  if (requestType === "deployment") {
    const from = payloadDate(payload.dateFrom);
    const to = payloadDate(payload.dateTo);
    const hits = Number(payload.uavHits ?? 0);
    const premium = payloadMoney(payload.premiumAmount);
    const period = from && to ? `${from} — ${to}` : "—";
    return `${period}, ${hits} сбитий, ${premium}`;
  }
  if (requestType === "medal") {
    const title = medalTitle(payload);
    const date = payloadDate(payload.awardedAt);
    return date ? `${title} (${date})` : title;
  }
  return "";
}

export function formatPersonnelRequestDetails(
  requestType: PersonnelRequestType,
  payload: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  if (requestType === "exam") {
    const rows: Array<{ label: string; value: string }> = [
      { label: "Зачёт", value: examTypeLabel(payload.examType) },
      {
        label: "Статус",
        value:
          payload.status === "failed" ? personnelExamStatusLabel.failed : personnelExamStatusLabel.passed,
      },
    ];
    const date = payloadDate(payload.passedAt);
    if (date) rows.push({ label: "Дата", value: date });
    return rows;
  }
  if (requestType === "premium") {
    const rows: Array<{ label: string; value: string }> = [
      { label: "За что", value: payloadStr(payload.title) || "—" },
      { label: "Премия", value: payloadMoney(payload.amount) },
    ];
    const date = payloadDate(payload.awardedAt);
    if (date) rows.push({ label: "Дата", value: date });
    return rows;
  }
  if (requestType === "deployment") {
    const from = payloadDate(payload.dateFrom);
    const to = payloadDate(payload.dateTo);
    return [
      { label: "Период", value: from && to ? `${from} — ${to}` : "—" },
      { label: "Сбитий БПЛА", value: String(Number(payload.uavHits ?? 0)) },
      { label: "Премия", value: payloadMoney(payload.premiumAmount) },
    ];
  }
  if (requestType === "medal") {
    const rows: Array<{ label: string; value: string }> = [{ label: "Медаль", value: medalTitle(payload) }];
    const date = payloadDate(payload.awardedAt);
    if (date) rows.push({ label: "Дата", value: date });
    return rows;
  }
  return [];
}

export function formatPersonnelRequestNotificationBody(
  requestType: PersonnelRequestType,
  payload: Record<string, unknown>,
): string {
  const typeLabel = personnelRequestTypeLabel[requestType];
  const summary = formatPersonnelRequestSummary(requestType, payload);
  return summary ? `${typeLabel}: ${summary}` : typeLabel;
}

/** Старые уведомления хранили «Тип: exam» — приводим к понятному виду. */
export function formatNotificationBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  const legacy = /^Тип:\s*(\w+)\s*$/i.exec(trimmed);
  if (legacy) {
    const type = legacy[1] as PersonnelRequestType;
    return personnelRequestTypeLabel[type] ?? legacy[1];
  }
  return trimmed;
}

export const ROTA_PLATOON_OPTIONS = [1, 2] as const;
export const ROTA_SECTION_OPTIONS = [1, 2, 3, 4] as const;

export function rotaUnitLabel(platoon: number | null | undefined, section: number | null | undefined) {
  if (!platoon && !section) return "—";
  const p = platoon ? `${platoon} взвод` : "—";
  const s = section ? `${section} отделение` : "—";
  if (platoon && section) return `${p} / ${s}`;
  return platoon ? p : s;
}

/** Компактная подпись для таблицы ростера: 2В/1О */
export function rotaUnitLabelCompact(platoon: number | null | undefined, section: number | null | undefined) {
  if (!platoon && !section) return "—";
  if (platoon && section) return `${platoon}В/${section}О`;
  if (platoon) return `${platoon}В`;
  return `${section}О`;
}

export type PersonnelRosterTopUser = {
  id: string;
  name: string;
  callsign: string;
  uavHitsTotal: number;
  deploymentsCount: number;
  medalsCount: number;
  testStats: {
    trialPassed: number;
    trialFailed: number;
    finalPassed: number;
    finalFailed: number;
  };
  exams: Array<{ examType: string; status: string }>;
};

/** Суммарный балл активности по ключевым показателям (без премий). */
export function computePersonnelActivityScore(user: PersonnelRosterTopUser) {
  const passedExams = user.exams.filter((exam) => exam.status === "passed").length;
  return (
    user.uavHitsTotal +
    user.deploymentsCount +
    user.medalsCount +
    user.testStats.trialPassed +
    user.testStats.finalPassed +
    passedExams
  );
}

export const PERSONNEL_ACTIVITY_SCORE_PARTS = [
  "сбития",
  "командировки",
  "медали",
  "сданные пробные тесты",
  "сданные итоговые тесты",
  "сданные зачёты",
] as const;

export const PERSONNEL_ACTIVITY_SCORE_NOTE =
  "Каждый пункт даёт 1 очко. Премии и дни в командировках не учитываются.";

const ROSTER_TOP_LIMIT = 5;

export type PersonnelRosterTops<T extends PersonnelRosterTopUser> = {
  hits: T[];
  trialTests: T[];
  finalTests: T[];
  deployments: T[];
  activity: T[];
};

export function buildPersonnelRosterTops<T extends PersonnelRosterTopUser>(users: T[]): PersonnelRosterTops<T> {
  return {
    hits: [...users].sort((a, b) => b.uavHitsTotal - a.uavHitsTotal).slice(0, ROSTER_TOP_LIMIT),
    trialTests: [...users].sort((a, b) => b.testStats.trialPassed - a.testStats.trialPassed).slice(0, ROSTER_TOP_LIMIT),
    finalTests: [...users].sort((a, b) => b.testStats.finalPassed - a.testStats.finalPassed).slice(0, ROSTER_TOP_LIMIT),
    deployments: [...users].sort((a, b) => b.deploymentsCount - a.deploymentsCount).slice(0, ROSTER_TOP_LIMIT),
    activity: [...users]
      .sort((a, b) => computePersonnelActivityScore(b) - computePersonnelActivityScore(a))
      .slice(0, ROSTER_TOP_LIMIT),
  };
}
