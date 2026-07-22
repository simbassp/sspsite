import { buildFinalAttemptIndexLookup } from "@/lib/final-attempt-index";
import { effectiveFinalCountingFromUtc, nextAutoResetUtcIso } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import {
  applyCreatedAtRange,
  calcAttemptPeopleStats,
  calcTrialTripleStreakStats,
  fetchAttemptsForPeopleStats,
  fetchAttemptsPage,
  fetchTrialAttemptsForStreak,
  isMissingColumnError,
  parseAttemptsQuery,
  resolveDateRange,
  resolvePeriodIsoBounds,
  shouldShowTrialTripleStreak,
  timestampInRange,
  type ResultsListFilters,
} from "@/lib/admin-results-query";
import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import {
  matchesResultsUnitFilter,
  normalizeUnitAssignment,
  type RotaPlatoonFilter,
  type RotaSectionFilter,
  type UnitAssignmentFilter,
} from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppUserListRow = {
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
  profile_name_color?: string | null;
};

export type ResultsUserSummary = {
  userId: string;
  name: string;
  callsign: string;
  nameColor: ProfileNameColorId | null;
  cosmetics: Record<string, unknown>;
  position: string;
  unitAssignment: UnitAssignment | null;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  status: "passed" | "failed" | "not_started";
  scorePercent: number | null;
  questionsCorrect: number | null;
  questionsTotal: number | null;
  latestFinalAt: string | null;
  usedFinalAttempts: number;
  maxFinalAttempts: number;
  showResetAttempts: boolean;
};

export type ResultsBannerStats = {
  passedCount: number;
  lastPassed: {
    name: string;
    callsign: string;
    nameColor: ProfileNameColorId | null;
    cosmetics: Record<string, unknown>;
    at: string;
  } | null;
  notPassedCount: number;
  lastNotPassed: {
    name: string;
    callsign: string;
    nameColor: ProfileNameColorId | null;
    cosmetics: Record<string, unknown>;
    at: string;
  } | null;
  trialAttemptsCount: number;
  lastTrial: {
    name: string;
    callsign: string;
    nameColor: ProfileNameColorId | null;
    cosmetics: Record<string, unknown>;
    at: string;
  } | null;
  finalAttemptsCount: number;
  lastFinal: {
    name: string;
    callsign: string;
    nameColor: ProfileNameColorId | null;
    cosmetics: Record<string, unknown>;
    at: string;
  } | null;
};

type NormalizedFinalRow = {
  id: string;
  user_id: string;
  status: "passed" | "failed";
  score: number;
  created_at: string;
  questions_total: number | null;
  questions_correct: number | null;
};

type BootstrapContext = {
  supabase: ReturnType<typeof getServerSupabaseServiceClient>;
  period: ReturnType<typeof resolveDateRange>;
  startIso: string | null;
  endIso: string | null;
  hasPeriodFilter: boolean;
  attemptsQuery: ReturnType<typeof parseAttemptsQuery>;
  viewerCanResetAttempts: boolean;
  viewerIsAdmin: boolean;
  users: AppUserListRow[];
  unitFromDb: boolean;
  rotaFromDb: boolean;
  cosmeticsMap: Awaited<ReturnType<typeof loadIdentityCosmeticsMap>>;
  userById: Map<
    string,
    {
      name: string;
      callsign: string;
      nameColor: ProfileNameColorId | null;
      cosmetics: Record<string, unknown>;
      position: string;
      unitAssignment: UnitAssignment | null;
      rotaPlatoon: number | null;
      rotaSection: number | null;
    }
  >;
  cohortUserIds: string[];
  allowedUserIds: string[] | null;
  listQuery: {
    typeFilter: ResultsListFilters["typeFilter"];
    statusFilter: ResultsListFilters["statusFilter"];
    allowedUserIds: string[] | null;
    startIso: string | null;
    endIso: string | null;
  };
  needTrialStats: boolean;
};

export async function loadResultsBootstrapContext(
  url: URL,
  options: { viewerCanResetAttempts: boolean; viewerIsAdmin: boolean },
): Promise<BootstrapContext> {
  const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 90_000 });
  const period = resolveDateRange(url.searchParams);
  const { startIso, endIso, hasPeriodFilter } = resolvePeriodIsoBounds(period);
  const attemptsQuery = parseAttemptsQuery(url.searchParams);

  const usersPrimary = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,role,status,final_test_counting_from,unit_assignment,rota_platoon,rota_section,profile_name_color",
    )
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

  const users = usersRows;
  const cosmeticsMap = await loadIdentityCosmeticsMap(users.map((u) => u.id));
  const userById = new Map(
    users.map((u) => [
      u.id,
      {
        name: u.name,
        callsign: u.callsign,
        nameColor: normalizeProfileNameColor(u.profile_name_color),
        cosmetics: cosmeticsMap.get(u.id) ?? {},
        position: String(u.position ?? ""),
        unitAssignment: unitFromDb ? normalizeUnitAssignment(u.unit_assignment) : null,
        rotaPlatoon: rotaFromDb && u.rota_platoon != null ? Number(u.rota_platoon) : null,
        rotaSection: rotaFromDb && u.rota_section != null ? Number(u.rota_section) : null,
      },
    ]),
  );

  const rosterUsers = users.filter((u) => u.role === "employee" || u.role === "admin");
  const hasUserFilter =
    !!attemptsQuery.search ||
    attemptsQuery.unitFilter !== "all" ||
    attemptsQuery.rotaPlatoon !== "all" ||
    attemptsQuery.rotaSection !== "all";

  const filteredUserIds = rosterUsers
    .filter((user) => {
      const unitAssignment = unitFromDb ? normalizeUnitAssignment(user.unit_assignment) : null;
      const rotaPlatoon = rotaFromDb && user.rota_platoon != null ? Number(user.rota_platoon) : null;
      const rotaSection = rotaFromDb && user.rota_section != null ? Number(user.rota_section) : null;
      if (
        !matchesResultsUnitFilter(attemptsQuery.unitFilter, attemptsQuery.rotaPlatoon, attemptsQuery.rotaSection, {
          unitAssignment,
          rotaPlatoon,
          rotaSection,
        })
      ) {
        return false;
      }
      if (!attemptsQuery.search) return true;
      return (
        user.name.toLowerCase().includes(attemptsQuery.search) ||
        user.callsign.toLowerCase().includes(attemptsQuery.search)
      );
    })
    .map((user) => user.id);

  const cohortUserIds = hasUserFilter ? filteredUserIds : rosterUsers.map((user) => user.id);
  const allowedUserIds = hasUserFilter ? filteredUserIds : null;

  return {
    supabase,
    period,
    startIso,
    endIso,
    hasPeriodFilter,
    attemptsQuery,
    viewerCanResetAttempts: options.viewerCanResetAttempts,
    viewerIsAdmin: options.viewerIsAdmin,
    users,
    unitFromDb,
    rotaFromDb,
    cosmeticsMap,
    userById,
    cohortUserIds,
    allowedUserIds,
    listQuery: {
      typeFilter: attemptsQuery.typeFilter,
      statusFilter: attemptsQuery.statusFilter,
      allowedUserIds,
      startIso,
      endIso,
    },
    needTrialStats: shouldShowTrialTripleStreak(attemptsQuery.typeFilter, attemptsQuery.statusFilter),
  };
}

async function fetchFinalResultsForSummaries(
  supabase: SupabaseClient,
  startIso: string | null,
  endIso: string | null,
): Promise<Array<Record<string, unknown>>> {
  const selectFull = "id,user_id,type,status,score,created_at,questions_total,questions_correct";
  const selectMid = "id,user_id,type,status,score,created_at";

  const full = await applyCreatedAtRange(
    supabase
      .from("test_results")
      .select(selectFull)
      .eq("type", "final")
      .order("created_at", { ascending: false })
      .limit(10000),
    startIso,
    endIso,
  );
  if (!full.error) return (full.data ?? []) as Array<Record<string, unknown>>;

  if (!isMissingColumnError(full.error.message)) throw new Error(full.error.message);

  const mid = await applyCreatedAtRange(
    supabase
      .from("test_results")
      .select(selectMid)
      .eq("type", "final")
      .order("created_at", { ascending: false })
      .limit(10000),
    startIso,
    endIso,
  );
  if (mid.error) throw new Error(mid.error.message);
  return (mid.data ?? []) as Array<Record<string, unknown>>;
}

function buildSummaries(ctx: BootstrapContext, finalRows: NormalizedFinalRow[]): ResultsUserSummary[] {
  const finalsByUser = new Map<string, NormalizedFinalRow[]>();
  for (const row of finalRows) {
    const list = finalsByUser.get(row.user_id) ?? [];
    list.push(row);
    finalsByUser.set(row.user_id, list);
  }

  return ctx.users
    .filter((u) => u.role === "employee" || u.role === "admin")
    .map((user) => {
      const userFinals = finalsByUser.get(user.id) ?? [];
      const from = effectiveFinalCountingFromUtc(user.final_test_counting_from ?? null);
      const finalsSince = userFinals.filter((r) => new Date(r.created_at).getTime() >= new Date(from).getTime());
      const hasPassedFinal = finalsSince.some((r) => r.status === "passed");
      const sortedDesc = [...finalsSince].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      const latestFinal = sortedDesc[0];
      const latestFinalAt = latestFinal?.created_at ?? null;

      let statusLabel: "passed" | "failed" | "not_started";
      if (hasPassedFinal) statusLabel = "passed";
      else if (finalsSince.length > 0) statusLabel = "failed";
      else statusLabel = "not_started";

      return {
        userId: user.id,
        name: user.name,
        callsign: user.callsign,
        nameColor: normalizeProfileNameColor(user.profile_name_color),
        cosmetics: ctx.cosmeticsMap.get(user.id) ?? {},
        position: String(user.position ?? ""),
        unitAssignment: ctx.unitFromDb ? normalizeUnitAssignment(user.unit_assignment) : null,
        rotaPlatoon: ctx.rotaFromDb && user.rota_platoon != null ? Number(user.rota_platoon) : null,
        rotaSection: ctx.rotaFromDb && user.rota_section != null ? Number(user.rota_section) : null,
        status: statusLabel,
        scorePercent: latestFinal ? latestFinal.score : null,
        questionsCorrect: latestFinal?.questions_correct ?? null,
        questionsTotal: latestFinal?.questions_total ?? null,
        latestFinalAt,
        usedFinalAttempts: finalsSince.length,
        maxFinalAttempts: FINAL_TEST_MAX_ATTEMPTS,
        showResetAttempts: ctx.viewerCanResetAttempts,
      };
    })
    .filter((s) => {
      if (!ctx.hasPeriodFilter) return true;
      if (!s.latestFinalAt) return false;
      return timestampInRange(s.latestFinalAt, ctx.period.startMs, ctx.period.endMs);
    });
}

async function fetchSqlBannerParts(ctx: BootstrapContext) {
  const { supabase, startIso, endIso } = ctx;

  const [trialCountRes, trialLastRes, finalCountRes, finalLastRes] = await Promise.all([
    applyCreatedAtRange(
      supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "trial"),
      startIso,
      endIso,
    ),
    applyCreatedAtRange(
      supabase.from("test_results").select("user_id,created_at").eq("type", "trial"),
      startIso,
      endIso,
    )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    applyCreatedAtRange(
      supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "final"),
      startIso,
      endIso,
    ),
    applyCreatedAtRange(
      supabase.from("test_results").select("user_id,created_at").eq("type", "final"),
      startIso,
      endIso,
    )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const trialRow = trialLastRes.data as { user_id?: string; created_at?: string } | null;
  const finalRow = finalLastRes.data as { user_id?: string; created_at?: string } | null;
  const trialUser = trialRow?.user_id ? ctx.userById.get(String(trialRow.user_id)) : undefined;
  const finalUser = finalRow?.user_id ? ctx.userById.get(String(finalRow.user_id)) : undefined;

  return {
    trialAttemptsCount: trialCountRes.count ?? 0,
    lastTrial:
      trialRow?.created_at && trialUser
        ? {
            name: trialUser.name,
            callsign: trialUser.callsign,
            nameColor: trialUser.nameColor,
            cosmetics: trialUser.cosmetics ?? {},
            at: String(trialRow.created_at),
          }
        : trialRow?.created_at
          ? { name: "—", callsign: "", nameColor: null, cosmetics: {}, at: String(trialRow.created_at) }
          : null,
    finalAttemptsCount: finalCountRes.count ?? 0,
    lastFinal:
      finalRow?.created_at && finalUser
        ? {
            name: finalUser.name,
            callsign: finalUser.callsign,
            nameColor: finalUser.nameColor,
            cosmetics: finalUser.cosmetics ?? {},
            at: String(finalRow.created_at),
          }
        : finalRow?.created_at
          ? { name: "—", callsign: "", nameColor: null, cosmetics: {}, at: String(finalRow.created_at) }
          : null,
  };
}

function buildBannerFromSummaries(
  ctx: BootstrapContext,
  summaries: ResultsUserSummary[],
  sqlParts: Awaited<ReturnType<typeof fetchSqlBannerParts>>,
): ResultsBannerStats {
  const passedSummaries = summaries.filter((s) => s.status === "passed");
  const failedSummaries = summaries.filter((s) => s.status === "failed");
  const notStartedSummaries = summaries.filter((s) => s.status === "not_started");

  const lastPassed = passedSummaries.reduce<ResultsBannerStats["lastPassed"]>((best, s) => {
    if (!s.latestFinalAt) return best;
    if (!best || new Date(s.latestFinalAt) > new Date(best.at)) {
      return {
        name: s.name,
        callsign: s.callsign,
        nameColor: s.nameColor ?? null,
        cosmetics: s.cosmetics ?? {},
        at: s.latestFinalAt,
      };
    }
    return best;
  }, null);

  const lastFailed = failedSummaries.reduce<ResultsBannerStats["lastNotPassed"]>((best, s) => {
    if (!s.latestFinalAt) return best;
    if (!best || new Date(s.latestFinalAt) > new Date(best.at)) {
      return {
        name: s.name,
        callsign: s.callsign,
        nameColor: s.nameColor ?? null,
        cosmetics: s.cosmetics ?? {},
        at: s.latestFinalAt,
      };
    }
    return best;
  }, null);

  return {
    passedCount: passedSummaries.length,
    lastPassed,
    notPassedCount: failedSummaries.length + notStartedSummaries.length,
    lastNotPassed: lastFailed,
    ...sqlParts,
  };
}

async function loadLastResetAudit(ctx: BootstrapContext) {
  if (!ctx.viewerCanResetAttempts && !ctx.viewerIsAdmin) return null;

  const auditQ = await ctx.supabase
    .from("final_attempt_reset_events")
    .select("created_at,target_user_id,admin_user_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (auditQ.error || !auditQ.data) return null;

  const ev = auditQ.data as {
    created_at: string;
    target_user_id: string;
    admin_user_id: string | null;
  };
  const [targetU, adminU] = await Promise.all([
    ctx.supabase.from("app_users").select("name,callsign").eq("id", ev.target_user_id).maybeSingle(),
    ev.admin_user_id
      ? ctx.supabase.from("app_users").select("name,callsign").eq("id", ev.admin_user_id).maybeSingle()
      : Promise.resolve({ data: null as { name?: string; callsign?: string } | null }),
  ]);
  const tn = targetU.data as { name?: string; callsign?: string } | null;
  const an = adminU.data as { name?: string; callsign?: string } | null;
  return {
    created_at: ev.created_at,
    admin_name: an ? `${an.name ?? ""} ${an.callsign ?? ""}`.trim() : "—",
    target_name: tn ? `${tn.name ?? ""} (${tn.callsign ?? ""})`.trim() : "—",
    target_callsign: tn?.callsign ?? "",
  };
}

function mapAttemptRows(
  ctx: BootstrapContext,
  attemptsPageData: { rows: Array<Record<string, unknown>>; total: number },
  latestFinalAtByUser: Map<string, string>,
  finalAttemptIndexById: Map<string, number>,
) {
  const attempts = attemptsPageData.rows
    .map((row) => {
      const userId = String(row.user_id);
      const user = ctx.userById.get(userId);
      if (!user) return null;
      const type = (row.type ?? row.test_type) === "final" ? ("final" as const) : ("trial" as const);
      const createdAt = String(row.created_at ?? "");
      const latestFinalAt = latestFinalAtByUser.get(userId);
      return {
        id: String(row.id),
        userId,
        name: user.name,
        callsign: user.callsign,
        nameColor: user.nameColor,
        cosmetics: user.cosmetics,
        position: user.position,
        unitAssignment: user.unitAssignment,
        rotaPlatoon: user.rotaPlatoon,
        rotaSection: user.rotaSection,
        type,
        status: row.status === "passed" ? ("passed" as const) : ("failed" as const),
        scorePercent: Number(row.score ?? 0),
        questionsCorrect: row.questions_correct != null ? Number(row.questions_correct) : null,
        questionsTotal: row.questions_total != null ? Number(row.questions_total) : null,
        createdAt,
        finalAttemptIndex: type === "final" ? finalAttemptIndexById.get(String(row.id)) ?? null : null,
        showResetAttempts:
          ctx.viewerCanResetAttempts && type === "final" && !!latestFinalAt && createdAt === latestFinalAt,
        canDeleteAttempt: ctx.viewerCanResetAttempts,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    attempts,
    attemptsTotal: attemptsPageData.total,
    attemptsPage: ctx.attemptsQuery.page,
    attemptsPageSize: ctx.attemptsQuery.pageSize,
  };
}

async function loadLatestFinalAtForUsers(ctx: BootstrapContext, userIds: string[]) {
  const latestFinalAtByUser = new Map<string, string>();
  if (!userIds.length) return latestFinalAtByUser;

  const { data, error } = await ctx.supabase
    .from("test_results")
    .select("user_id,created_at")
    .eq("type", "final")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(userIds.length * 8, 400));

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<{ user_id?: string; created_at?: string }>) {
    const userId = String(row.user_id ?? "");
    const createdAt = String(row.created_at ?? "");
    if (!userId || !createdAt || latestFinalAtByUser.has(userId)) continue;
    latestFinalAtByUser.set(userId, createdAt);
  }

  return latestFinalAtByUser;
}

async function loadFinalAttemptIndexForPage(ctx: BootstrapContext, pageRows: Array<Record<string, unknown>>) {
  const userIds = [
    ...new Set(
      pageRows
        .filter((row) => (row.type ?? row.test_type) === "final")
        .map((row) => String(row.user_id))
        .filter(Boolean),
    ),
  ];
  if (!userIds.length) return new Map<string, number>();

  const { data, error } = await ctx.supabase
    .from("test_results")
    .select("id,user_id,created_at")
    .eq("type", "final")
    .in("user_id", userIds)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) throw new Error(error.message);

  const countingFromByUser = new Map(ctx.users.map((u) => [u.id, u.final_test_counting_from ?? null]));
  return buildFinalAttemptIndexLookup(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      created_at: String(r.created_at ?? ""),
    })),
    countingFromByUser,
  );
}

export async function loadResultsBootstrapFast(ctx: BootstrapContext) {
  const [attemptsPageData, sqlParts, lastResetAudit] = await Promise.all([
    fetchAttemptsPage(ctx.supabase, {
      ...ctx.listQuery,
      page: ctx.attemptsQuery.page,
      pageSize: ctx.attemptsQuery.pageSize,
    }),
    fetchSqlBannerParts(ctx),
    loadLastResetAudit(ctx),
  ]);

  const finalAttemptIndexById = await loadFinalAttemptIndexForPage(ctx, attemptsPageData.rows);
  const pageUserIds = [...new Set(attemptsPageData.rows.map((row) => String(row.user_id)).filter(Boolean))];
  const latestFinalAtByUser = await loadLatestFinalAtForUsers(ctx, pageUserIds);

  const attemptPayload = mapAttemptRows(ctx, attemptsPageData, latestFinalAtByUser, finalAttemptIndexById);

  const bannerStats: ResultsBannerStats = {
    passedCount: 0,
    lastPassed: null,
    notPassedCount: 0,
    lastNotPassed: null,
    ...sqlParts,
  };

  return {
    nextAutoResetAt: nextAutoResetUtcIso(),
    summaries: [] as ResultsUserSummary[],
    ...attemptPayload,
    filterPeopleStats: null as { passedPeople: number; failedPeople: number } | null,
    trialTripleStreakStats: null as { cohortPeople: number; passedPeople: number; failedPeople: number } | null,
    lastResetAudit,
    bannerStats,
  };
}

export async function loadResultsBootstrapStats(ctx: BootstrapContext) {
  const finalResultsRaw = await fetchFinalResultsForSummaries(ctx.supabase, ctx.startIso, ctx.endIso);
  const finalRows: NormalizedFinalRow[] = finalResultsRaw.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    status: r.status === "passed" ? ("passed" as const) : ("failed" as const),
    score: Number(r.score ?? 0),
    created_at: String(r.created_at ?? ""),
    questions_total: r.questions_total != null ? Number(r.questions_total) : null,
    questions_correct: r.questions_correct != null ? Number(r.questions_correct) : null,
  }));

  const summaries = buildSummaries(ctx, finalRows);
  const sqlParts = await fetchSqlBannerParts(ctx);
  const bannerStats = buildBannerFromSummaries(ctx, summaries, sqlParts);

  let filterPeopleStats: { passedPeople: number; failedPeople: number } | null = null;
  if (ctx.attemptsQuery.statusFilter !== "not_started" && !ctx.needTrialStats) {
    const peopleStatsRows = await fetchAttemptsForPeopleStats(ctx.supabase, {
      ...ctx.listQuery,
      page: 1,
      pageSize: 10000,
    });
    filterPeopleStats = calcAttemptPeopleStats(peopleStatsRows);
  }

  let trialTripleStreakStats: { cohortPeople: number; passedPeople: number; failedPeople: number } | null = null;
  if (ctx.needTrialStats) {
    const trialAttempts = await fetchTrialAttemptsForStreak(ctx.supabase, {
      allowedUserIds: ctx.allowedUserIds,
      startIso: ctx.startIso,
      endIso: ctx.endIso,
    });
    const streakStats = calcTrialTripleStreakStats(ctx.cohortUserIds, trialAttempts);
    trialTripleStreakStats = {
      cohortPeople: streakStats.cohortPeople,
      passedPeople: streakStats.passedPeople,
      failedPeople: streakStats.failedPeople,
    };
  }

  return {
    summaries,
    bannerStats,
    filterPeopleStats,
    trialTripleStreakStats,
  };
}

export async function loadResultsBootstrapFull(ctx: BootstrapContext) {
  const [fast, stats] = await Promise.all([loadResultsBootstrapFast(ctx), loadResultsBootstrapStats(ctx)]);
  return {
    ...fast,
    ...stats,
  };
}
