import { canManageUsers } from "@/lib/permissions";
import { dutyLocationLabel } from "@/lib/duty-location";
import { rotaUnitLabelCompact } from "@/lib/personnel-catalog";
import {
  loadActiveCompany4UserIds,
  loadPersonnelRoster,
  loadPersonnelRosterCardsByIds,
  resolvePersonnelExportUserIds,
} from "@/lib/personnel-server";
import {
  buildPersonnelBulkExportContentDisposition,
  loadPersonnelProfileExportBundles,
} from "@/lib/personnel-profile-export-server";
import {
  buildPersonnelBulkExcelBuffer,
  buildPersonnelRosterFilterExcelBuffer,
  type PersonnelRosterFilterExportRow,
} from "@/lib/personnel-profile-excel";
import {
  exportIncludesFinalStats,
  exportIncludesTestStats,
  exportIncludesTrialStats,
  hasRosterFocusFilters,
  parseRosterExportFilterConfig,
  resolveRosterExportColumns,
  type RosterExportFilterConfig,
} from "@/lib/personnel-roster-export";
import { getServerSession } from "@/lib/server-auth";
import type { RosterFilterParams } from "@/lib/personnel-roster-filters";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildExportSummaryLines(rows: PersonnelRosterFilterExportRow[], config: RosterExportFilterConfig) {
  const lines: Array<[string, string | number]> = [["Сотрудников", rows.length]];

  if (config.testDate && exportIncludesTestStats(config)) {
    lines.push(["Дата тестов", config.testDate]);
  }

  if (config.dutyStatus !== "all") {
    const deployed = rows.filter((row) => row.dutyLocation === dutyLocationLabel.deployment).length;
    lines.push(["В командировке", deployed]);
    lines.push(["На базе", rows.length - deployed]);
    lines.push([
      "Всего дней в командировке",
      rows.reduce((sum, row) => sum + (row.deploymentDays ?? 0), 0),
    ]);
  }

  if (config.hits !== "all") {
    lines.push(["Всего сбитий", rows.reduce((sum, row) => sum + (row.uavHitsTotal ?? 0), 0)]);
  }

  if (config.premiums !== "all") {
    lines.push(["Сумма премий, ₽", rows.reduce((sum, row) => sum + (row.premiumsTotal ?? 0), 0)]);
  }

  if (exportIncludesTrialStats(config)) {
    lines.push(["Пробных сдано (попыток)", rows.reduce((sum, row) => sum + (row.trialPassed ?? 0), 0)]);
    lines.push(["Пробных не сдано (попыток)", rows.reduce((sum, row) => sum + (row.trialFailed ?? 0), 0)]);
  }

  if (exportIncludesFinalStats(config)) {
    lines.push(["Итоговых сдано (попыток)", rows.reduce((sum, row) => sum + (row.finalPassed ?? 0), 0)]);
    lines.push(["Итоговых не сдано (попыток)", rows.reduce((sum, row) => sum + (row.finalFailed ?? 0), 0)]);
  }

  if (config.examType !== "all") {
    const passed = rows.filter((row) => row.examResult === "Сдан").length;
    lines.push(["Сдано по выбранному зачёту", passed]);
    lines.push(["Не сдано по выбранному зачёту", rows.length - passed]);
  }

  return lines;
}

function buildExportRows(
  cards: Awaited<ReturnType<typeof loadPersonnelRosterCardsByIds>>,
  config: RosterExportFilterConfig,
): PersonnelRosterFilterExportRow[] {
  const includeTrial = exportIncludesTrialStats(config);
  const includeFinal = exportIncludesFinalStats(config);
  const useDateScopedStats = exportIncludesTestStats(config) && config.testDate !== null;

  return cards.map((user) => {
    const stats = useDateScopedStats ? (user.testStatsOnDate ?? user.testStats) : user.testStats;
    const exam = user.exams.find((item) => item.examType === config.examType);
    const examResult =
      exam?.status === "passed" ? "Сдан" : exam?.status === "failed" ? "Не сдан" : "—";

    const row: PersonnelRosterFilterExportRow = {
      name: user.name,
      callsign: user.callsign,
      rotaUnit: rotaUnitLabelCompact(user.rotaPlatoon, user.rotaSection, user.rotaModule),
    };

    if (config.dutyStatus !== "all") {
      row.dutyLocation = dutyLocationLabel[user.dutyLocation];
      row.deploymentsCount = user.deploymentsCount;
      row.deploymentDays = user.deploymentDays;
    }

    if (config.hits !== "all") {
      row.uavHitsTotal = user.uavHitsTotal;
    }

    if (config.premiums !== "all") {
      row.premiumsTotal = user.premiumsTotal;
    }

    if (config.license !== "all") {
      row.licenseCategories = user.licenseCategories.length ? user.licenseCategories.join(", ") : "—";
    }

    if (config.examType !== "all") {
      row.examResult = examResult;
    }

    if (config.testDate && exportIncludesTestStats(config)) {
      row.testDate = config.testDate;
    }

    if (includeTrial) {
      row.trialPassed = stats.trialPassed;
      row.trialFailed = stats.trialFailed;
    }

    if (includeFinal) {
      row.finalPassed = stats.finalPassed;
      row.finalFailed = stats.finalFailed;
    }

    return row;
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    scope?: unknown;
    platoon?: unknown;
    section?: unknown;
    module?: unknown;
    search?: unknown;
    userIds?: unknown;
    testDate?: unknown;
    examType?: unknown;
    examStatus?: unknown;
    license?: unknown;
    trialTest?: unknown;
    finalTest?: unknown;
    hits?: unknown;
    premiums?: unknown;
    dutyStatus?: unknown;
    filterLines?: unknown;
  };

  const scope = raw.scope === "all" || raw.scope === "filter" ? raw.scope : null;
  if (!scope) {
    return Response.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  const exportConfig = parseRosterExportFilterConfig(raw);
  const filterLines = Array.isArray(raw.filterLines)
    ? raw.filterLines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];

  const platoonRaw = raw.platoon;
  const sectionRaw = raw.section;
  const platoon =
    platoonRaw === "all" || platoonRaw === null || platoonRaw === undefined || platoonRaw === ""
      ? ("all" as const)
      : Number(platoonRaw) === 1 || Number(platoonRaw) === 2
        ? (Number(platoonRaw) as 1 | 2)
        : null;
  const section =
    sectionRaw === "all" || sectionRaw === null || sectionRaw === undefined || sectionRaw === ""
      ? ("all" as const)
      : [1, 2, 3, 4].includes(Number(sectionRaw))
        ? (Number(sectionRaw) as 1 | 2 | 3 | 4)
        : null;

  const useRosterFilterExport = scope === "filter" && hasRosterFocusFilters(exportConfig);

  try {
    let userIds: string[] = [];

    if (scope === "all") {
      const idsResult = await loadActiveCompany4UserIds();
      if (!idsResult.ok) {
        return Response.json({ ok: false, error: idsResult.error }, { status: 400 });
      }
      userIds = idsResult.userIds;
    } else {
      const requestedIds = Array.isArray(raw.userIds)
        ? raw.userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

      if (requestedIds.length > 0) {
        const resolved = await resolvePersonnelExportUserIds(requestedIds);
        if (!resolved.ok) {
          return Response.json({ ok: false, error: resolved.error }, { status: 400 });
        }
        userIds = resolved.userIds;
      } else {
        const moduleRaw = raw.module;
        const module =
          moduleRaw === "all" || moduleRaw === null || moduleRaw === undefined || moduleRaw === ""
            ? ("all" as const)
            : Number.isFinite(Number(moduleRaw))
              ? Number(moduleRaw)
              : ("all" as const);
        const roster = await loadPersonnelRoster({
          platoon: platoon ?? "all",
          section: section ?? "all",
          module,
          search: typeof raw.search === "string" ? raw.search : "",
          testDate: exportConfig.testDate ?? undefined,
          mode: "export",
          rosterFilters: {
            examType: exportConfig.examType as RosterFilterParams["examType"],
            examStatus: exportConfig.examStatus,
            license: exportConfig.license as RosterFilterParams["license"],
            trialTest: exportConfig.trialTest,
            finalTest: exportConfig.finalTest,
            hits: exportConfig.hits,
            premiums: exportConfig.premiums,
            dutyStatus: exportConfig.dutyStatus,
          },
        });
        if (!roster.ok) {
          return Response.json({ ok: false, error: roster.error }, { status: 400 });
        }
        userIds = roster.users.map((user) => user.id);
      }
    }

    if (userIds.length === 0) {
      return Response.json({ ok: false, error: "no_users" }, { status: 400 });
    }

    if (useRosterFilterExport) {
      const cards = await loadPersonnelRosterCardsByIds(
        userIds,
        exportIncludesTestStats(exportConfig) ? exportConfig.testDate : null,
      );
      if (!cards.length) {
        return Response.json({ ok: false, error: "no_data" }, { status: 404 });
      }

      const rows = buildExportRows(cards, exportConfig);
      const columns = resolveRosterExportColumns(exportConfig);
      const summaryLines = buildExportSummaryLines(rows, exportConfig);

      const buffer = await buildPersonnelRosterFilterExcelBuffer({
        rows,
        columns,
        filterLines,
        summaryLines,
      });

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": buildPersonnelBulkExportContentDisposition("filter"),
          "cache-control": "no-store",
        },
      });
    }

    const bundles = await loadPersonnelProfileExportBundles(userIds);
    if (!bundles.length) {
      return Response.json({ ok: false, error: "no_data" }, { status: 404 });
    }

    const buffer = await buildPersonnelBulkExcelBuffer(bundles);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": buildPersonnelBulkExportContentDisposition(scope),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[personnel-export-excel]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "export_excel_exception" },
      { status: 500 },
    );
  }
}
