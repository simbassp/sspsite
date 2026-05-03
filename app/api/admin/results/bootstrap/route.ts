import { effectiveFinalCountingFromUtc } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { canManageResults, canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

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
};

function rangeStartIso(range: string): Date | null {
  const now = new Date();
  if (range === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 86400000);
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 86400000);
  }
  return null;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageResults(session) && !canResetTestResults(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "all";
  const viewerIsAdmin = session.role === "admin";
  const viewerCanResetAttempts = canResetTestResults(session);

  try {
    const supabase = getServerSupabaseServiceClient();

    const usersPrimary = await supabase
      .from("app_users")
      .select("id,name,callsign,position,role,status,final_test_counting_from")
      .limit(1000);

    let usersRows: AppUserListRow[] | null = usersPrimary.data as AppUserListRow[] | null;
    let usersErr = usersPrimary.error;

    if (usersErr && isMissingColumnError(usersErr.message)) {
      const usersFallback = await supabase.from("app_users").select("id,name,callsign,role,status").limit(1000);
      usersRows = usersFallback.data as AppUserListRow[] | null;
      usersErr = usersFallback.error;
    }

    if (usersErr || !usersRows) {
      return Response.json({ ok: false, error: usersErr?.message || "users_failed" }, { status: 500 });
    }

    const users = usersRows;

    const resultsPrimary = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at,questions_total,questions_correct")
      .eq("type", "final")
      .order("created_at", { ascending: false })
      .limit(8000);

    let resultsRows: Array<Record<string, unknown>> | null = resultsPrimary.data as Array<
      Record<string, unknown>
    > | null;
    let resultsErr = resultsPrimary.error;

    if (resultsErr && isMissingColumnError(resultsErr.message)) {
      const resultsMid = await supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .eq("type", "final")
        .order("created_at", { ascending: false })
        .limit(8000);
      resultsRows = resultsMid.data as Array<Record<string, unknown>> | null;
      resultsErr = resultsMid.error;
    }

    if (resultsErr && isMissingColumnError(resultsErr.message)) {
      const resultsLegacy = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .eq("test_type", "final")
        .order("created_at", { ascending: false })
        .limit(8000);
      resultsRows = resultsLegacy.data as Array<Record<string, unknown>> | null;
      resultsErr = resultsLegacy.error;
    }

    if (resultsErr) {
      return Response.json({ ok: false, error: resultsErr.message || "results_failed" }, { status: 500 });
    }

    const finalRows = (resultsRows || [])
      .filter((r) => (r.type ?? r.test_type) === "final")
      .map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        type: "final" as const,
        status: r.status === "passed" ? ("passed" as const) : ("failed" as const),
        score: Number(r.score ?? 0),
        created_at: String(r.created_at ?? ""),
        questions_total: r.questions_total != null ? Number(r.questions_total) : null,
        questions_correct: r.questions_correct != null ? Number(r.questions_correct) : null,
      }));

    const finalsByUser = new Map<string, typeof finalRows>();
    for (const row of finalRows) {
      const list = finalsByUser.get(row.user_id) ?? [];
      list.push(row);
      finalsByUser.set(row.user_id, list);
    }

    const cutoff = rangeStartIso(range);

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

        /** Сброс: право «Сброс результатов»; себе можно сбросить даже при зачёте в окне. */
        const showResetAttempts =
          viewerCanResetAttempts && (!hasPassedFinal || session.id === user.id);

        let statusLabel: "passed" | "failed" | "not_started";
        if (hasPassedFinal) statusLabel = "passed";
        else if (finalsSince.length > 0) statusLabel = "failed";
        else statusLabel = "not_started";

        return {
          userId: user.id,
          name: user.name,
          callsign: user.callsign,
          position: String(user.position ?? ""),
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
        if (range === "all") return true;
        if (!cutoff) return true;
        if (!s.latestFinalAt) return false;
        return new Date(s.latestFinalAt).getTime() >= cutoff.getTime();
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

    const userById = new Map(users.map((u) => [u.id, { name: u.name, callsign: u.callsign }]));

    const passedSummaries = summaries.filter((s) => s.status === "passed");
    const failedSummaries = summaries.filter((s) => s.status === "failed");
    const notStartedSummaries = summaries.filter((s) => s.status === "not_started");

    const lastPassed = passedSummaries.reduce<{ name: string; callsign: string; at: string } | null>((best, s) => {
      if (!s.latestFinalAt) return best;
      if (!best || new Date(s.latestFinalAt) > new Date(best.at)) {
        return { name: s.name, callsign: s.callsign, at: s.latestFinalAt };
      }
      return best;
    }, null);

    const lastFailed = failedSummaries.reduce<{ name: string; callsign: string; at: string } | null>((best, s) => {
      if (!s.latestFinalAt) return best;
      if (!best || new Date(s.latestFinalAt) > new Date(best.at)) {
        return { name: s.name, callsign: s.callsign, at: s.latestFinalAt };
      }
      return best;
    }, null);

    const cutoffIso = cutoff ? cutoff.toISOString() : null;

    let trialCountQ = supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "trial");
    if (cutoffIso) trialCountQ = trialCountQ.gte("created_at", cutoffIso);
    let trialCountRes = await trialCountQ;
    if (trialCountRes.error && isMissingColumnError(trialCountRes.error.message)) {
      let q = supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "trial");
      if (cutoffIso) q = q.gte("created_at", cutoffIso);
      trialCountRes = await q;
    }

    let trialLastQ = supabase.from("test_results").select("user_id,created_at").eq("type", "trial");
    if (cutoffIso) trialLastQ = trialLastQ.gte("created_at", cutoffIso);
    let trialLastRes = await trialLastQ.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (trialLastRes.error && isMissingColumnError(trialLastRes.error.message)) {
      let q = supabase.from("test_results").select("user_id,created_at").eq("test_type", "trial");
      if (cutoffIso) q = q.gte("created_at", cutoffIso);
      trialLastRes = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    }

    let finalCountQ = supabase.from("test_results").select("id", { count: "exact", head: true }).eq("type", "final");
    if (cutoffIso) finalCountQ = finalCountQ.gte("created_at", cutoffIso);
    let finalCountRes = await finalCountQ;
    if (finalCountRes.error && isMissingColumnError(finalCountRes.error.message)) {
      let q = supabase.from("test_results").select("id", { count: "exact", head: true }).eq("test_type", "final");
      if (cutoffIso) q = q.gte("created_at", cutoffIso);
      finalCountRes = await q;
    }

    let finalLastQ = supabase.from("test_results").select("user_id,created_at").eq("type", "final");
    if (cutoffIso) finalLastQ = finalLastQ.gte("created_at", cutoffIso);
    let finalLastRes = await finalLastQ.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (finalLastRes.error && isMissingColumnError(finalLastRes.error.message)) {
      let q = supabase.from("test_results").select("user_id,created_at").eq("test_type", "final");
      if (cutoffIso) q = q.gte("created_at", cutoffIso);
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
          ? { name: trialUser.name, callsign: trialUser.callsign, at: String(trialRow.created_at) }
          : trialRow?.created_at
            ? { name: "—", callsign: "", at: String(trialRow.created_at) }
            : null,
      finalAttemptsCount: finalCountRes.count ?? 0,
      lastFinal:
        finalRow?.created_at && finalUser
          ? { name: finalUser.name, callsign: finalUser.callsign, at: String(finalRow.created_at) }
          : finalRow?.created_at
            ? { name: "—", callsign: "", at: String(finalRow.created_at) }
            : null,
    };

    return Response.json({
      ok: true,
      viewerIsAdmin,
      viewerCanResetAttempts,
      range,
      summaries,
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
