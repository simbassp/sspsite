import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveFinalCountingFromUtc } from "@/lib/final-effective-counting";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

/** Сводка по лимиту итогового теста для пользователя (сервисный клиент Supabase). */
export async function computeFinalTestSummary(supabase: SupabaseClient, userId: string) {
  const maxAttempts = FINAL_TEST_MAX_ATTEMPTS;

  const ctx = await resolveFinalUserContext(supabase, userId);
  const tiedIds = ctx.linkedUserIds.length ? ctx.linkedUserIds : [userId];
  const countingFrom = effectiveFinalCountingFromUtc(ctx.final_test_counting_from);

  let countQuery = supabase
    .from("test_results")
    .select("id", { count: "exact", head: true })
    .in("user_id", tiedIds)
    .eq("type", "final")
    .gte("created_at", countingFrom);

  let countRes = await countQuery;

  if (countRes.error && isMissingColumnError(countRes.error.message)) {
    countRes = await supabase
      .from("test_results")
      .select("id", { count: "exact", head: true })
      .in("user_id", tiedIds)
      .eq("test_type", "final")
      .gte("created_at", countingFrom);
  }

  const usedAttempts = countRes.count ?? 0;

  /** «Сдал» только в текущем окне попыток (после сброса и/или с 1-го числа месяца). */
  let passedQuery = supabase
    .from("test_results")
    .select("id")
    .in("user_id", tiedIds)
    .eq("type", "final")
    .eq("status", "passed")
    .gte("created_at", countingFrom);

  let passedRes = await passedQuery.limit(1).maybeSingle();

  if (passedRes.error && isMissingColumnError(passedRes.error.message)) {
    passedRes = await supabase
      .from("test_results")
      .select("id")
      .in("user_id", tiedIds)
      .eq("test_type", "final")
      .eq("status", "passed")
      .gte("created_at", countingFrom)
      .limit(1)
      .maybeSingle();
  }

  const hasPassedFinal = Boolean(passedRes.data);
  const canStartFinal = !hasPassedFinal && usedAttempts < maxAttempts;
  const attemptsExhausted = !hasPassedFinal && usedAttempts >= maxAttempts;

  return {
    maxAttempts,
    usedAttempts,
    hasPassedFinal,
    canStartFinal,
    attemptsExhausted,
  };
}
