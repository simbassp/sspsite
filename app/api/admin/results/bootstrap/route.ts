import { effectiveFinalCountingFromUtc, nextAutoResetUtcIso } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { canManageResults, canResetTestResults } from "@/lib/permissions";
import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

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

function parseDateParam(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function resolveDateRange(searchParams: URLSearchParams) {
  const range = searchParams.get("range") || "all";
  if (range === "today") {
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

function timestampInRange(timestamp: string, startMs: number | null, endMs: number | null) {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  if (startMs != null && t < startMs) return false;
  if (endMs != null && t >= endMs) return false;
  return true;
}

function applyCreatedAtRange<T extends { gte: (col: string, val: string) => T; lt: (col: string, val: string) => T }>(
  query: T,
  startIso: string | null,
  endIso: string | null,
) {
  let next = query;
  if (startIso) next = next.gte("created_at", startIso);
  if (endIso) next = next.lt("created_at", endIso);
  return next;
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
  const viewerIsAdmin = session.role === "admin";
  const viewerCanResetAttempts = canResetTestResults(session);

  try {
    const supabase = getServerSupabaseServiceClient();

    const [usersPrimary, resultsPrimary] = await Promise.all([
      supabase
        .from("app_users")
        .select("id,name,callsign,position,role,status,final_test_counting_from,unit_assignment,rota_platoon,rota_section,profile_name_color")
        .limit(1000),
      supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at,questions_total,questions_correct,final_attempt_index")
        .order("created_at", { ascending: false })
        .limit(8000),
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

    let resultsRows: Array<Record<string, unknown>> | null = resultsPrimary.data as Array<
      Record<string, unknown>
    > | null;
    let resultsErr = resultsPrimary.error;

    if (resultsErr && isMissingColumnError(resultsErr.message)) {
      const resultsMid = await supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .order("created_at", { ascending: false })
        .limit(8000);
      resultsRows = resultsMid.data as Array<Record<string, unknown>> | null;
      resultsErr = resultsMid.error;
    }

    if (resultsErr && isMissingColumnError(resultsErr.message)) {
      const resultsLegacy = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .order("created_at", { ascending: false })
        .limit(8000);
      resultsRows = resultsLegacy.data as Array<Record<string, unknown>> | null;
      resultsErr = resultsLegacy.error;
    }

    if (resultsErr) {
      return Response.json({ ok: false, error: resultsErr.message || "results_failed" }, { status: 500 });
    }

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

    const allRows: NormalizedResult[] = (resultsRows || []).map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      type: (r.type ?? r.test_type) === "final" ? ("final" as const) : ("trial" as const),
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

    const finalRows = allRows.filter((r) => r.type === "final");

    const finalsByUser = new Map<string, typeof finalRows>();
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

    const attempts = allRows
      .filter((row) => {
        if (!hasPeriodFilter) return true;
        return timestampInRange(row.created_at, startMs, endMs);
      })
      .map((row) => {
        const user = userById.get(row.user_id);
        return {
          id: row.id,
          userId: row.user_id,
          name: user?.name ?? "—",
          callsign: user?.callsign ?? "",
          nameColor: user?.nameColor ?? null,
          cosmetics: user?.cosmetics ?? {},
          position: user?.position ?? "",
          unitAssignment: (user?.unitAssignment ?? null) as UnitAssignment | null,
          rotaPlatoon: user?.rotaPlatoon ?? null,
          rotaSection: user?.rotaSection ?? null,
          type: row.type,
          status: row.status,
          scorePercent: row.score,
          questionsCorrect: row.questions_correct,
          questionsTotal: row.questions_total,
          createdAt: row.created_at,
          finalAttemptIndex: row.final_attempt_index,
          showResetAttempts: false,
        };
      })
      .filter((row) => userById.has(row.userId));

    for (const summary of summaries) {
      if (!summary.showResetAttempts || !summary.latestFinalAt) continue;
      const match = attempts.find(
        (a) =>
          a.userId === summary.userId &&
          a.type === "final" &&
          a.createdAt === summary.latestFinalAt,
      );
      if (match) match.showResetAttempts = true;
    }

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

    let trialCountQ = applyCreatedAtRange(
      supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "trial"),
      startIso,
      endIso,
    );
    let trialCountRes = await trialCountQ;
    if (trialCountRes.error && isMissingColumnError(trialCountRes.error.message)) {
      let q = applyCreatedAtRange(
        supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "trial"),
        startIso,
        endIso,
      );
      trialCountRes = await q;
    }

    let trialLastQ = applyCreatedAtRange(
      supabase.from("test_results").select("user_id,created_at").eq("type", "trial"),
      startIso,
      endIso,
    );
    let trialLastRes = await trialLastQ.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (trialLastRes.error && isMissingColumnError(trialLastRes.error.message)) {
      let q = applyCreatedAtRange(
        supabase.from("test_results").select("user_id,created_at").eq("test_type", "trial"),
        startIso,
        endIso,
      );
      trialLastRes = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    }

    let finalCountQ = applyCreatedAtRange(
      supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "final"),
      startIso,
      endIso,
    );
    let finalCountRes = await finalCountQ;
    if (finalCountRes.error && isMissingColumnError(finalCountRes.error.message)) {
      let q = applyCreatedAtRange(
        supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "final"),
        startIso,
        endIso,
      );
      finalCountRes = await q;
    }

    let finalLastQ = applyCreatedAtRange(
      supabase.from("test_results").select("user_id,created_at").eq("type", "final"),
      startIso,
      endIso,
    );
    let finalLastRes = await finalLastQ.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (finalLastRes.error && isMissingColumnError(finalLastRes.error.message)) {
      let q = applyCreatedAtRange(
        supabase.from("test_results").select("user_id,created_at").eq("test_type", "final"),
        startIso,
        endIso,
      );
      finalLastRes = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    }

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
