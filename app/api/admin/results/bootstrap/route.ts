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
  shouldShowTrialTripleStreak,
  timestampInRange,
} from "@/lib/admin-results-query";
import { canManageResults, canResetTestResults } from "@/lib/permissions";
import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment, matchesResultsUnitFilter, type RotaPlatoonFilter, type RotaSectionFilter, type UnitAssignmentFilter } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Строка пользователя после primary/fallback-select (поле окна попыток может отсутствовать в legacy-схеме). */
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
  profile_name_color?: string | null;
};

async function fetchFinalResultsForSummaries(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
): Promise<Array<Record<string, unknown>>> {
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

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageResults(session) && !canResetTestResults(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const period = resolveDateRange(url.searchParams);
  const { startMs, endMs } = period;
  const startIso = startMs != null ? new Date(startMs).toISOString() : null;
  const endIso = endMs != null ? new Date(endMs).toISOString() : null;
  const hasPeriodFilter = startMs != null || endMs != null;
  const attemptsQuery = parseAttemptsQuery(url.searchParams);
  const viewerIsAdmin = session.role === "admin";
  const viewerCanResetAttempts = canResetTestResults(session);

  try {
    const supabase = getServerSupabaseServiceClient();

    const usersPrimaryPromise = supabase
      .from("app_users")
      .select("id,name,callsign,position,role,status,final_test_counting_from,unit_assignment,rota_platoon,rota_section,profile_name_color")
      .limit(1000);

    const [usersPrimary, finalResultsRaw] = await Promise.all([
      usersPrimaryPromise,
      fetchFinalResultsForSummaries(supabase),
    ]);

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
      return Response.json({ ok: false, error: usersErr?.message || "users_failed" }, { status: 500 });
    }

    const users = usersRows;
    const cosmeticsMap = await loadIdentityCosmeticsMap(users.map((u) => u.id));

    type NormalizedResult = {
      id: string;
      user_id: string;
      type: "trial" | "final";
      status: "passed" | "failed";
      score: number;
      created_at: string;
      questions_total: number | null;
      questions_correct: number | null;
      final_attempt_index: number | null;
    };

    const finalRows: NormalizedResult[] = finalResultsRaw.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      type: "final" as const,
      status: r.status === "passed" ? ("passed" as const) : ("failed" as const),
      score: Number(r.score ?? 0),
      created_at: String(r.created_at ?? ""),
      questions_total: r.questions_total != null ? Number(r.questions_total) : null,
      questions_correct: r.questions_correct != null ? Number(r.questions_correct) : null,
      final_attempt_index:
        r.final_attempt_index != null && Number.isFinite(Number(r.final_attempt_index))
          ? Number(r.final_attempt_index)
          : null,
    }));
    const finalsByUser = new Map<string, NormalizedResult[]>();
    for (const row of finalRows) {
      const list = finalsByUser.get(row.user_id) ?? [];
      list.push(row);
      finalsByUser.set(row.user_id, list);
    }

    /** Сотрудники и администраторы — админ видит себя и может сбросить себе попытки. */
    const summaries = users
      .filter((u) => u.role === "employee" || u.role === "admin")
      .map((user) => {
        const userFinals = finalsByUser.get(user.id) ?? [];
        const from = effectiveFinalCountingFromUtc(user.final_test_counting_from ?? null);
        const finalsSince = userFinals.filter(
          (r) => new Date(r.created_at).getTime() >= new Date(from).getTime(),
        );
        const hasPassedFinal = finalsSince.some((r) => r.status === "passed");
        const sortedDesc = [...finalsSince].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const latestFinal = sortedDesc[0];
        const latestFinalAt = latestFinal?.created_at ?? null;

        const usedFinalAttempts = finalsSince.length;

        const qt = latestFinal?.questions_total ?? null;
        const qc = latestFinal?.questions_correct ?? null;

        /** Сброс доступен пользователям с правом resetResults (в т.ч. для уже сдавших). */
        const showResetAttempts = viewerCanResetAttempts;

        let statusLabel: "passed" | "failed" | "not_started";
        if (hasPassedFinal) statusLabel = "passed";
        else if (finalsSince.length > 0) statusLabel = "failed";
        else statusLabel = "not_started";

        return {
          userId: user.id,
          name: user.name,
          callsign: user.callsign,
          nameColor: normalizeProfileNameColor(user.profile_name_color),
          cosmetics: cosmeticsMap.get(user.id) ?? {},
          position: String(user.position ?? ""),
          unitAssignment: unitFromDb ? normalizeUnitAssignment(user.unit_assignment) : null,
          rotaPlatoon: rotaFromDb && user.rota_platoon != null ? Number(user.rota_platoon) : null,
          rotaSection: rotaFromDb && user.rota_section != null ? Number(user.rota_section) : null,
          status: statusLabel,
          scorePercent: latestFinal ? latestFinal.score : null,
          questionsCorrect: qc,
          questionsTotal: qt,
          latestFinalAt,
          usedFinalAttempts,
          maxFinalAttempts: FINAL_TEST_MAX_ATTEMPTS,
          showResetAttempts,
        };
      })
      .filter((s) => {
        if (!hasPeriodFilter) return true;
        if (!s.latestFinalAt) return false;
        return timestampInRange(s.latestFinalAt, startMs, endMs);
      });

    let lastResetAudit: {
      created_at: string;
      admin_name: string;
      target_name: string;
      target_callsign: string;
    } | null = null;

    if (viewerCanResetAttempts || viewerIsAdmin) {
      const auditQ = await supabase
        .from("final_attempt_reset_events")
        .select("created_at,target_user_id,admin_user_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!auditQ.error && auditQ.data) {
        const ev = auditQ.data as {
          created_at: string;
          target_user_id: string;
          admin_user_id: string | null;
        };
        const [targetU, adminU] = await Promise.all([
          supabase.from("app_users").select("name,callsign").eq("id", ev.target_user_id).maybeSingle(),
          ev.admin_user_id
            ? supabase.from("app_users").select("name,callsign").eq("id", ev.admin_user_id).maybeSingle()
            : Promise.resolve({ data: null as { name?: string; callsign?: string } | null }),
        ]);
        const tn = targetU.data as { name?: string; callsign?: string } | null;
        const an = adminU.data as { name?: string; callsign?: string } | null;
        lastResetAudit = {
          created_at: ev.created_at,
          admin_name: an ? `${an.name ?? ""} ${an.callsign ?? ""}`.trim() : "—",
          target_name: tn ? `${tn.name ?? ""} (${tn.callsign ?? ""})`.trim() : "—",
          target_callsign: tn?.callsign ?? "",
        };
      }
    }

    const userById = new Map<
      string,
      {
        name: string;
        callsign: string;
        nameColor: ProfileNameColorId | null;
        cosmetics: NonNullable<ReturnType<typeof cosmeticsMap.get>>;
        position: string;
        unitAssignment: UnitAssignment | null;
        rotaPlatoon: number | null;
        rotaSection: number | null;
      }
    >(
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

    const latestFinalAtByUser = new Map<string, string>();
    for (const summary of summaries) {
      if (summary.latestFinalAt) latestFinalAtByUser.set(summary.userId, summary.latestFinalAt);
    }

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
          !matchesResultsUnitFilter(
            attemptsQuery.unitFilter,
            attemptsQuery.rotaPlatoon,
            attemptsQuery.rotaSection,
            { unitAssignment, rotaPlatoon, rotaSection },
          )
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
    const listQuery = {
      typeFilter: attemptsQuery.typeFilter,
      statusFilter: attemptsQuery.statusFilter,
      allowedUserIds,
      startIso,
      endIso,
    };
    const needTrialStats = shouldShowTrialTripleStreak(attemptsQuery.typeFilter, attemptsQuery.statusFilter);

    const fetchTrialCount = async () => {
      let res = await applyCreatedAtRange(
        supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "trial"),
        startIso,
        endIso,
      );
      if (res.error && isMissingColumnError(res.error.message)) {
        res = await applyCreatedAtRange(
          supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "trial"),
          startIso,
          endIso,
        );
      }
      return res;
    };

    const fetchTrialLast = async () => {
      let res = await applyCreatedAtRange(
        supabase.from("test_results").select("user_id,created_at").eq("type", "trial"),
        startIso,
        endIso,
      ).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (res.error && isMissingColumnError(res.error.message)) {
        res = await applyCreatedAtRange(
          supabase.from("test_results").select("user_id,created_at").eq("test_type", "trial"),
          startIso,
          endIso,
        ).order("created_at", { ascending: false }).limit(1).maybeSingle();
      }
      return res;
    };

    const fetchFinalCount = async () => {
      let res = await applyCreatedAtRange(
        supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "final"),
        startIso,
        endIso,
      );
      if (res.error && isMissingColumnError(res.error.message)) {
        res = await applyCreatedAtRange(
          supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "final"),
          startIso,
          endIso,
        );
      }
      return res;
    };

    const fetchFinalLast = async () => {
      let res = await applyCreatedAtRange(
        supabase.from("test_results").select("user_id,created_at").eq("type", "final"),
        startIso,
        endIso,
      ).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (res.error && isMissingColumnError(res.error.message)) {
        res = await applyCreatedAtRange(
          supabase.from("test_results").select("user_id,created_at").eq("test_type", "final"),
          startIso,
          endIso,
        ).order("created_at", { ascending: false }).limit(1).maybeSingle();
      }
      return res;
    };

    const [
      attemptsPageData,
      trialAttempts,
      trialCountRes,
      trialLastRes,
      finalCountRes,
      finalLastRes,
    ] = await Promise.all([
      fetchAttemptsPage(supabase, {
        ...listQuery,
        page: attemptsQuery.page,
        pageSize: attemptsQuery.pageSize,
      }),
      needTrialStats
        ? fetchTrialAttemptsForStreak(supabase, { allowedUserIds, startIso, endIso })
        : Promise.resolve([]),
      fetchTrialCount(),
      fetchTrialLast(),
      fetchFinalCount(),
      fetchFinalLast(),
    ]);

    let filterPeopleStats = { passedPeople: 0, failedPeople: 0 };
    if (attemptsQuery.statusFilter !== "not_started" && !needTrialStats) {
      const peopleStatsRows = await fetchAttemptsForPeopleStats(supabase, {
        ...listQuery,
        page: 1,
        pageSize: 10000,
      });
      filterPeopleStats = calcAttemptPeopleStats(peopleStatsRows);
    }

    let trialTripleStreakStats: { cohortPeople: number; passedPeople: number; failedPeople: number } | null = null;
    if (needTrialStats) {
      const streakStats = calcTrialTripleStreakStats(cohortUserIds, trialAttempts);
      trialTripleStreakStats = {
        cohortPeople: streakStats.cohortPeople,
        passedPeople: streakStats.passedPeople,
        failedPeople: streakStats.failedPeople,
      };
    }

    const attempts = (attemptsPageData.rows as Array<Record<string, unknown>>)
      .map((row) => {
        const userId = String(row.user_id);
        const user = userById.get(userId);
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
          finalAttemptIndex:
            row.final_attempt_index != null && Number.isFinite(Number(row.final_attempt_index))
              ? Number(row.final_attempt_index)
              : null,
          showResetAttempts:
            viewerCanResetAttempts && type === "final" && !!latestFinalAt && createdAt === latestFinalAt,
          canDeleteAttempt: viewerCanResetAttempts,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const attemptsTotal = attemptsPageData.total;
    const attemptsPage = attemptsQuery.page;
    const attemptsPageSize = attemptsQuery.pageSize;

    const passedSummaries = summaries.filter((s) => s.status === "passed");
    const failedSummaries = summaries.filter((s) => s.status === "failed");
    const notStartedSummaries = summaries.filter((s) => s.status === "not_started");

    const lastPassed = passedSummaries.reduce<{
      name: string;
      callsign: string;
      nameColor: ProfileNameColorId | null;
      cosmetics: NonNullable<ReturnType<typeof cosmeticsMap.get>>;
      at: string;
    } | null>((best, s) => {
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

    const lastFailed = failedSummaries.reduce<{
      name: string;
      callsign: string;
      nameColor: ProfileNameColorId | null;
      cosmetics: NonNullable<ReturnType<typeof cosmeticsMap.get>>;
      at: string;
    } | null>((best, s) => {
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

    const trialRow = trialLastRes.data as { user_id?: string; created_at?: string } | null;
    const finalRow = finalLastRes.data as { user_id?: string; created_at?: string } | null;
    const trialUser = trialRow?.user_id ? userById.get(String(trialRow.user_id)) : undefined;
    const finalUser = finalRow?.user_id ? userById.get(String(finalRow.user_id)) : undefined;

    const bannerStats = {
      passedCount: passedSummaries.length,
      lastPassed,
      notPassedCount: failedSummaries.length + notStartedSummaries.length,
      lastNotPassed: lastFailed,
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

    return Response.json({
      ok: true,
      viewerIsAdmin,
      viewerCanResetAttempts,
      nextAutoResetAt: nextAutoResetUtcIso(),
      period,
      summaries,
      attempts,
      attemptsTotal,
      attemptsPage,
      attemptsPageSize,
      filterPeopleStats,
      trialTripleStreakStats,
      lastResetAudit,
      bannerStats,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_results_exception" },
      { status: 500 },
    );
  }
}
