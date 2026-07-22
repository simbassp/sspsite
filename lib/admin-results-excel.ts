import type ExcelJS from "exceljs";
import type { ResultsExportColumn, ResultsExportColumnKey, ResultsAttemptExportRow, ResultsNotStartedExportRow } from "@/lib/admin-results-export";
import {
  buildResultsExportSummaryLines,
  resolveResultsExportColumns,
  resultsAttemptCellValue,
  resultsNotStartedCellValue,
  type ResultsExportFilterConfig,
} from "@/lib/admin-results-export";

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

function styleStatusCell(cell: ExcelJS.Cell, status: "passed" | "failed" | "not_started") {
  if (status === "passed") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PASS_FILL } };
  } else if (status === "failed") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
  }
}

const NUMERIC_KEYS = new Set<ResultsExportColumnKey>(["attemptIndex", "usedAttempts", "maxAttempts", "trialPassedCount"]);

function applySheetTableFilters(sheet: ExcelJS.Worksheet, columnCount: number) {
  if (sheet.rowCount < 1 || columnCount < 1) return;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: columnCount },
  };
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
}

export async function buildResultsExcelBuffer(input: {
  config: ResultsExportFilterConfig;
  filterLines: string[];
  attemptRows: ResultsAttemptExportRow[];
  notStartedRows: ResultsNotStartedExportRow[];
  attemptsTotal: number;
  trialTripleStreakStats?: import("@/lib/admin-results-query").TrialTripleStreakStats | null;
}) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSP PVO";
  workbook.created = new Date();

  const columns = resolveResultsExportColumns(input.config);
  const summaryLines = buildResultsExportSummaryLines(input);
  const sheetName = input.config.statusFilter === "not_started" ? "Не проходил итог" : "Попытки";

  const summary = workbook.addWorksheet("Сводка");
  summary.columns = [{ width: 28 }, { width: 52 }];
  const title = summary.addRow(["Результаты тестов", ""]);
  styleSectionTitle(title.getCell(1));
  summary.mergeCells(title.number, 1, title.number, 2);
  title.height = 24;

  for (const line of input.filterLines) {
    const row = summary.addRow([line, ""]);
    summary.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { size: 10, color: { argb: "FF374151" } };
  }

  if (summaryLines.length > 0) {
    summary.addRow([]);
    const totalsTitle = summary.addRow(["Итого по выгрузке", ""]);
    styleSectionTitle(totalsTitle.getCell(1));
    summary.mergeCells(totalsTitle.number, 1, totalsTitle.number, 2);
    for (const [label, value] of summaryLines) {
      summary.addRow([label, value]);
    }
  }

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({ width: column.width }));

  const header = sheet.addRow(columns.map((column) => column.header));
  styleHeaderRow(header, 32);

  if (input.config.statusFilter === "not_started") {
    for (const row of input.notStartedRows) {
      const dataRow = sheet.addRow(columns.map((column) => resultsNotStartedCellValue(row, column.key)));
      applyCompactRow(dataRow);
      dataRow.eachCell((cell, col) => {
        const column = columns[col - 1];
        if (!column) return;
        styleCompactTableCell(cell, NUMERIC_KEYS.has(column.key) ? "center" : "left");
        if (column.key === "status") styleStatusCell(cell, "not_started");
      });
    }
  } else {
    for (const row of input.attemptRows) {
      const dataRow = sheet.addRow(columns.map((column) => resultsAttemptCellValue(row, column.key)));
      applyCompactRow(dataRow);
      dataRow.eachCell((cell, col) => {
        const column = columns[col - 1];
        if (!column) return;
        styleCompactTableCell(cell, NUMERIC_KEYS.has(column.key) ? "center" : "left");
        if (column.key === "status") styleStatusCell(cell, row.status);
        if (column.key === "trialPassedCount") {
          styleStatusCell(cell, (row.trialPassedCount ?? 0) >= 3 ? "passed" : "failed");
        }
      });
    }
  }

  applySheetTableFilters(sheet, columns.length);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildResultsExportFilename(config: ResultsExportFilterConfig) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (config.statusFilter === "not_started") return `results-not-started-${stamp}.xlsx`;
  if (config.typeFilter === "trial") return `results-trial-${stamp}.xlsx`;
  if (config.typeFilter === "final") return `results-final-${stamp}.xlsx`;
  return `results-${stamp}.xlsx`;
}
