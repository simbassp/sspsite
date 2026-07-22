import { effectiveFinalCountingFromUtc } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import {
  fetchAllAttemptsForExport,
  isMissingColumnError,
  parseResultsFiltersFromBody,
  resolveDateRangeFromBody,
  type ResultsListFilters,
} from "@/lib/admin-results-query";
import type { ResultsAttemptExportRow, ResultsExportFilterConfig, ResultsNotStartedExportRow } from "@/lib/admin-results-export";
import { buildResultsExportFilterLines } from "@/lib/admin-results-export";
import { normalizeUnitAssignment, matchesResultsUnitFilter } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

type AppUserListRow = {
  id: string;
  name: string;
  callsign: string;
  position?: string;
  role: string;
  status: string;
  final_test_counting_from?: string | null;
  unit_assignment?: string | null;
  rota_platoon?: number | null;
  rota_section?: number | null;
};

async function fetchFinalResultsForSummaries(supabase: ReturnType<typeof getServerSupabaseServiceClient>) {
  const selectFull =
    "id,user_id,type,status,score,created_at,questions_total,questions_correct,final_attempt_index";
  const selectMid = "id,user_id,type,status,score,created_at";
  const selectLegacy = "id,user_id,test_type,status,score,created_at";

  const full = await supabase
    .from("test_results")
    .select(selectFull)
    .eq("type", "final")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (!full.error) return (full.data ?? []) as Array<Record<string, unknown>>;

  if (!isMissingColumnError(full.error.message)) throw new Error(full.error.message);

  const mid = await supabase
    .from("test_results")
    .select(selectMid)
    .eq("type", "final")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (!mid.error) return (mid.data ?? []) as Array<Record<string, unknown>>;

  if (!isMissingColumnError(mid.error.message)) throw new Error(mid.error.message);

  const legacy = await supabase
    .from("test_results")
    .select(selectLegacy)
    .eq("test_type", "final")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.data ?? []) as Array<Record<string, unknown>>;
}

function buildExportConfig(body: Record<string, unknown>): ResultsExportFilterConfig {
  const period = resolveDateRangeFromBody(body);
  const filters = parseResultsFiltersFromBody(body);
  return {
    periodMode: period.range,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    ...filters,
    search: typeof body.search === "string" ? body.search.trim() : filters.search,
  };
}

function filterUserIds(users: AppUserListRow[], filters: ResultsListFilters, unitFromDb: boolean, rotaFromDb: boolean) {
  return users
    .filter((user) => {
      const unitAssignment = unitFromDb ? normalizeUnitAssignment(user.unit_assignment) : null;
      const rotaPlatoon = rotaFromDb && user.rota_platoon != null ? Number(user.rota_platoon) : null;
      const rotaSection = rotaFromDb && user.rota_section != null ? Number(user.rota_section) : null;
      if (
        !matchesResultsUnitFilter(filters.unitFilter, filters.rotaPlatoon, filters.rotaSection, {
          unitAssignment,
          rotaPlatoon,
          rotaSection,
        })
      ) {
        return false;
      }
      if (!filters.search) return true;
      return (
        user.name.toLowerCase().includes(filters.search) ||
        user.callsign.toLowerCase().includes(filters.search)
      );
    })
    .map((user) => user.id);
}

export async function loadResultsExportData(body: Record<string, unknown>) {
  const config = buildExportConfig(body);
  const period = resolveDateRangeFromBody(body);
  const { startMs, endMs } = period;
  const startIso = startMs != null ? new Date(startMs).toISOString() : null;
  const endIso = endMs != null ? new Date(endMs).toISOString() : null;
  const hasPeriodFilter = startMs != null || endMs != null;
  const filters = parseResultsFiltersFromBody(body);

  const supabase = getServerSupabaseServiceClient();

  const usersPrimary = await supabase
    .from("app_users")
    .select("id,name,callsign,position,role,status,final_test_counting_from,unit_assignment,rota_platoon,rota_section")
    .limit(1000);

  let usersRows: AppUserListRow[] | null = usersPrimary.data as AppUserListRow[] | null;
  let usersErr = usersPrimary.error;
  let unitFromDb = true;
  let rotaFromDb = true;

  if (usersErr && isMissingColumnError(usersErr.message)) {
    const usersMid = await supabase
      .from("app_users")
      .select("id,name,callsign,position,role,status,final_test_counting_from,unit_assignment")
      .limit(1000);
    usersRows = usersMid.data as AppUserListRow[] | null;
    usersErr = usersMid.error;
    rotaFromDb = false;
  }

  if (usersErr && isMissingColumnError(usersErr.message)) {
    const usersFallback = await supabase.from("app_users").select("id,name,callsign,role,status").limit(1000);
    usersRows = usersFallback.data as AppUserListRow[] | null;
    usersErr = usersFallback.error;
    unitFromDb = false;
    rotaFromDb = false;
  }

  if (usersErr || !usersRows) {
    throw new Error(usersErr?.message || "users_failed");
  }

  const rosterUsers = usersRows.filter((u) => u.role === "employee" || u.role === "admin");
  const hasUserFilter =
    !!filters.search ||
    filters.unitFilter !== "all" ||
    filters.rotaPlatoon !== "all" ||
    filters.rotaSection !== "all";
  const filteredUserIds = filterUserIds(rosterUsers, filters, unitFromDb, rotaFromDb);

  const userById = new Map<
    string,
    {
      name: string;
      callsign: string;
      position: string;
      unitAssignment: UnitAssignment | null;
      rotaPlatoon: number | null;
      rotaSection: number | null;
    }
  >(
    rosterUsers.map((u) => [
      u.id,
      {
        name: u.name,
        callsign: u.callsign,
        position: String(u.position ?? ""),
        unitAssignment: unitFromDb ? normalizeUnitAssignment(u.unit_assignment) : null,
        rotaPlatoon: rotaFromDb && u.rota_platoon != null ? Number(u.rota_platoon) : null,
        rotaSection: rotaFromDb && u.rota_section != null ? Number(u.rota_section) : null,
      },
    ]),
  );

  if (config.statusFilter === "not_started") {
    if (config.typeFilter === "trial") {
      return {
        config,
        filterLines: buildResultsExportFilterLines(config),
        attemptRows: [] as ResultsAttemptExportRow[],
        notStartedRows: [] as ResultsNotStartedExportRow[],
        attemptsTotal: 0,
      };
    }

    const finalResultsRaw = await fetchFinalResultsForSummaries(supabase);
    const finalsByUser = new Map<string, Array<{ status: "passed" | "failed"; created_at: string }>>();
    for (const row of finalResultsRaw) {
      const userId = String(row.user_id);
      const list = finalsByUser.get(userId) ?? [];
      list.push({
        status: row.status === "passed" ? "passed" : "failed",
        created_at: String(row.created_at ?? ""),
      });
      finalsByUser.set(userId, list);
    }

    const notStartedRows: ResultsNotStartedExportRow[] = [];
    for (const user of rosterUsers) {
      if (hasUserFilter && !filteredUserIds.includes(user.id)) continue;
      const userFinals = finalsByUser.get(user.id) ?? [];
      const from = effectiveFinalCountingFromUtc(user.final_test_counting_from ?? null);
      const finalsSince = userFinals.filter(
        (r) => new Date(r.created_at).getTime() >= new Date(from).getTime(),
      );
      const hasPassedFinal = finalsSince.some((r) => r.status === "passed");
      const latestFinalAt = [...finalsSince].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0]?.created_at ?? null;

      if (hasPassedFinal || finalsSince.length > 0) continue;
      if (hasPeriodFilter) continue;

      const meta = userById.get(user.id);
      if (!meta) continue;
      notStartedRows.push({
        name: meta.name,
        callsign: meta.callsign,
        position: meta.position,
        unitAssignment: meta.unitAssignment,
        rotaPlatoon: meta.rotaPlatoon,
        rotaSection: meta.rotaSection,
        usedFinalAttempts: finalsSince.length,
        maxFinalAttempts: FINAL_TEST_MAX_ATTEMPTS,
      });
    }

    notStartedRows.sort((a, b) => a.name.localeCompare(b.name, "ru"));

    return {
      config,
      filterLines: buildResultsExportFilterLines(config),
      attemptRows: [] as ResultsAttemptExportRow[],
      notStartedRows,
      attemptsTotal: 0,
    };
  }

  const attemptsData = await fetchAllAttemptsForExport(supabase, {
    page: 1,
    pageSize: 10000,
    typeFilter: filters.typeFilter,
    statusFilter: filters.statusFilter,
    allowedUserIds: hasUserFilter ? filteredUserIds : null,
    startIso,
    endIso,
  });

  const attemptRows: ResultsAttemptExportRow[] = attemptsData.rows
    .map((row) => {
      const userId = String(row.user_id);
      const user = userById.get(userId);
      if (!user) return null;
      const type = (row.type ?? row.test_type) === "final" ? ("final" as const) : ("trial" as const);
      return {
        name: user.name,
        callsign: user.callsign,
        position: user.position,
        unitAssignment: user.unitAssignment,
        rotaPlatoon: user.rotaPlatoon,
        rotaSection: user.rotaSection,
        type,
        status: row.status === "passed" ? ("passed" as const) : ("failed" as const),
        scorePercent: Number(row.score ?? 0),
        questionsCorrect: row.questions_correct != null ? Number(row.questions_correct) : null,
        questionsTotal: row.questions_total != null ? Number(row.questions_total) : null,
        createdAt: String(row.created_at ?? ""),
        finalAttemptIndex:
          row.final_attempt_index != null && Number.isFinite(Number(row.final_attempt_index))
            ? Number(row.final_attempt_index)
            : null,
      };
    })
    .filter((row): row is ResultsAttemptExportRow => Boolean(row));

  return {
    config,
    filterLines: buildResultsExportFilterLines(config),
    attemptRows,
    notStartedRows: [] as ResultsNotStartedExportRow[],
    attemptsTotal: attemptsData.total,
  };
}
