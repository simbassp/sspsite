import type { PersonnelProfileExportBundle } from "@/lib/personnel-profile-export-server";
import { formatExportDuration, formatExportMoney } from "@/lib/personnel-profile-export-server";
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

  const items = bundle.profile?.activitySummary ?? [];
  const val = (key: string) => items.find((item) => item.key === key)?.value ?? 0;
  return {
    trialPassed: val("trialPassed"),
    trialFailed: val("trialFailed"),
    finalPassed: val("finalPassed"),
    finalFailed: val("finalFailed"),
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
  const p = bundle.profile;
  return [
    { label: "Командировки", value: p?.deploymentsCount ?? 0, color: "#3B82F6" },
    { label: "Сбития БПЛА", value: p?.uavHitsTotal ?? 0, color: "#C42B2B" },
    { label: "Медали", value: p?.medals?.length ?? 0, color: "#F59E0B" },
    { label: "Премии (шт.)", value: p?.premiums?.length ?? 0, color: "#D97706" },
  ];
}

function activitySummarySlices(bundle: PersonnelProfileExportBundle): ExcelChartSlice[] {
  return (bundle.profile?.activitySummary ?? []).map((item) => ({
    label: item.label,
    value: item.value,
    color: item.color.startsWith("#") ? item.color : "#C42B2B",
  }));
}

function monthlyActivityTotals(bundle: PersonnelProfileExportBundle) {
  return (bundle.profile?.activityByMonth ?? []).map((month) => ({
    label: month.month,
    value: month.total,
  }));
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
    ["ФИО", bundle.user.name || "—"],
    ["Позывной", bundle.user.callsign || "—"],
    ["Должность", bundle.user.position || "—"],
    ["Подразделение", bundle.user.unitAssignment || "—"],
    ["Взвод/Отдел/Мод", bundle.user.rotaUnit],
    ["Модуль", bundle.user.rotaModule],
    ["Место положения", bundle.user.dutyLocation],
    ["Трудоустройство", bundle.user.employmentDate],
    ["Стаж", bundle.user.employmentDays],
  ]);

  sheet.addRow([]);
  addSection("Сводная статистика");
  const p = bundle.profile;
  addPairs([
    ["Командировок", p ? String(p.deploymentsCount) : "0"],
    ["Дней в командировках", p ? String(p.deploymentDays) : "0"],
    ["Сбитий БПЛА", p ? String(p.uavHitsTotal) : "0"],
    ["Премии", p ? formatExportMoney(p.premiumsTotal) : "0 ₽"],
    ["Медалей", p?.medals?.length != null ? String(p.medals.length) : "0"],
    ["Категории прав", p?.licenseCategories?.length ? p.licenseCategories.join(", ") : "—"],
  ]);

  if (p?.activitySummary?.length) {
    sheet.addRow([]);
    addSection("Активность (сводка)");
    const actHeader = sheet.addRow(["Показатель", "Количество"]);
    sheet.mergeCells(actHeader.number, 2, actHeader.number, 4);
    styleHeaderRow(actHeader);
    for (const item of p.activitySummary) {
      const row = sheet.addRow([item.label, item.value]);
      sheet.mergeCells(row.number, 2, row.number, 4);
      row.eachCell((cell) => styleTableCell(cell));
    }
  }
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

function addExamsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle, bulk = false) {
  const sheet = bulk
    ? getOrCreateBulkSheet(workbook, "Зачёты", [{ width: 28 }, { width: 16 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }], [
        "Сотрудник",
        "Позывной",
        "Зачёт",
        "Статус",
        "Дата сдачи",
        "Действует до",
      ])
    : (() => {
        const created = workbook.addWorksheet("Зачёты");
        created.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }];
        styleHeaderRow(created.addRow(["Зачёт", "Статус", "Дата сдачи", "Действует до"]));
        return created;
      })();
  for (const exam of bundle.exams) {
    const row = sheet.addRow(
      bulk
        ? [bundle.user.name, bundle.user.callsign, exam.label, exam.status, exam.passedAt, exam.expiresAt]
        : [exam.label, exam.status, exam.passedAt, exam.expiresAt],
    );
    row.eachCell((cell) => styleTableCell(cell));
    const statusCell = row.getCell(bulk ? 4 : 2);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: exam.status === "Сдан" ? PASS_FILL : FAIL_FILL },
    };
    statusCell.font = { bold: true };
  }
}

function addDeploymentsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle, bulk = false) {
  const sheet = bulk
    ? getOrCreateBulkSheet(
        workbook,
        "Командировки",
        [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 16 }],
        ["Сотрудник", "Позывной", "Дата начала", "Дата окончания", "Дней", "Сбитий", "Премия"],
      )
    : (() => {
        const created = workbook.addWorksheet("Командировки");
        created.columns = [{ width: 18 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 16 }];
        styleHeaderRow(created.addRow(["Дата начала", "Дата окончания", "Дней", "Сбитий", "Премия"]));
        return created;
      })();
  const rows = bundle.profile?.deployments ?? [];
  if (!rows.length) {
    if (!bulk) {
      const row = sheet.addRow(["Нет записей", "", "", "", ""]);
      sheet.mergeCells(row.number, 1, row.number, 5);
    }
    return;
  }
  for (const d of rows) {
    const row = sheet.addRow(
      bulk
        ? [
            bundle.user.name,
            bundle.user.callsign,
            formatSheetDate(d.dateFrom),
            formatSheetDate(d.dateTo),
            d.days,
            d.uavHits,
            formatExportMoney(d.premiumAmount),
          ]
        : [
            formatSheetDate(d.dateFrom),
            formatSheetDate(d.dateTo),
            d.days,
            d.uavHits,
            formatExportMoney(d.premiumAmount),
          ],
    );
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addMedalsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle, bulk = false) {
  const sheet = bulk
    ? getOrCreateBulkSheet(
        workbook,
        "Медали",
        [{ width: 28 }, { width: 16 }, { width: 40 }, { width: 16 }],
        ["Сотрудник", "Позывной", "Название", "Дата"],
      )
    : (() => {
        const created = workbook.addWorksheet("Медали");
        created.columns = [{ width: 40 }, { width: 16 }];
        styleHeaderRow(created.addRow(["Название", "Дата"]));
        return created;
      })();
  const rows = bundle.profile?.medals ?? [];
  if (!rows.length) {
    if (!bulk) {
      sheet.addRow(["Нет записей", ""]);
    }
    return;
  }
  for (const m of rows) {
    const row = sheet.addRow(
      bulk
        ? [bundle.user.name, bundle.user.callsign, m.title, formatSheetDate(m.awardedAt)]
        : [m.title, formatSheetDate(m.awardedAt)],
    );
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addPremiumsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle, bulk = false) {
  const sheet = bulk
    ? getOrCreateBulkSheet(
        workbook,
        "Премии",
        [{ width: 28 }, { width: 16 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 18 }],
        ["Сотрудник", "Позывной", "Название", "Сумма", "Дата", "Источник"],
      )
    : (() => {
        const created = workbook.addWorksheet("Премии");
        created.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 18 }];
        styleHeaderRow(created.addRow(["Название", "Сумма", "Дата", "Источник"]));
        return created;
      })();
  const rows = bundle.profile?.premiums ?? [];
  if (!rows.length) {
    if (!bulk) {
      const row = sheet.addRow(["Нет записей", "", "", ""]);
      sheet.mergeCells(row.number, 1, row.number, 4);
    }
    return;
  }
  for (const premium of rows) {
    const row = sheet.addRow(
      bulk
        ? [
            bundle.user.name,
            bundle.user.callsign,
            premium.title,
            formatExportMoney(premium.amount),
            formatSheetDate(premium.awardedAt),
            premium.source === "deployment" ? "Командировка" : "Отдельная",
          ]
        : [
            premium.title,
            formatExportMoney(premium.amount),
            formatSheetDate(premium.awardedAt),
            premium.source === "deployment" ? "Командировка" : "Отдельная",
          ],
    );
    row.eachCell((cell) => styleTableCell(cell));
  }
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
    return;
  }

  appendTestsDetailRows(sheet, bundle, false);
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
}

function addActivitySheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle, bulk = false) {
  const sheet = bulk
    ? getOrCreateBulkSheet(
        workbook,
        "Активность",
        [{ width: 28 }, { width: 16 }, { width: 14 }, { width: 24 }, { width: 12 }],
        ["Сотрудник", "Позывной", "Месяц", "Показатель", "Количество"],
      )
    : (() => {
        const created = workbook.addWorksheet("Активность");
        created.columns = [{ width: 14 }, { width: 24 }, { width: 12 }];
        styleHeaderRow(created.addRow(["Месяц", "Показатель", "Количество"]));
        return created;
      })();
  const months = bundle.profile?.activityByMonth ?? [];
  if (!months.length) {
    if (!bulk) {
      const row = sheet.addRow(["Нет данных", "", ""]);
      sheet.mergeCells(row.number, 1, row.number, 3);
    }
    return;
  }
  for (const month of months) {
    if (!month.segments.length) {
      const row = sheet.addRow(bulk ? [bundle.user.name, bundle.user.callsign, month.month, "—", 0] : [month.month, "—", 0]);
      row.eachCell((cell) => styleTableCell(cell));
      continue;
    }
    for (const seg of month.segments) {
      const row = sheet.addRow(
        bulk
          ? [bundle.user.name, bundle.user.callsign, month.month, seg.label, seg.value]
          : [month.month, seg.label, seg.value],
      );
      row.eachCell((cell) => styleTableCell(cell));
    }
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
  sheet.mergeCells(title.number, 1, title.number, 14);
  styleSectionTitle(title.getCell(1));
  title.height = 24;

  sheet.addRow([`Выгрузка: ${meta.exportedAt}`, `Сотрудников: ${bundles.length}`]).eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  });

  const header = sheet.addRow([
    "ФИО",
    "Позывной",
    "Должность",
    "Взвод/Отдел/Мод",
    "Модуль",
    "Место",
    "Трудоустройство",
    "Стаж",
    "Командировки",
    "Дней",
    "Сбития",
    "Премии",
    "Медали",
    "Права",
  ]);
  styleHeaderRow(header, 36);

  for (const bundle of bundles) {
    const p = bundle.profile;
    const row = sheet.addRow([
      bundle.user.name || "—",
      bundle.user.callsign || "—",
      bundle.user.position || "—",
      bundle.user.rotaUnit,
      bundle.user.rotaModule,
      bundle.user.dutyLocation,
      bundle.user.employmentDate,
      bundle.user.employmentDays,
      p?.deploymentsCount ?? 0,
      p?.deploymentDays ?? 0,
      p?.uavHitsTotal ?? 0,
      p ? formatExportMoney(p.premiumsTotal) : "0 ₽",
      p?.medals?.length ?? 0,
      p?.licenseCategories?.length ? p.licenseCategories.join(", ") : "—",
    ]);
    applyCompactRow(row);
    row.eachCell((cell, col) => {
      const centerCols = new Set([5, 9, 10, 11, 13]);
      styleCompactTableCell(cell, centerCols.has(col) ? "center" : "left");
    });
  }
}

function aggregateActivitySummary(bundles: PersonnelProfileExportBundle[]): ExcelChartSlice[] {
  const totals = new Map<string, ExcelChartSlice>();
  for (const bundle of bundles) {
    for (const item of bundle.profile?.activitySummary ?? []) {
      const existing = totals.get(item.key);
      if (existing) {
        existing.value += item.value;
      } else {
        totals.set(item.key, {
          label: item.label,
          value: item.value,
          color: item.color.startsWith("#") ? item.color : "#C42B2B",
        });
      }
    }
  }
  return Array.from(totals.values());
}

function aggregateMonthlyActivity(bundles: PersonnelProfileExportBundle[]) {
  const totals = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const bundle of bundles) {
    for (const month of bundle.profile?.activityByMonth ?? []) {
      labels.set(month.month, month.month);
      totals.set(month.month, (totals.get(month.month) ?? 0) + month.total);
    }
  }
  return Array.from(labels.keys()).map((label) => ({ label, value: totals.get(label) ?? 0 }));
}

function aggregateSummaryStats(bundles: PersonnelProfileExportBundle[]): ExcelChartSlice[] {
  let deployments = 0;
  let hits = 0;
  let medals = 0;
  let premiums = 0;
  for (const bundle of bundles) {
    const p = bundle.profile;
    deployments += p?.deploymentsCount ?? 0;
    hits += p?.uavHitsTotal ?? 0;
    medals += p?.medals?.length ?? 0;
    premiums += p?.premiums?.length ?? 0;
  }
  return [
    { label: "Командировки", value: deployments, color: "#3B82F6" },
    { label: "Сбития БПЛА", value: hits, color: "#C42B2B" },
    { label: "Медали", value: medals, color: "#F59E0B" },
    { label: "Премии (шт.)", value: premiums, color: "#D97706" },
  ];
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

    for (const bundle of bundles) {
      addExamsSheet(workbook, bundle, true);
      addDeploymentsSheet(workbook, bundle, true);
      addMedalsSheet(workbook, bundle, true);
      addPremiumsSheet(workbook, bundle, true);
      addActivitySheet(workbook, bundle, true);
    }
    await addBulkTestsSheet(workbook, bundles);
  } else {
    const bundle = bundles[0];
    if (!bundle) throw new Error("empty_export_bundle");
    addOverviewSheet(workbook, bundle);
    await addChartsSheet(workbook, bundle);
    addExamsSheet(workbook, bundle);
    addDeploymentsSheet(workbook, bundle);
    addMedalsSheet(workbook, bundle);
    addPremiumsSheet(workbook, bundle);
    await addSingleTestsSheet(workbook, bundle);
    addActivitySheet(workbook, bundle);
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

export { employeeLabel };
