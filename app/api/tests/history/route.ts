import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const ctx = await resolveFinalUserContext(supabase, session.id);
    const userIds = ctx.linkedUserIds;
    const countingFrom = ctx.final_test_counting_from;

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
