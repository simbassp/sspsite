import { calcAttemptPeopleStats, shouldShowTrialTripleStreak, type TrialTripleStreakStats } from "@/lib/admin-results-query";
import { rotaUnitLabelCompact } from "@/lib/personnel-catalog";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import { unitAssignmentLabel, type RotaPlatoonFilter, type RotaSectionFilter, type UnitAssignmentFilter } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";

export type ResultsExportFilterConfig = {
  periodMode: "all" | "today" | "custom";
  dateFrom: string | null;
  dateTo: string | null;
  typeFilter: "all" | "trial" | "final";
  statusFilter: "all" | "passed" | "failed" | "not_started";
  unitFilter: UnitAssignmentFilter;
  rotaPlatoon: RotaPlatoonFilter;
  rotaSection: RotaSectionFilter;
  search: string;
};

export type ResultsExportColumnKey =
  | "name"
  | "callsign"
  | "position"
  | "unit"
  | "rotaUnit"
  | "type"
  | "status"
  | "result"
  | "attemptIndex"
  | "createdAt"
  | "usedAttempts"
  | "maxAttempts"
  | "trialTripleStreak"
  | "trialPassedCount";

export type ResultsExportColumn = {
  key: ResultsExportColumnKey;
  header: string;
  width: number;
};

export type ResultsAttemptExportRow = {
  userId: string;
  name: string;
  callsign: string;
  position: string;
  unitAssignment: UnitAssignment | null;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  type: "trial" | "final";
  status: "passed" | "failed";
  scorePercent: number;
  questionsCorrect: number | null;
  questionsTotal: number | null;
  createdAt: string;
  finalAttemptIndex: number | null;
  trialTripleStreak?: boolean | null;
  trialPassedCount?: number | null;
};

export type ResultsNotStartedExportRow = {
  name: string;
  callsign: string;
  position: string;
  unitAssignment: UnitAssignment | null;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  usedFinalAttempts: number;
  maxFinalAttempts: number;
};

export function exportShowsRotaUnit(config: ResultsExportFilterConfig) {
  return config.unitFilter === "company_4" || config.rotaPlatoon !== "all" || config.rotaSection !== "all";
}

export function resolveResultsExportColumns(config: ResultsExportFilterConfig): ResultsExportColumn[] {
  if (config.statusFilter === "not_started") {
    const columns: ResultsExportColumn[] = [
      { key: "name", header: "Имя", width: 24 },
      { key: "callsign", header: "Позывной", width: 16 },
      { key: "position", header: "Должность", width: 18 },
      { key: "unit", header: "Подразделение", width: 18 },
    ];
    if (exportShowsRotaUnit(config)) {
      columns.push({ key: "rotaUnit", header: "Взвод/отдел", width: 14 });
    }
    columns.push(
      { key: "status", header: "Статус", width: 18 },
      { key: "usedAttempts", header: "Попыток итога", width: 14 },
      { key: "maxAttempts", header: "Лимит попыток", width: 14 },
    );
    return columns;
  }

  const columns: ResultsExportColumn[] = [
    { key: "name", header: "Имя", width: 24 },
    { key: "callsign", header: "Позывной", width: 16 },
    { key: "position", header: "Должность", width: 18 },
    { key: "unit", header: "Подразделение", width: 18 },
  ];

  if (exportShowsRotaUnit(config)) {
    columns.push({ key: "rotaUnit", header: "Взвод/отдел", width: 14 });
  }

  if (config.typeFilter === "all") {
    columns.push({ key: "type", header: "Тип теста", width: 12 });
  }

  if (config.statusFilter === "all") {
    columns.push({ key: "status", header: "Результат", width: 12 });
  }

  columns.push({ key: "result", header: "Балл / ответы", width: 18 });

  columns.push({ key: "createdAt", header: "Дата", width: 12 });

  if (shouldShowTrialTripleStreak(config.typeFilter, config.statusFilter)) {
    columns.push({ key: "trialPassedCount", header: "Пробных сдано", width: 14 });
  }

  return columns;
}

export function buildResultsExportFilterLines(config: ResultsExportFilterConfig): string[] {
  const lines: string[] = [];

  lines.push(formatExportPeriodLine(config));

  if (config.unitFilter === "all") {
    lines.push("Подразделение: все");
  } else if (config.unitFilter === "unset") {
    lines.push("Подразделение: не указано");
  } else {
    lines.push(`Подразделение: ${unitAssignmentLabel[config.unitFilter]}`);
  }

  if (config.unitFilter === "company_4") {
    if (config.rotaPlatoon !== "all") {
      lines.push(`Взвод: ${config.rotaPlatoon}`);
    }
    if (config.rotaSection !== "all") {
      lines.push(`Отделение: ${config.rotaSection}`);
    }
  }

  if (config.search.trim()) {
    lines.push(`Поиск: ${config.search.trim()}`);
  }

  if (config.typeFilter === "all") {
    lines.push("Тест: все");
  } else {
    lines.push(`Тест: ${config.typeFilter === "trial" ? "пробный" : "итоговый"}`);
  }

  if (config.statusFilter === "all") {
    lines.push("Результат: все");
  } else if (config.statusFilter === "passed") {
    lines.push("Результат: сдал");
  } else if (config.statusFilter === "failed") {
    lines.push("Результат: не сдал");
  } else {
    lines.push("Результат: не проходил итог");
  }

  return lines;
}

export function appendCohortPeopleFilterLine(filterLines: string[], cohortPeople: number) {
  return [...filterLines, `Количество людей: ${cohortPeople}`];
}

function formatFilterDateParam(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function formatExportDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Moscow",
      })
    : iso;
}

function formatExportPeriodLine(config: ResultsExportFilterConfig) {
  if (config.periodMode === "today") {
    return `Период: ${formatExportDate(new Date().toISOString())}`;
  }
  if (config.periodMode === "custom" && (config.dateFrom || config.dateTo)) {
    const from = config.dateFrom ? formatFilterDateParam(config.dateFrom) : null;
    const to = config.dateTo ? formatFilterDateParam(config.dateTo) : null;
    if (from && to && config.dateFrom === config.dateTo) return `Период: ${from}`;
    if (from && to) return `Период: ${from} — ${to}`;
    if (from) return `Период: с ${from}`;
    if (to) return `Период: по ${to}`;
  }
  return "Период: все время";
}

export function resultsAttemptCellValue(row: ResultsAttemptExportRow, key: ResultsExportColumnKey): string | number {
  switch (key) {
    case "name":
      return row.name;
    case "callsign":
      return row.callsign;
    case "position":
      return row.position || "—";
    case "unit":
      return row.unitAssignment ? unitAssignmentLabel[row.unitAssignment] : "—";
    case "rotaUnit":
      return rotaUnitLabelCompact(row.rotaPlatoon, row.rotaSection) || "—";
    case "type":
      return row.type === "trial" ? "Пробный" : "Итоговый";
    case "status":
      return row.status === "passed" ? "Сдал" : "Не сдал";
    case "result":
      return formatTestResultForType(row);
    case "attemptIndex":
      return row.type === "final" && row.finalAttemptIndex != null && row.finalAttemptIndex > 0
        ? row.finalAttemptIndex
        : "—";
    case "createdAt":
      return formatExportDate(row.createdAt);
    case "trialPassedCount":
      return row.trialPassedCount ?? 0;
    case "trialTripleStreak":
      if (row.trialTripleStreak == null) return "—";
      return row.trialTripleStreak ? "Да" : "Нет";
    default:
      return "—";
  }
}

export function resultsNotStartedCellValue(row: ResultsNotStartedExportRow, key: ResultsExportColumnKey): string | number {
  switch (key) {
    case "name":
      return row.name;
    case "callsign":
      return row.callsign;
    case "position":
      return row.position || "—";
    case "unit":
      return row.unitAssignment ? unitAssignmentLabel[row.unitAssignment] : "—";
    case "rotaUnit":
      return rotaUnitLabelCompact(row.rotaPlatoon, row.rotaSection) || "—";
    case "status":
      return "Не проходил итог";
    case "usedAttempts":
      return row.usedFinalAttempts;
    case "maxAttempts":
      return row.maxFinalAttempts;
    default:
      return "—";
  }
}

export function buildResultsExportSummaryLines(input: {
  config: ResultsExportFilterConfig;
  attemptRows: ResultsAttemptExportRow[];
  notStartedRows: ResultsNotStartedExportRow[];
  attemptsTotal: number;
  trialTripleStreakStats?: TrialTripleStreakStats | null;
}) {
  const lines: Array<[string, string | number]> = [];

  if (input.config.statusFilter === "not_started") {
    lines.push(["Сотрудников", input.notStartedRows.length]);
    return lines;
  }

  if (input.trialTripleStreakStats && shouldShowTrialTripleStreak(input.config.typeFilter, input.config.statusFilter)) {
    lines.push(["Количество людей", input.trialTripleStreakStats.cohortPeople]);
    lines.push(["Попыток всего", input.attemptRows.length]);
    if (input.attemptsTotal > input.attemptRows.length) {
      lines.push(["Всего попыток по фильтру", input.attemptsTotal]);
    }
    lines.push(["Сдали 3 пробных", input.trialTripleStreakStats.passedPeople]);
    lines.push(["Не сдали 3 пробных", input.trialTripleStreakStats.failedPeople]);
    if (input.config.typeFilter === "all") {
      lines.push(["Итоговых попыток", input.attemptRows.filter((row) => row.type === "final").length]);
    }
    return lines;
  }

  lines.push(["Попыток в выгрузке", input.attemptRows.length]);
  if (input.attemptsTotal > input.attemptRows.length) {
    lines.push(["Всего попыток по фильтру", input.attemptsTotal]);
  }

  const passedAttempts = input.attemptRows.filter((row) => row.status === "passed").length;
  const failedAttempts = input.attemptRows.filter((row) => row.status === "failed").length;
  const peopleStats = calcAttemptPeopleStats(input.attemptRows);

  lines.push(["Сдал (попыток)", passedAttempts]);
  lines.push(["Не сдал (попыток)", failedAttempts]);
  lines.push(["Сдали (людей)", peopleStats.passedPeople]);
  lines.push(["Не сдали (людей)", peopleStats.failedPeople]);

  if (input.config.typeFilter === "all" || input.config.typeFilter === "final") {
    lines.push(["Итоговых попыток", input.attemptRows.filter((row) => row.type === "final").length]);
  }

  return lines;
}
