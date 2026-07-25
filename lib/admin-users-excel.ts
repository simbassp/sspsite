import type ExcelJS from "exceljs";
import type { AdminUsersExportRow } from "@/lib/admin-users-export";

const HEADER_FILL = "FFC42B2B";
const HEADER_FONT = "FFFFFFFF";
const SECTION_FILL = "FFF3F4F6";

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

function styleCompactTableCell(cell: ExcelJS.Cell, horizontal: "left" | "center" | "right" = "left") {
  cell.border = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
  cell.alignment = { vertical: "middle", horizontal, wrapText: false };
}

function applyCompactRow(row: ExcelJS.Row, height = 18) {
  row.height = height;
}

function applySheetTableFilters(sheet: ExcelJS.Worksheet, columnCount: number) {
  if (sheet.rowCount < 1 || columnCount < 1) return;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: columnCount },
  };
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
}

export async function buildAdminUsersExcelBuffer(input: {
  rows: AdminUsersExportRow[];
  filterLines: string[];
}) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSP PVO";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Сводка");
  summary.columns = [{ width: 28 }, { width: 52 }];
  const title = summary.addRow(["Пользователи", ""]);
  styleSectionTitle(title.getCell(1));
  summary.mergeCells(title.number, 1, title.number, 2);
  title.height = 24;

  for (const line of input.filterLines) {
    const row = summary.addRow([line, ""]);
    summary.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { size: 10, color: { argb: "FF374151" } };
  }

  summary.addRow([]);
  summary.addRow(["Сотрудников", input.rows.length]);

  const sheet = workbook.addWorksheet("Пользователи");
  sheet.columns = [{ width: 24 }, { width: 16 }, { width: 10 }, { width: 10 }];

  const header = sheet.addRow(["Имя", "Позывной", "Д", "П"]);
  styleHeaderRow(header, 32);

  for (const row of input.rows) {
    const dataRow = sheet.addRow([row.name, row.callsign, row.position, row.unit]);
    applyCompactRow(dataRow);
    dataRow.eachCell((cell) => styleCompactTableCell(cell));
  }

  applySheetTableFilters(sheet, 4);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildAdminUsersExportFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `users-${stamp}.xlsx`;
}
