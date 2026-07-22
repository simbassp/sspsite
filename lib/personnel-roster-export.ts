import type { PersonnelExamType } from "@/lib/personnel-catalog";
import { personnelExamLabel } from "@/lib/personnel-catalog";

export type RosterExportExamStatus = "all" | "passed" | "failed";
export type RosterExportTestFilter = "all" | "passed" | "failed";
export type RosterExportTriState = "all" | "yes" | "no";
export type RosterExportDutyStatus = "all" | "base" | "deployment";

export type RosterExportFilterConfig = {
  testDate: string | null;
  examType: "all" | PersonnelExamType;
  examStatus: RosterExportExamStatus;
  license: "all" | string;
  trialTest: RosterExportTestFilter;
  finalTest: RosterExportTestFilter;
  hits: RosterExportTriState;
  premiums: RosterExportTriState;
  dutyStatus: RosterExportDutyStatus;
};

export type RosterExportColumnKey =
  | "name"
  | "callsign"
  | "rotaUnit"
  | "dutyStatus"
  | "deployments"
  | "deploymentDays"
  | "uavHits"
  | "premiums"
  | "licenses"
  | "exam"
  | "testDate"
  | "trialPassed"
  | "trialFailed"
  | "finalPassed"
  | "finalFailed";

export type RosterExportColumn = {
  key: RosterExportColumnKey;
  header: string;
  width: number;
};

export function hasRosterFocusFilters(config: RosterExportFilterConfig) {
  return (
    config.examType !== "all" ||
    config.examStatus !== "all" ||
    config.license !== "all" ||
    config.trialTest !== "all" ||
    config.finalTest !== "all" ||
    config.hits !== "all" ||
    config.premiums !== "all" ||
    config.dutyStatus !== "all"
  );
}

export function exportIncludesTrialStats(config: RosterExportFilterConfig) {
  return config.trialTest !== "all";
}

export function exportIncludesFinalStats(config: RosterExportFilterConfig) {
  return config.finalTest !== "all";
}

export function exportIncludesTestStats(config: RosterExportFilterConfig) {
  return exportIncludesTrialStats(config) || exportIncludesFinalStats(config);
}

export function resolveRosterExportColumns(config: RosterExportFilterConfig): RosterExportColumn[] {
  const columns: RosterExportColumn[] = [
    { key: "name", header: "Имя", width: 24 },
    { key: "callsign", header: "Позывной", width: 16 },
    { key: "rotaUnit", header: "Взвод/отдел", width: 18 },
  ];

  if (config.dutyStatus !== "all") {
    columns.push(
      { key: "dutyStatus", header: "Статус", width: 16 },
      { key: "deployments", header: "Командировок", width: 14 },
      { key: "deploymentDays", header: "Дней в командировке", width: 18 },
    );
  }

  if (config.hits !== "all") {
    columns.push({ key: "uavHits", header: "Сбитий", width: 10 });
  }

  if (config.premiums !== "all") {
    columns.push({ key: "premiums", header: "Премии, ₽", width: 14 });
  }

  if (config.license !== "all") {
    columns.push({ key: "licenses", header: "Права", width: 16 });
  }

  if (config.examType !== "all") {
    columns.push({
      key: "exam",
      header: `Зачёт: ${personnelExamLabel[config.examType]}`,
      width: 18,
    });
  }

  const includeTrial = exportIncludesTrialStats(config);
  const includeFinal = exportIncludesFinalStats(config);

  if (config.testDate && exportIncludesTestStats(config)) {
    columns.push({ key: "testDate", header: "Дата", width: 12 });
  }

  if (includeTrial) {
    columns.push(
      { key: "trialPassed", header: "Пробный сдал", width: 14 },
      { key: "trialFailed", header: "Пробный не сдал", width: 16 },
    );
  }

  if (includeFinal) {
    columns.push(
      { key: "finalPassed", header: "Итоговый сдал", width: 14 },
      { key: "finalFailed", header: "Итоговый не сдал", width: 16 },
    );
  }

  return columns;
}

export function parseRosterExportFilterConfig(raw: {
  testDate?: unknown;
  examType?: unknown;
  examStatus?: unknown;
  license?: unknown;
  trialTest?: unknown;
  finalTest?: unknown;
  hits?: unknown;
  premiums?: unknown;
  dutyStatus?: unknown;
}): RosterExportFilterConfig {
  const testDateRaw = typeof raw.testDate === "string" ? raw.testDate.trim() : "";
  const testDate = /^\d{4}-\d{2}-\d{2}$/.test(testDateRaw) ? testDateRaw : null;

  const examTypeRaw = typeof raw.examType === "string" ? raw.examType : "all";
  const examType =
    examTypeRaw === "ttx" ||
    examTypeRaw === "medicine" ||
    examTypeRaw === "verification" ||
    examTypeRaw === "physical" ||
    examTypeRaw === "shooting"
      ? examTypeRaw
      : "all";

  const parseTri = (value: unknown): RosterExportTriState =>
    value === "yes" || value === "no" ? value : "all";
  const parseTest = (value: unknown): RosterExportTestFilter =>
    value === "passed" || value === "failed" ? value : "all";
  const parseExamStatus = (value: unknown): RosterExportExamStatus =>
    value === "passed" || value === "failed" ? value : "all";
  const parseDuty = (value: unknown): RosterExportDutyStatus =>
    value === "base" || value === "deployment" ? value : "all";

  const licenseRaw = typeof raw.license === "string" ? raw.license : "all";

  return {
    testDate,
    examType,
    examStatus: parseExamStatus(raw.examStatus),
    license: licenseRaw === "all" ? "all" : licenseRaw,
    trialTest: parseTest(raw.trialTest),
    finalTest: parseTest(raw.finalTest),
    hits: parseTri(raw.hits),
    premiums: parseTri(raw.premiums),
    dutyStatus: parseDuty(raw.dutyStatus),
  };
}
