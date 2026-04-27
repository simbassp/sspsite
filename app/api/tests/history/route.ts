import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

async function resolveUserIdsForHistory(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  sessionId: string,
) {
  const ids = new Set<string>([sessionId]);
  try {
    const byAppIdPrimary = await supabase.from("app_users").select("id,auth_user_id").eq("id", sessionId).limit(1);
    let byAppIdRows: Array<Record<string, unknown>> = (byAppIdPrimary.data || []) as Array<Record<string, unknown>>;
    let byAppIdError: string | null = byAppIdPrimary.error?.message || null;
    if (byAppIdPrimary.error && isMissingColumnError(byAppIdPrimary.error.message)) {
      const byAppIdLegacy = await supabase.from("app_users").select("id").eq("id", sessionId).limit(1);
      byAppIdRows = (byAppIdLegacy.data || []) as Array<Record<string, unknown>>;
      byAppIdError = byAppIdLegacy.error?.message || null;
    }
    if (!byAppIdError) {
      for (const row of byAppIdRows) {
        if (row.id) ids.add(String(row.id));
        if (row.auth_user_id) ids.add(String(row.auth_user_id));
      }
    }
  } catch {}
  try {
    const byAuthId = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", sessionId).limit(1);
    if (!byAuthId.error) {
      for (const row of (byAuthId.data || []) as Array<Record<string, unknown>>) {
        if (row.id) ids.add(String(row.id));
        if (row.auth_user_id) ids.add(String(row.auth_user_id));
      }
    }
  } catch {}
  return Array.from(ids);
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const userIds = await resolveUserIdsForHistory(supabase, session.id);

    let countingFrom: string | null = null;
    const countingQ = await supabase.from("app_users").select("final_test_counting_from").eq("id", session.id).maybeSingle();
    if (!countingQ.error && countingQ.data) {
      countingFrom =
        (countingQ.data as { final_test_counting_from?: string | null }).final_test_counting_from ?? null;
    }
    if (countingQ.error && isMissingColumnError(countingQ.error.message)) {
      countingFrom = null;
    }

    let queryRows: unknown[] = [];
    let queryError: string | null = null;

    let primaryQ = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at,questions_total,questions_correct")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!primaryQ.error) {
      queryRows = (primaryQ.data as unknown[]) || [];
    } else if (primaryQ.error && isMissingColumnError(primaryQ.error.message)) {
      const retry = await supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!retry.error) {
        queryRows = (retry.data as unknown[]) || [];
      } else if (retry.error && isMissingColumnError(retry.error.message)) {
        const legacyQ = await supabase
          .from("test_results")
          .select("id,user_id,test_type,status,score,created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(40);
        queryRows = (legacyQ.data as unknown[]) || [];
        queryError = legacyQ.error?.message || null;
      } else {
        queryError = retry.error?.message || null;
      }
    } else {
      queryError = primaryQ.error.message;
    }

    if (queryError) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/tests/history] query error", { userId: session.id, message: queryError });
      }
      return Response.json({ ok: false, error: queryError }, { status: 500 });
    }

    const normalized = (queryRows as Array<Record<string, unknown>>).map((r) => {
      const rawType = r.type ?? r.test_type;
      const ty = rawType === "final" ? "final" : "trial";
      return {
        id: r.id,
        user_id: r.user_id,
        type: ty,
        status: r.status,
        score: r.score,
        created_at: r.created_at,
        questions_total: r.questions_total ?? null,
        questions_correct: r.questions_correct ?? null,
      };
    });

    const finalsInWindow = normalized
      .filter((r) => r.type === "final")
      .filter((r) => {
        if (!countingFrom) return true;
        return new Date(String(r.created_at)).getTime() >= new Date(countingFrom).getTime();
      })
      .sort((a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime());

    const idxById = new Map<string, number>();
    finalsInWindow.forEach((r, i) => idxById.set(String(r.id), i + 1));

    const rows = normalized.map((r) => {
      const isFinal = r.type === "final";
      return {
        id: r.id,
        user_id: r.user_id,
        type: isFinal ? "final" : "trial",
        status: r.status,
        score: r.score,
        created_at: r.created_at,
        questions_total: r.questions_total,
        questions_correct: r.questions_correct,
        final_attempt_index: isFinal ? idxById.get(String(r.id)) ?? null : null,
        max_final_attempts: FINAL_TEST_MAX_ATTEMPTS,
      };
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/tests/history] ok", { userId: session.id, candidates: userIds, count: rows.length });
    }
    return Response.json({ ok: true, rows });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}
