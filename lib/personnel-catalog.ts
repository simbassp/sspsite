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
      { label: "Название", value: payloadStr(payload.title) || "Премия за сбитие" },
      { label: "Сумма", value: payloadMoney(payload.amount) },
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
