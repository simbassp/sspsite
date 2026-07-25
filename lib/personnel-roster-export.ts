export type RosterExportTestFilter = "all" | "passed" | "failed";
export type RosterExportDutyStatus = "all" | "base" | "deployment";

export type RosterExportFilterConfig = {
  testDate: string | null;
  license: "all" | string;
  trialTest: RosterExportTestFilter;
  finalTest: RosterExportTestFilter;
  dutyStatus: RosterExportDutyStatus;
};

export type RosterExportColumnKey =
  | "name"
  | "callsign"
  | "rotaUnit"
  | "dutyStatus"
  | "licenses"
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
    config.license !== "all" ||
    config.trialTest !== "all" ||
    config.finalTest !== "all" ||
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
    { key: "rotaUnit", header: "В/О", width: 18 },
  ];

  if (config.dutyStatus !== "all") {
    columns.push({ key: "dutyStatus", header: "Статус", width: 16 });
  }

  if (config.license !== "all") {
    columns.push({ key: "licenses", header: "Права", width: 16 });
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
  license?: unknown;
  trialTest?: unknown;
  finalTest?: unknown;
  dutyStatus?: unknown;
}): RosterExportFilterConfig {
  const testDateRaw = typeof raw.testDate === "string" ? raw.testDate.trim() : "";
  const testDate = /^\d{4}-\d{2}-\d{2}$/.test(testDateRaw) ? testDateRaw : null;

  const parseTest = (value: unknown): RosterExportTestFilter =>
    value === "passed" || value === "failed" ? value : "all";
  const parseDuty = (value: unknown): RosterExportDutyStatus =>
    value === "base" || value === "deployment" ? value : "all";

  const licenseRaw = typeof raw.license === "string" ? raw.license : "all";

  return {
    testDate,
    license: licenseRaw === "all" ? "all" : licenseRaw,
    trialTest: parseTest(raw.trialTest),
    finalTest: parseTest(raw.finalTest),
    dutyStatus: parseDuty(raw.dutyStatus),
  };
}
