import { effectiveFinalCountingFromUtc } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadTestsHistoryRows(supabase: SupabaseClient, sessionUserId: string) {
  const ctx = await resolveFinalUserContext(supabase, sessionUserId);
  const userIds = ctx.linkedUserIds;
  const countingFrom = effectiveFinalCountingFromUtc(ctx.final_test_counting_from);

  let queryRows: unknown[] = [];
  let queryError: string | null = null;

  const primaryQ = await supabase
    .from("test_results")
    .select("id,user_id,type,status,score,created_at,questions_total,questions_correct,duration_seconds")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!primaryQ.error) {
    queryRows = (primaryQ.data as unknown[]) || [];
  } else if (isMissingColumnError(primaryQ.error.message)) {
    const retry = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at,duration_seconds")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(40);
    if (!retry.error) {
      queryRows = (retry.data as unknown[]) || [];
    } else {
      queryError = retry.error?.message || null;
    }
  } else {
    queryError = primaryQ.error.message;
  }

  if (queryError) {
    return { ok: false as const, error: queryError, rows: [] };
  }

  const normalized = (queryRows as Array<Record<string, unknown>>).map((r) => {
    const rawType = r.type;
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
      duration_seconds: r.duration_seconds ?? null,
    };
  });

  const finalsInWindow = normalized
    .filter((r) => r.type === "final")
    .filter((r) => new Date(String(r.created_at)).getTime() >= new Date(countingFrom).getTime())
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
      duration_seconds: r.duration_seconds ?? null,
      final_attempt_index: isFinal ? idxById.get(String(r.id)) ?? null : null,
      max_final_attempts: FINAL_TEST_MAX_ATTEMPTS,
    };
  });

  return { ok: true as const, rows };
}
