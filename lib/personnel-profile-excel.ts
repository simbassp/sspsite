import type { PersonnelProfileExportBundle } from "@/lib/personnel-profile-export-server";
import { formatExportDuration, formatExportMoney } from "@/lib/personnel-profile-export-server";
import type { RosterExportColumn, RosterExportColumnKey } from "@/lib/personnel-roster-export";
import {
  buildBarChartSvg,
  buildMonthlyBarChartSvg,
  buildPieChartSvg,
  svgToPngBuffer,
  type ExcelChartSlice,
} from "@/lib/personnel-excel-charts";
import type ExcelJS from "exceljs";

const HEADER_FILL = "FFC42B2B";
const HEADER_FONT = "FFFFFFFF";
const SECTION_FILL = "FFF3F4F6";
const PASS_FILL = "FFD1FAE5";
const FAIL_FILL = "FFFEE2E2";

function styleHeaderRow(row: ExcelJS.Row, height = 24) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
  row.height = height;
}

function styleSectionTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
  cell.alignment = { vertical: "middle" };
}

function formatSheetDate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("ru-RU") : value;
}

function styleTableCell(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
  cell.alignment = { vertical: "top", wrapText: true };
}

function styleCompactTableCell(cell: ExcelJS.Cell, horizontal: "left" | "center" | "right" = "left") {
  styleTableCell(cell);
  cell.alignment = { vertical: "middle", horizontal, wrapText: false };
}

function applyCompactRow(row: ExcelJS.Row, height = 18) {
  row.height = height;
}

function applySheetTableFilters(
  sheet: ExcelJS.Worksheet,
  headerRow: number,
  columnCount: number,
  options?: { preserveViews?: boolean },
) {
  if (headerRow < 1 || columnCount < 1 || sheet.rowCount < headerRow) return;
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: sheet.rowCount, column: columnCount },
  };
  if (!options?.preserveViews) {
    sheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: headerRow === 1 ? "A2" : `A${headerRow + 1}` }];
  }
}

function applyWorkbookTableFilters(workbook: ExcelJS.Workbook, bulk: boolean) {
  if (bulk) {
    const bulkSheets: Array<{ name: string; headerRow: number; columns: number; preserveViews?: boolean }> = [
      { name: "Сводка", headerRow: 3, columns: 13, preserveViews: true },
      { name: "Зачёты", headerRow: 1, columns: 6 },
      { name: "Командировки", headerRow: 1, columns: 7 },
      { name: "Медали", headerRow: 1, columns: 4 },
      { name: "Премии", headerRow: 1, columns: 6 },
      { name: "Активность", headerRow: 1, columns: 5 },
    ];
    for (const cfg of bulkSheets) {
      const sheet = workbook.getWorksheet(cfg.name);
      if (sheet && sheet.rowCount > cfg.headerRow) {
        applySheetTableFilters(sheet, cfg.headerRow, cfg.columns, { preserveViews: cfg.preserveViews });
      }
    }
    return;
  }

  const singleSheets: Array<{ name: string; columns: number }> = [
    { name: "Зачёты", columns: 4 },
    { name: "Командировки", columns: 5 },
    { name: "Медали", columns: 2 },
    { name: "Премии", columns: 4 },
    { name: "Активность", columns: 3 },
  ];
  for (const cfg of singleSheets) {
    const sheet = workbook.getWorksheet(cfg.name);
    if (sheet && sheet.rowCount > 1) {
      applySheetTableFilters(sheet, 1, cfg.columns);
    }
  }
}

type TestSummaryCounts = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

function getTestSummary(bundle: PersonnelProfileExportBundle): TestSummaryCounts {
  const fromResults: TestSummaryCounts = {
    trialPassed: 0,
    trialFailed: 0,
    finalPassed: 0,
    finalFailed: 0,
  };
  for (const test of bundle.testResults) {
    if (test.type === "final") {
      if (test.status === "passed") fromResults.finalPassed += 1;
      else fromResults.finalFailed += 1;
    } else if (test.status === "passed") fromResults.trialPassed += 1;
    else fromResults.trialFailed += 1;
  }
  if (fromResults.trialPassed + fromResults.trialFailed + fromResults.finalPassed + fromResults.finalFailed > 0) {
    return fromResults;
  }

  const stats = bundle.profile?.testStats;
  return {
    trialPassed: stats?.trialPassed ?? 0,
    trialFailed: stats?.trialFailed ?? 0,
    finalPassed: stats?.finalPassed ?? 0,
    finalFailed: stats?.finalFailed ?? 0,
  };
}

function testSummarySlices(summary: TestSummaryCounts): ExcelChartSlice[] {
  return [
    { label: "Пробные (сданы)", value: summary.trialPassed, color: "#3B82F6" },
    { label: "Пробные (не сданы)", value: summary.trialFailed, color: "#F59E0B" },
    { label: "Итоговые (сданы)", value: summary.finalPassed, color: "#10B981" },
    { label: "Итоговые (не сданы)", value: summary.finalFailed, color: "#C42B2B" },
  ];
}

function aggregateTestSummary(bundles: PersonnelProfileExportBundle[]): TestSummaryCounts {
  return bundles.reduce(
    (acc, bundle) => {
      const s = getTestSummary(bundle);
      acc.trialPassed += s.trialPassed;
      acc.trialFailed += s.trialFailed;
      acc.finalPassed += s.finalPassed;
      acc.finalFailed += s.finalFailed;
      return acc;
    },
    { trialPassed: 0, trialFailed: 0, finalPassed: 0, finalFailed: 0 },
  );
}

function styleCountCell(cell: ExcelJS.Cell, tone: "pass" | "fail" | "neutral") {
  styleCompactTableCell(cell, "center");
  if (tone === "pass") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PASS_FILL } };
    cell.font = { bold: true, color: { argb: "FF065F46" } };
  } else if (tone === "fail") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
    cell.font = { bold: true, color: { argb: "FF991B1B" } };
  }
}

function employeeLabel(bundle: PersonnelProfileExportBundle) {
  const name = bundle.user.name || bundle.user.login || "—";
  const callsign = bundle.user.callsign?.trim();
  return callsign ? `${name} (${callsign})` : name;
}

function summaryStatsSlices(bundle: PersonnelProfileExportBundle): ExcelChartSlice[] {
  const summary = getTestSummary(bundle);
  return testSummarySlices(summary);
}

function activitySummarySlices(_bundle: PersonnelProfileExportBundle): ExcelChartSlice[] {
  return [];
}

function monthlyActivityTotals(_bundle: PersonnelProfileExportBundle) {
  return [] as Array<{ label: string; value: number }>;
}

async function embedChartImage(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  svg: string,
  topRow: number,
  width = 560,
  height = 320,
) {
  const png = Buffer.from(await svgToPngBuffer(svg));
  const imageId = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: "png" });
  sheet.addImage(imageId, {
    tl: { col: 0, row: topRow },
    ext: { width, height },
  });
  return Math.ceil(height / 20) + topRow + 1;
}

async function addChartsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Графики");
  sheet.columns = [{ width: 72 }];

  const title = sheet.addRow(["Графики"]);
  styleSectionTitle(title.getCell(1));
  title.height = 22;

  let nextRow = sheet.rowCount;
  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildBarChartSvg("Сводная статистика", summaryStatsSlices(bundle)),
    nextRow,
    560,
    Math.max(220, 64 + summaryStatsSlices(bundle).filter((s) => s.value > 0).length * 34),
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  const activitySlices = activitySummarySlices(bundle);
  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildPieChartSvg("Активность (круговая)", activitySlices),
    sheet.rowCount,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildBarChartSvg("Активность (шкалы)", activitySlices),
    sheet.rowCount,
    560,
    Math.max(220, 64 + activitySlices.filter((s) => s.value > 0).length * 34),
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  const monthly = monthlyActivityTotals(bundle);
  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildMonthlyBarChartSvg("Активность по месяцам", monthly),
    sheet.rowCount,
    560,
    280,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  sheet.addRow([]);
  const tableHeader = sheet.addRow(["Показатель", "Количество"]);
  styleHeaderRow(tableHeader);
  for (const item of activitySlices) {
    const row = sheet.addRow([item.label, item.value]);
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addOverviewSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Обзор", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { width: 28 },
    { width: 42 },
    { width: 28 },
    { width: 42 },
  ];

  const title = sheet.addRow(["Личное дело / профиль сотрудника"]);
  sheet.mergeCells(title.number, 1, title.number, 4);
  styleSectionTitle(title.getCell(1));
  title.height = 24;

  sheet.addRow([`Выгрузка: ${bundle.exportedAt}`]).eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  });
  sheet.addRow([]);

  const addSection = (label: string) => {
    const row = sheet.addRow([label]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    styleSectionTitle(row.getCell(1));
    row.height = 20;
  };

  const addPairs = (pairs: Array<[string, string]>) => {
    for (let i = 0; i < pairs.length; i += 2) {
      const left = pairs[i];
      const right = pairs[i + 1];
      const row = sheet.addRow([
        left?.[0] ?? "",
        left?.[1] ?? "",
        right?.[0] ?? "",
        right?.[1] ?? "",
      ]);
      row.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
      if (right) row.getCell(3).font = { bold: true, color: { argb: "FF374151" } };
      row.eachCell((cell) => styleTableCell(cell));
    }
  };

  addSection("Основные данные");
  addPairs([
    ["Имя", bundle.user.name || "—"],
    ["Позывной", bundle.user.callsign || "—"],
    ["Должность", bundle.user.position || "—"],
    ["П", bundle.user.unitAssignment || "—"],
    ["В/О", bundle.user.rotaUnit],
    ["Место положения", bundle.user.dutyLocation],
  ]);

  sheet.addRow([]);
  addSection("Сводная статистика");
  const p = bundle.profile;
  addPairs([
    ["Категории прав", p?.licenseCategories?.length ? p.licenseCategories.join(", ") : "—"],
    ["Пробных сдано", p ? String(p.testStats.trialPassed) : "0"],
    ["Пробных не сдано", p ? String(p.testStats.trialFailed) : "0"],
    ["Итоговых сдано", p ? String(p.testStats.finalPassed) : "0"],
    ["Итоговых не сдано", p ? String(p.testStats.finalFailed) : "0"],
  ]);
}

function getOrCreateBulkSheet(workbook: ExcelJS.Workbook, name: string, columns: Array<{ width: number }>, headerCells: string[]) {
  let sheet = workbook.getWorksheet(name);
  if (!sheet) {
    sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    styleHeaderRow(sheet.addRow(headerCells));
  }
  return sheet;
}

async function addTestsChartsBlock(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  summary: TestSummaryCounts,
  startRow: number,
) {
  const slices = testSummarySlices(summary);
  const barHeight = Math.max(220, 64 + slices.filter((s) => s.value > 0).length * 34);

  let nextRow = startRow;
  nextRow = await embedChartImage(workbook, sheet, buildPieChartSvg("Сводка по тестам", slices), nextRow);
  nextRow += 1;
  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildBarChartSvg("Сводка по тестам (шкалы)", slices),
    nextRow,
    560,
    barHeight,
  );
  return nextRow;
}

function addTestsSummaryTable(
  sheet: ExcelJS.Worksheet,
  bundles: PersonnelProfileExportBundle[],
  bulk: boolean,
) {
  sheet.addRow([]);
  const section = sheet.addRow([bulk ? "Сводка по сотрудникам" : "Сводка"]);
  if (bulk) sheet.mergeCells(section.number, 1, section.number, 6);
  else sheet.mergeCells(section.number, 1, section.number, 2);
  styleSectionTitle(section.getCell(1));
  applyCompactRow(section, 20);

  const header = sheet.addRow(
    bulk
      ? ["Сотрудник", "Позывной", "Пробные (сданы)", "Пробные (не сданы)", "Итоговые (сданы)", "Итоговые (не сданы)"]
      : ["Показатель", "Количество"],
  );
  styleHeaderRow(header);

  if (bulk) {
    for (const bundle of bundles) {
      const s = getTestSummary(bundle);
      const row = sheet.addRow([
        bundle.user.name,
        bundle.user.callsign,
        s.trialPassed,
        s.trialFailed,
        s.finalPassed,
        s.finalFailed,
      ]);
      applyCompactRow(row);
      styleCompactTableCell(row.getCell(1));
      styleCompactTableCell(row.getCell(2));
      styleCountCell(row.getCell(3), "pass");
      styleCountCell(row.getCell(4), "fail");
      styleCountCell(row.getCell(5), "pass");
      styleCountCell(row.getCell(6), "fail");
    }
  } else {
    const bundle = bundles[0];
    if (!bundle) return;
    const s = getTestSummary(bundle);
    const rows: Array<[string, number, "pass" | "fail"]> = [
      ["Пробные (сданы)", s.trialPassed, "pass"],
      ["Пробные (не сданы)", s.trialFailed, "fail"],
      ["Итоговые (сданы)", s.finalPassed, "pass"],
      ["Итоговые (не сданы)", s.finalFailed, "fail"],
    ];
    for (const [label, value, tone] of rows) {
      const row = sheet.addRow([label, value]);
      applyCompactRow(row);
      styleCompactTableCell(row.getCell(1));
      styleCountCell(row.getCell(2), tone);
    }
  }
}

function appendTestsDetailRows(sheet: ExcelJS.Worksheet, bundle: PersonnelProfileExportBundle, bulk: boolean) {
  for (const t of bundle.testResults) {
    const row = sheet.addRow(
      bulk
        ? [
            bundle.user.name,
            bundle.user.callsign,
            t.createdAt,
            t.type === "final" ? "Итоговый" : "Пробный",
            t.status === "passed" ? "Сдан" : "Не сдан",
            t.score,
            t.resultText,
            formatExportDuration(t.durationSeconds),
          ]
        : [
            t.createdAt,
            t.type === "final" ? "Итоговый" : "Пробный",
            t.status === "passed" ? "Сдан" : "Не сдан",
            t.score,
            t.resultText,
            formatExportDuration(t.durationSeconds),
          ],
    );
    applyCompactRow(row);
    row.eachCell((cell) => styleCompactTableCell(cell));
    const statusCell = row.getCell(bulk ? 5 : 3);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: t.status === "passed" ? PASS_FILL : FAIL_FILL },
    };
    statusCell.font = { bold: true };
    statusCell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
  }
}

async function addSingleTestsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Тесты");
  sheet.columns = [
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 24 },
    { width: 12 },
  ];

  const title = sheet.addRow(["Тесты"]);
  sheet.mergeCells(title.number, 1, title.number, 6);
  styleSectionTitle(title.getCell(1));
  title.height = 22;

  addTestsSummaryTable(sheet, [bundle], false);

  sheet.addRow([]);
  const chartTitle = sheet.addRow(["Графики"]);
  sheet.mergeCells(chartTitle.number, 1, chartTitle.number, 6);
  styleSectionTitle(chartTitle.getCell(1));
  applyCompactRow(chartTitle, 20);

  const chartAnchor = sheet.rowCount;
  const summary = getTestSummary(bundle);
  const nextRow = await addTestsChartsBlock(workbook, sheet, summary, chartAnchor);
  for (let i = sheet.rowCount; i < nextRow; i += 1) {
    sheet.addRow([]);
  }

  sheet.addRow([]);
  const detailTitle = sheet.addRow(["Попытки"]);
  sheet.mergeCells(detailTitle.number, 1, detailTitle.number, 6);
  styleSectionTitle(detailTitle.getCell(1));
  applyCompactRow(detailTitle, 20);

  const detailHeader = sheet.addRow(["Дата", "Тип", "Статус", "Балл", "Результат", "Длительность"]);
  styleHeaderRow(detailHeader);

  if (!bundle.testResults.length) {
    const row = sheet.addRow(["Нет попыток", "", "", "", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 6);
    applyCompactRow(row);
  } else {
    appendTestsDetailRows(sheet, bundle, false);
  }

  if (sheet.rowCount > detailHeader.number) {
    applySheetTableFilters(sheet, detailHeader.number, 6, { preserveViews: true });
  }
}

async function addBulkTestsSheet(workbook: ExcelJS.Workbook, bundles: PersonnelProfileExportBundle[]) {
  const sheet = workbook.addWorksheet("Тесты");
  sheet.columns = [
    { width: 18 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 24 },
    { width: 12 },
  ];

  const title = sheet.addRow(["Тесты — 4 рота"]);
  sheet.mergeCells(title.number, 1, title.number, 8);
  styleSectionTitle(title.getCell(1));
  title.height = 22;

  addTestsSummaryTable(sheet, bundles, true);

  sheet.addRow([]);
  const chartTitle = sheet.addRow(["Графики"]);
  sheet.mergeCells(chartTitle.number, 1, chartTitle.number, 8);
  styleSectionTitle(chartTitle.getCell(1));
  applyCompactRow(chartTitle, 20);

  const chartAnchor = sheet.rowCount;
  const aggregate = aggregateTestSummary(bundles);
  const nextRow = await addTestsChartsBlock(workbook, sheet, aggregate, chartAnchor);
  for (let i = sheet.rowCount; i < nextRow; i += 1) {
    sheet.addRow([]);
  }

  sheet.addRow([]);
  const detailTitle = sheet.addRow(["Попытки"]);
  sheet.mergeCells(detailTitle.number, 1, detailTitle.number, 8);
  styleSectionTitle(detailTitle.getCell(1));
  applyCompactRow(detailTitle, 20);

  const detailHeader = sheet.addRow([
    "Сотрудник",
    "Позывной",
    "Дата",
    "Тип",
    "Статус",
    "Балл",
    "Результат",
    "Длительность",
  ]);
  styleHeaderRow(detailHeader);

  let hasDetails = false;
  for (const bundle of bundles) {
    if (!bundle.testResults.length) continue;
    hasDetails = true;
    appendTestsDetailRows(sheet, bundle, true);
  }

  if (!hasDetails) {
    const row = sheet.addRow(["Нет попыток", "", "", "", "", "", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 8);
    applyCompactRow(row);
  }

  if (sheet.rowCount > detailHeader.number) {
    applySheetTableFilters(sheet, detailHeader.number, 8, { preserveViews: true });
  }
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  bundles: PersonnelProfileExportBundle[],
  meta: { title: string; exportedAt: string },
) {
  const sheet = workbook.addWorksheet("Сводка", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [
    { width: 18 },
    { width: 12 },
    { width: 22 },
    { width: 20 },
    { width: 16 },
    { width: 10 },
    { width: 14 },
    { width: 8 },
    { width: 9 },
    { width: 13 },
    { width: 8 },
    { width: 10 },
  ];

  const title = sheet.addRow([meta.title]);
  sheet.mergeCells(title.number, 1, title.number, 10);
  styleSectionTitle(title.getCell(1));
  title.height = 24;

  sheet.addRow([`Выгрузка: ${meta.exportedAt}`, `Сотрудников: ${bundles.length}`]).eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  });

  const header = sheet.addRow([
    "Имя",
    "Позывной",
    "Должность",
    "В/О",
    "Место",
    "Права",
    "Пробных сдано",
    "Пробных не сдано",
    "Итоговых сдано",
    "Итоговых не сдано",
  ]);
  styleHeaderRow(header, 36);

  for (const bundle of bundles) {
    const p = bundle.profile;
    const row = sheet.addRow([
      bundle.user.name || "—",
      bundle.user.callsign || "—",
      bundle.user.position || "—",
      bundle.user.rotaUnit,
      bundle.user.dutyLocation,
      p?.licenseCategories?.length ? p.licenseCategories.join(", ") : "—",
      p?.testStats.trialPassed ?? 0,
      p?.testStats.trialFailed ?? 0,
      p?.testStats.finalPassed ?? 0,
      p?.testStats.finalFailed ?? 0,
    ]);
    applyCompactRow(row);
    row.eachCell((cell, col) => {
      const centerCols = new Set([7, 8, 9, 10]);
      styleCompactTableCell(cell, centerCols.has(col) ? "center" : "left");
    });
  }
}

function aggregateActivitySummary(_bundles: PersonnelProfileExportBundle[]): ExcelChartSlice[] {
  return [];
}

function aggregateMonthlyActivity(_bundles: PersonnelProfileExportBundle[]) {
  return [] as Array<{ label: string; value: number }>;
}

function aggregateSummaryStats(bundles: PersonnelProfileExportBundle[]): ExcelChartSlice[] {
  return testSummarySlices(aggregateTestSummary(bundles));
}

async function addBulkChartsSheet(workbook: ExcelJS.Workbook, bundles: PersonnelProfileExportBundle[]) {
  const sheet = workbook.addWorksheet("Графики");
  sheet.columns = [{ width: 72 }];

  const title = sheet.addRow(["Графики — сводка"]);
  styleSectionTitle(title.getCell(1));
  title.height = 22;

  const summary = aggregateSummaryStats(bundles);
  const activity = aggregateActivitySummary(bundles);
  const monthly = aggregateMonthlyActivity(bundles);

  const summaryHeight = Math.max(220, 64 + summary.filter((s) => s.value > 0).length * 34);
  const activityHeight = Math.max(220, 64 + activity.filter((s) => s.value > 0).length * 34);

  let nextRow = await embedChartImage(
    workbook,
    sheet,
    buildBarChartSvg("Сводная статистика (все сотрудники)", summary),
    sheet.rowCount,
    560,
    summaryHeight,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildPieChartSvg("Активность (круговая)", activity),
    sheet.rowCount,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildBarChartSvg("Активность (шкалы)", activity),
    sheet.rowCount,
    560,
    activityHeight,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);

  nextRow = await embedChartImage(
    workbook,
    sheet,
    buildMonthlyBarChartSvg("Активность по месяцам", monthly),
    sheet.rowCount,
    560,
    280,
  );
  for (let i = sheet.rowCount; i < nextRow; i += 1) sheet.addRow([]);
}

async function buildWorkbook(bundles: PersonnelProfileExportBundle[], bulk: boolean) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSP";
  workbook.created = new Date();
  workbook.modified = new Date();

  if (bulk) {
    addSummarySheet(workbook, bundles, {
      title: "4 рота — выгрузка сотрудников",
      exportedAt: bundles[0]?.exportedAt ?? new Date().toLocaleString("ru-RU"),
    });
    await addBulkChartsSheet(workbook, bundles);
    await addBulkTestsSheet(workbook, bundles);
    applyWorkbookTableFilters(workbook, true);
  } else {
    const bundle = bundles[0];
    if (!bundle) throw new Error("empty_export_bundle");
    addOverviewSheet(workbook, bundle);
    await addChartsSheet(workbook, bundle);
    await addSingleTestsSheet(workbook, bundle);
    applyWorkbookTableFilters(workbook, false);
  }

  return workbook;
}

export async function buildPersonnelProfileExcelBuffer(bundle: PersonnelProfileExportBundle) {
  const workbook = await buildWorkbook([bundle], false);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildPersonnelBulkExcelBuffer(bundles: PersonnelProfileExportBundle[]) {
  const workbook = await buildWorkbook(bundles, true);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type PersonnelRosterFilterExportRow = {
  name: string;
  callsign: string;
  rotaUnit: string;
  dutyLocation?: string;
  licenseCategories?: string;
  testDate?: string | null;
  trialPassed?: number;
  trialFailed?: number;
  finalPassed?: number;
  finalFailed?: number;
};

function rosterExportCellValue(row: PersonnelRosterFilterExportRow, key: RosterExportColumnKey) {
  switch (key) {
    case "name":
      return row.name || "—";
    case "callsign":
      return row.callsign || "—";
    case "rotaUnit":
      return row.rotaUnit || "—";
    case "dutyStatus":
      return row.dutyLocation || "—";
    case "licenses":
      return row.licenseCategories || "—";
    case "testDate":
      return row.testDate || "—";
    case "trialPassed":
      return row.trialPassed ?? 0;
    case "trialFailed":
      return row.trialFailed ?? 0;
    case "finalPassed":
      return row.finalPassed ?? 0;
    case "finalFailed":
      return row.finalFailed ?? 0;
    default:
      return "—";
  }
}

export async function buildPersonnelRosterFilterExcelBuffer(input: {
  rows: PersonnelRosterFilterExportRow[];
  columns: RosterExportColumn[];
  filterLines: string[];
  summaryLines: Array<[string, string | number]>;
}) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSP PVO";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Сводка");
  summary.columns = [{ width: 28 }, { width: 52 }];
  const title = summary.addRow(["Выгрузка по фильтрам", ""]);
  styleSectionTitle(title.getCell(1));
  summary.mergeCells(title.number, 1, title.number, 2);
  title.height = 24;

  for (const line of input.filterLines) {
    const row = summary.addRow([line, ""]);
    summary.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { size: 10, color: { argb: "FF374151" } };
  }

  if (input.summaryLines.length > 0) {
    summary.addRow([]);
    const totalsTitle = summary.addRow(["Итого по выгрузке", ""]);
    styleSectionTitle(totalsTitle.getCell(1));
    summary.mergeCells(totalsTitle.number, 1, totalsTitle.number, 2);
    for (const [label, value] of input.summaryLines) {
      summary.addRow([label, value]);
    }
  }

  const sheet = workbook.addWorksheet("Сотрудники");
  sheet.columns = input.columns.map((column) => ({ width: column.width }));

  const header = sheet.addRow(input.columns.map((column) => column.header));
  styleHeaderRow(header, 32);

  const numericKeys = new Set(["trialPassed", "trialFailed", "finalPassed", "finalFailed"]);

  for (const row of input.rows) {
    const dataRow = sheet.addRow(input.columns.map((column) => rosterExportCellValue(row, column.key)));
    applyCompactRow(dataRow);
    dataRow.eachCell((cell, col) => {
      const column = input.columns[col - 1];
      if (!column) return;
      const horizontal = numericKeys.has(column.key) ? "center" : "left";
      styleCompactTableCell(cell, horizontal);
      if (column.key === "trialPassed") styleCountCell(cell, (row.trialPassed ?? 0) > 0 ? "pass" : "neutral");
      if (column.key === "trialFailed") styleCountCell(cell, (row.trialFailed ?? 0) > 0 ? "fail" : "neutral");
      if (column.key === "finalPassed") styleCountCell(cell, (row.finalPassed ?? 0) > 0 ? "pass" : "neutral");
      if (column.key === "finalFailed") styleCountCell(cell, (row.finalFailed ?? 0) > 0 ? "fail" : "neutral");
    });
  }

  if (sheet.rowCount > 1) {
    applySheetTableFilters(sheet, 1, input.columns.length);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export { employeeLabel };
