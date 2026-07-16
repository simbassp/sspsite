import type { PersonnelProfileExportBundle } from "@/lib/personnel-profile-export-server";
import { formatExportDuration, formatExportMoney } from "@/lib/personnel-profile-export-server";
import type ExcelJS from "exceljs";

const HEADER_FILL = "FFC42B2B";
const HEADER_FONT = "FFFFFFFF";
const SECTION_FILL = "FFF3F4F6";
const PASS_FILL = "FFD1FAE5";
const FAIL_FILL = "FFFEE2E2";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
  row.height = 22;
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
    ["Логин", bundle.user.login || "—"],
    ["Должность", bundle.user.position || "—"],
    ["Роль", bundle.user.role],
    ["Статус", bundle.user.status],
    ["Подразделение", bundle.user.unitAssignment || "—"],
    ["Взвод / отделение", bundle.user.rotaUnit],
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

function addExamsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Зачёты");
  sheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const header = sheet.addRow(["Зачёт", "Статус", "Дата сдачи", "Действует до"]);
  styleHeaderRow(header);
  for (const exam of bundle.exams) {
    const row = sheet.addRow([exam.label, exam.status, exam.passedAt, exam.expiresAt]);
    row.eachCell((cell) => styleTableCell(cell));
    const statusCell = row.getCell(2);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: exam.status === "Сдан" ? PASS_FILL : FAIL_FILL },
    };
    statusCell.font = { bold: true };
  }
}

function addDeploymentsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Командировки");
  sheet.columns = [{ width: 18 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 16 }];
  const header = sheet.addRow(["Дата начала", "Дата окончания", "Дней", "Сбитий", "Премия"]);
  styleHeaderRow(header);
  const rows = bundle.profile?.deployments ?? [];
  if (!rows.length) {
    const row = sheet.addRow(["Нет записей", "", "", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 5);
    return;
  }
  for (const d of rows) {
    const row = sheet.addRow([
      formatSheetDate(d.dateFrom),
      formatSheetDate(d.dateTo),
      d.days,
      d.uavHits,
      formatExportMoney(d.premiumAmount),
    ]);
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addMedalsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Медали");
  sheet.columns = [{ width: 40 }, { width: 16 }];
  const header = sheet.addRow(["Название", "Дата"]);
  styleHeaderRow(header);
  const rows = bundle.profile?.medals ?? [];
  if (!rows.length) {
    const row = sheet.addRow(["Нет записей", ""]);
    return;
  }
  for (const m of rows) {
    const row = sheet.addRow([m.title, formatSheetDate(m.awardedAt)]);
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addPremiumsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Премии");
  sheet.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 18 }];
  const header = sheet.addRow(["Название", "Сумма", "Дата", "Источник"]);
  styleHeaderRow(header);
  const rows = bundle.profile?.premiums ?? [];
  if (!rows.length) {
    const row = sheet.addRow(["Нет записей", "", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    return;
  }
  for (const p of rows) {
    const row = sheet.addRow([
      p.title,
      formatExportMoney(p.amount),
      formatSheetDate(p.awardedAt),
      p.source === "deployment" ? "Командировка" : "Отдельная",
    ]);
    row.eachCell((cell) => styleTableCell(cell));
  }
}

function addTestsSheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Тесты");
  sheet.columns = [{ width: 18 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 22 }, { width: 12 }];
  const header = sheet.addRow(["Дата", "Тип", "Статус", "Балл", "Результат", "Длительность"]);
  styleHeaderRow(header);
  if (!bundle.testResults.length) {
    const row = sheet.addRow(["Нет попыток", "", "", "", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 6);
    return;
  }
  for (const t of bundle.testResults) {
    const row = sheet.addRow([
      t.createdAt,
      t.type === "final" ? "Итоговый" : "Пробный",
      t.status === "passed" ? "Сдан" : "Не сдан",
      t.score,
      t.resultText,
      formatExportDuration(t.durationSeconds),
    ]);
    row.eachCell((cell) => styleTableCell(cell));
    const statusCell = row.getCell(3);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: t.status === "passed" ? PASS_FILL : FAIL_FILL },
    };
    statusCell.font = { bold: true };
  }
}

function addActivitySheet(workbook: ExcelJS.Workbook, bundle: PersonnelProfileExportBundle) {
  const sheet = workbook.addWorksheet("Активность");
  sheet.columns = [{ width: 14 }, { width: 24 }, { width: 12 }];
  const header = sheet.addRow(["Месяц", "Показатель", "Количество"]);
  styleHeaderRow(header);
  const months = bundle.profile?.activityByMonth ?? [];
  if (!months.length) {
    const row = sheet.addRow(["Нет данных", "", ""]);
    sheet.mergeCells(row.number, 1, row.number, 3);
    return;
  }
  for (const month of months) {
    if (!month.segments.length) {
      const row = sheet.addRow([month.month, "—", 0]);
      row.eachCell((cell) => styleTableCell(cell));
      continue;
    }
    for (const seg of month.segments) {
      const row = sheet.addRow([month.month, seg.label, seg.value]);
      row.eachCell((cell) => styleTableCell(cell));
    }
  }
}

export async function buildPersonnelProfileExcelBuffer(bundle: PersonnelProfileExportBundle) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSP";
  workbook.created = new Date();
  workbook.modified = new Date();

  addOverviewSheet(workbook, bundle);
  addExamsSheet(workbook, bundle);
  addDeploymentsSheet(workbook, bundle);
  addMedalsSheet(workbook, bundle);
  addPremiumsSheet(workbook, bundle);
  addTestsSheet(workbook, bundle);
  addActivitySheet(workbook, bundle);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
