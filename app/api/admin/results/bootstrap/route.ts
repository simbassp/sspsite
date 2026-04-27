import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { canManageResults } from "@/lib/permissions";
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
  if (!session || !canManageResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "all";
  const viewerIsAdmin = session.role === "admin";

  try {
    const supabase = getServerSupabaseServiceClient();

    let usersPrimary = await supabase
      .from("app_users")
      .select("id,name,callsign,role,status,final_test_counting_from")
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

    let resultsPrimary = await supabase
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

    const summaries = users
      .filter((u) => u.role === "employee")
      .map((user) => {
        const userFinals = finalsByUser.get(user.id) ?? [];
        const hasPassedFinal = userFinals.some((r) => r.status === "passed");
        const sortedDesc = [...userFinals].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const latestFinal = sortedDesc[0];
        const latestFinalAt = latestFinal?.created_at ?? null;

        const from = user.final_test_counting_from ?? null;
        const finalsSince = from
          ? userFinals.filter((r) => new Date(r.created_at).getTime() >= new Date(from).getTime())
          : userFinals;
        const usedFinalAttempts = finalsSince.length;

        const qt = latestFinal?.questions_total ?? null;
        const qc = latestFinal?.questions_correct ?? null;

        const showResetAttempts =
          viewerIsAdmin && !hasPassedFinal && usedFinalAttempts >= FINAL_TEST_MAX_ATTEMPTS;

        let statusLabel: "passed" | "failed" | "not_started";
        if (hasPassedFinal) statusLabel = "passed";
        else if (userFinals.length > 0) statusLabel = "failed";
        else statusLabel = "not_started";

        return {
          userId: user.id,
          name: user.name,
          callsign: user.callsign,
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

    if (viewerIsAdmin) {
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

    return Response.json({
      ok: true,
      viewerIsAdmin,
      range,
      summaries,
      lastResetAudit,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_results_exception" },
      { status: 500 },
    );
  }
}
