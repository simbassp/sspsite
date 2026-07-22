import type { RotaPlatoonFilter, RotaSectionFilter, UnitAssignmentFilter } from "@/lib/unit-assignment";
import { normalizeBroadcastUnitFilter, normalizeUnitAssignment, matchesResultsUnitFilter } from "@/lib/unit-assignment";

export function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export function parseDateParam(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function resolveDateRange(searchParams: URLSearchParams) {
  const rangeParam = searchParams.get("range");

  if (rangeParam === "all") {
    return {
      range: "all" as const,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      startMs: null as number | null,
      endMs: null as number | null,
    };
  }

  if (rangeParam === "today") {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return {
      range: "today" as const,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      startMs: start.getTime(),
      endMs: start.getTime() + 86400000,
    };
  }

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const start = parseDateParam(dateFrom);
  const end = parseDateParam(dateTo);

  if (!start && !end) {
    return {
      range: "all" as const,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      startMs: null as number | null,
      endMs: null as number | null,
    };
  }

  return {
    range: "custom" as const,
    dateFrom: dateFrom && start ? dateFrom : null,
    dateTo: dateTo && end ? dateTo : null,
    startMs: start ? start.getTime() : null,
    endMs: end ? end.getTime() + 86400000 : null,
  };
}

export function resolveDateRangeFromBody(body: Record<string, unknown>) {
  const params = new URLSearchParams();
  if (body.range === "today" || body.range === "all") {
    params.set("range", body.range);
  } else {
    if (typeof body.dateFrom === "string" && body.dateFrom) params.set("dateFrom", body.dateFrom);
    if (typeof body.dateTo === "string" && body.dateTo) params.set("dateTo", body.dateTo);
  }
  return resolveDateRange(params);
}

export function buildResultsPeriodBody(input: {
  periodMode: "all" | "today" | "custom";
  dateFrom?: string;
  dateTo?: string;
}) {
  if (input.periodMode === "today") return { range: "today" as const };
  if (input.periodMode === "all") return { range: "all" as const };
  return {
    ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
    ...(input.dateTo ? { dateTo: input.dateTo } : {}),
  };
}

export function appendResultsPeriodParams(
  params: URLSearchParams,
  input: { periodMode: "all" | "today" | "custom"; dateFrom?: string; dateTo?: string },
) {
  if (input.periodMode === "today") {
    params.set("range", "today");
    return;
  }
  if (input.periodMode === "all") {
    params.set("range", "all");
    return;
  }
  if (input.dateFrom) params.set("dateFrom", input.dateFrom);
  if (input.dateTo) params.set("dateTo", input.dateTo);
}

export function resolvePeriodIsoBounds(period: ReturnType<typeof resolveDateRange>) {
  if (period.range === "all") {
    return { startIso: null as string | null, endIso: null as string | null, hasPeriodFilter: false };
  }
  return {
    startIso: period.startMs != null ? new Date(period.startMs).toISOString() : null,
    endIso: period.endMs != null ? new Date(period.endMs).toISOString() : null,
    hasPeriodFilter: period.startMs != null || period.endMs != null,
  };
}

export function timestampInRange(timestamp: string, startMs: number | null, endMs: number | null) {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  if (startMs != null && t < startMs) return false;
  if (endMs != null && t >= endMs) return false;
  return true;
}

export function applyCreatedAtRange<T extends { gte: (col: string, val: string) => T; lt: (col: string, val: string) => T }>(
  query: T,
  startIso: string | null,
  endIso: string | null,
) {
  let next = query;
  if (startIso) next = next.gte("created_at", startIso);
  if (endIso) next = next.lt("created_at", endIso);
  return next;
}

export type AttemptListQuery = {
  page: number;
  pageSize: number;
  typeFilter: "all" | "trial" | "final";
  statusFilter: "all" | "passed" | "failed" | "not_started";
  allowedUserIds: string[] | null;
  startIso: string | null;
  endIso: string | null;
};

export type ResultsListFilters = {
  typeFilter: "all" | "trial" | "final";
  statusFilter: "all" | "passed" | "failed" | "not_started";
  search: string;
  unitFilter: UnitAssignmentFilter;
  rotaPlatoon: RotaPlatoonFilter;
  rotaSection: RotaSectionFilter;
};

export function parseAttemptsQuery(searchParams: URLSearchParams): ResultsListFilters & { page: number; pageSize: number } {
  return {
    page: Math.max(1, Number(searchParams.get("page") || 1) || 1),
    pageSize: Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 10) || 10)),
    typeFilter: (searchParams.get("attemptType") || "all") as "all" | "trial" | "final",
    statusFilter: (searchParams.get("attemptStatus") || "all") as "all" | "passed" | "failed" | "not_started",
    search: (searchParams.get("search") || "").trim().toLowerCase(),
    unitFilter: (searchParams.get("unit") || "all") as UnitAssignmentFilter,
    rotaPlatoon: (searchParams.get("rotaPlatoon") || "all") as RotaPlatoonFilter,
    rotaSection: (searchParams.get("rotaSection") || "all") as RotaSectionFilter,
  };
}

export function parseResultsFiltersFromBody(body: Record<string, unknown>): ResultsListFilters {
  return {
    typeFilter: body.attemptType === "trial" || body.attemptType === "final" ? body.attemptType : "all",
    statusFilter:
      body.attemptStatus === "passed" || body.attemptStatus === "failed" || body.attemptStatus === "not_started"
        ? body.attemptStatus
        : "all",
    search: typeof body.search === "string" ? body.search.trim().toLowerCase() : "",
    unitFilter: normalizeBroadcastUnitFilter(body.unit),
    rotaPlatoon: body.rotaPlatoon === "1" || body.rotaPlatoon === "2" ? body.rotaPlatoon : "all",
    rotaSection: body.rotaSection === "1" || body.rotaSection === "2" || body.rotaSection === "3" || body.rotaSection === "4" ? body.rotaSection : "all",
  };
}

const ATTEMPT_SELECT_STATS = "user_id,type,status";
const ATTEMPT_SELECT_STATS_LEGACY = "user_id,test_type,status";

export type AttemptPeopleStats = {
  passedPeople: number;
  failedPeople: number;
};

export function calcAttemptPeopleStats(
  rows: Array<{ userId: string; status: "passed" | "failed" }>,
): AttemptPeopleStats {
  const passedPeople = new Set<string>();
  const failedPeople = new Set<string>();
  for (const row of rows) {
    if (row.status === "passed") passedPeople.add(row.userId);
    else failedPeople.add(row.userId);
  }
  return {
    passedPeople: passedPeople.size,
    failedPeople: failedPeople.size,
  };
}

const IN_FILTER_CHUNK_SIZE = 80;

function chunkIds(ids: string[], size = IN_FILTER_CHUNK_SIZE) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function runAttemptsQueryChunked(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
  select: string,
  typeColumn: "type" | "test_type",
  options?: { from?: number; to?: number; count?: boolean; limit?: number },
) {
  const ids = query.allowedUserIds;
  if (!ids || ids.length <= IN_FILTER_CHUNK_SIZE) {
    return runAttemptsQuery(supabase, query, select, typeColumn, options);
  }

  if (options?.from != null || options?.count) {
    return runAttemptsQuery(supabase, query, select, typeColumn, options);
  }

  const parts = await Promise.all(
    chunkIds(ids).map((chunk) =>
      runAttemptsQuery(supabase, { ...query, allowedUserIds: chunk }, select, typeColumn, options),
    ),
  );
  const firstError = parts.find((part) => part.error)?.error;
  if (firstError) return { data: null, count: null, error: firstError };

  const data = parts.flatMap((part) => (Array.isArray(part.data) ? part.data : []));
  return { data, count: data.length, error: null };
}

export async function fetchAttemptsForPeopleStats(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
  maxRows = 10000,
) {
  if (query.statusFilter === "not_started") {
    return [] as Array<{ userId: string; status: "passed" | "failed" }>;
  }
  if (query.allowedUserIds && query.allowedUserIds.length === 0) {
    return [] as Array<{ userId: string; status: "passed" | "failed" }>;
  }

  let res = await runAttemptsQueryChunked(supabase, query, ATTEMPT_SELECT_STATS, "type", { limit: maxRows });
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await runAttemptsQueryChunked(supabase, query, ATTEMPT_SELECT_STATS_LEGACY, "test_type", { limit: maxRows });
  }
  if (res.error) throw new Error(res.error.message);

  return ((res.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      userId: String(row.user_id),
      status: row.status === "passed" ? ("passed" as const) : ("failed" as const),
    }))
    .filter((row) => row.userId);
}

const ATTEMPT_SELECT_FULL =
  "id,user_id,type,status,score,created_at,questions_total,questions_correct,final_attempt_index";
const ATTEMPT_SELECT_MID = "id,user_id,type,status,score,created_at";
const ATTEMPT_SELECT_LEGACY = "id,user_id,test_type,status,score,created_at";
const EXPORT_BATCH_SIZE = 1000;

async function runAttemptsQueryWithFallbacks(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
  options?: { from?: number; to?: number; count?: boolean; limit?: number },
) {
  let res = await runAttemptsQuery(supabase, query, ATTEMPT_SELECT_FULL, "type", options);
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await runAttemptsQuery(supabase, query, ATTEMPT_SELECT_MID, "type", options);
  }
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await runAttemptsQuery(supabase, query, ATTEMPT_SELECT_LEGACY, "test_type", options);
  }
  return res;
}

async function runAttemptsQuery(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
  select: string,
  typeColumn: "type" | "test_type",
  options?: { from?: number; to?: number; count?: boolean; limit?: number },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase.from("test_results") as any)
    .select(select, options?.count ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });
  if (query.allowedUserIds?.length) q = q.in("user_id", query.allowedUserIds);
  if (query.typeFilter !== "all") q = q.eq(typeColumn, query.typeFilter);
  if (query.statusFilter !== "all" && query.statusFilter !== "not_started") q = q.eq("status", query.statusFilter);
  q = applyCreatedAtRange(q, query.startIso, query.endIso);
  if (options?.from != null && options?.to != null) q = q.range(options.from, options.to);
  if (options?.limit != null) q = q.limit(options.limit);
  return q as Promise<{ data: unknown[] | null; count?: number | null; error: { message: string } | null }>;
}

export async function fetchAttemptsPage(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
) {
  if (query.statusFilter === "not_started") {
    return { rows: [] as Array<Record<string, unknown>>, total: 0 };
  }
  if (query.allowedUserIds && query.allowedUserIds.length === 0) {
    return { rows: [] as Array<Record<string, unknown>>, total: 0 };
  }

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let res = await runAttemptsQueryWithFallbacks(supabase, query, { from, to, count: true });
  if (res.error) throw new Error(res.error.message);
  return { rows: (res.data ?? []) as Array<Record<string, unknown>>, total: res.count ?? 0 };
}

export async function fetchAllAttemptsForExport(
  supabase: { from: (table: string) => unknown },
  query: AttemptListQuery,
  maxRows = 50000,
) {
  if (query.statusFilter === "not_started") {
    return { rows: [] as Array<Record<string, unknown>>, total: 0 };
  }
  if (query.allowedUserIds && query.allowedUserIds.length === 0) {
    return { rows: [] as Array<Record<string, unknown>>, total: 0 };
  }

  const rows: Array<Record<string, unknown>> = [];
  let total: number | null = null;
  let page = 0;

  while (rows.length < maxRows) {
    const from = page * EXPORT_BATCH_SIZE;
    const to = from + EXPORT_BATCH_SIZE - 1;
    const res = await runAttemptsQueryWithFallbacks(supabase, query, {
      from,
      to,
      count: page === 0,
    });
    if (res.error) throw new Error(res.error.message);
    if (page === 0 && res.count != null) total = res.count;

    const batch = (res.data ?? []) as Array<Record<string, unknown>>;
    if (!batch.length) break;

    rows.push(...batch);
    if (batch.length < EXPORT_BATCH_SIZE) break;
    page += 1;
  }

  return { rows: rows.slice(0, maxRows), total: total ?? rows.length };
}

const ATTEMPT_SELECT_STREAK = "user_id,status,created_at";
const ATTEMPT_SELECT_STREAK_LEGACY = "user_id,status,created_at";

export type ResultsCohortUser = {
  id: string;
  name: string;
  callsign: string;
  unit_assignment?: string | null;
  rota_platoon?: number | null;
  rota_section?: number | null;
};

export function hasResultsUserFilters(filters: ResultsListFilters) {
  return (
    !!filters.search ||
    filters.unitFilter !== "all" ||
    filters.rotaPlatoon !== "all" ||
    filters.rotaSection !== "all"
  );
}

export function filterResultsCohortUserIds(
  users: ResultsCohortUser[],
  filters: ResultsListFilters,
  options: { unitFromDb: boolean; rotaFromDb: boolean },
) {
  return users
    .filter((user) => {
      const unitAssignment = options.unitFromDb ? normalizeUnitAssignment(user.unit_assignment) : null;
      const rotaPlatoon = options.rotaFromDb && user.rota_platoon != null ? Number(user.rota_platoon) : null;
      const rotaSection = options.rotaFromDb && user.rota_section != null ? Number(user.rota_section) : null;
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

export type TrialTripleStreakStats = {
  cohortPeople: number;
  passedPeople: number;
  failedPeople: number;
  byUser: Map<string, boolean>;
  passedCountByUser: Map<string, number>;
};

export function calcTrialTripleStreakStats(
  cohortUserIds: string[],
  attempts: Array<{ userId: string; status: "passed" | "failed"; createdAt: string }>,
): TrialTripleStreakStats {
  const byUserAttempts = new Map<string, Array<{ status: "passed" | "failed"; createdAt: string }>>();
  for (const row of attempts) {
    const list = byUserAttempts.get(row.userId) ?? [];
    list.push({ status: row.status, createdAt: row.createdAt });
    byUserAttempts.set(row.userId, list);
  }

  const byUser = new Map<string, boolean>();
  const passedCountByUser = new Map<string, number>();
  let passedPeople = 0;
  for (const userId of cohortUserIds) {
    const userAttempts = byUserAttempts.get(userId) ?? [];
    let passedCount = 0;
    for (const attempt of userAttempts) {
      if (attempt.status === "passed") passedCount += 1;
    }
    passedCountByUser.set(userId, passedCount);
    const ok = passedCount >= 3;
    byUser.set(userId, ok);
    if (ok) passedPeople += 1;
  }

  return {
    cohortPeople: cohortUserIds.length,
    passedPeople,
    failedPeople: cohortUserIds.length - passedPeople,
    byUser,
    passedCountByUser,
  };
}

type TrialStreakAttempt = { userId: string; status: "passed" | "failed"; createdAt: string };

export async function fetchTrialAttemptsForStreak(
  supabase: { from: (table: string) => unknown },
  query: Pick<AttemptListQuery, "allowedUserIds" | "startIso" | "endIso">,
  maxRows = 10000,
): Promise<TrialStreakAttempt[]> {
  if (query.allowedUserIds && query.allowedUserIds.length === 0) {
    return [];
  }

  if (query.allowedUserIds && query.allowedUserIds.length > IN_FILTER_CHUNK_SIZE) {
    const parts = await Promise.all(
      chunkIds(query.allowedUserIds).map((chunk) =>
        fetchTrialAttemptsForStreak(supabase, { ...query, allowedUserIds: chunk }, maxRows),
      ),
    );
    return parts.flat();
  }

  const trialQuery: AttemptListQuery = {
    page: 1,
    pageSize: maxRows,
    typeFilter: "trial",
    statusFilter: "all",
    allowedUserIds: query.allowedUserIds,
    startIso: query.startIso,
    endIso: query.endIso,
  };

  let res = await runAttemptsQuery(supabase, trialQuery, ATTEMPT_SELECT_STREAK, "type", { limit: maxRows });
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await runAttemptsQuery(supabase, trialQuery, ATTEMPT_SELECT_STREAK_LEGACY, "test_type", { limit: maxRows });
  }
  if (res.error) throw new Error(res.error.message);

  return ((res.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      userId: String(row.user_id),
      status: row.status === "passed" ? ("passed" as const) : ("failed" as const),
      createdAt: String(row.created_at ?? ""),
    }))
    .filter((row) => row.userId && row.createdAt);
}

export function shouldShowTrialTripleStreak(
  typeFilter: ResultsListFilters["typeFilter"],
  statusFilter: ResultsListFilters["statusFilter"],
) {
  return typeFilter !== "final" && statusFilter !== "not_started";
}
