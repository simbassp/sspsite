import type { SupabaseClient } from "@supabase/supabase-js";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

/** Сводка по лимиту итогового теста для пользователя (сервисный клиент Supabase). */
export async function computeFinalTestSummary(supabase: SupabaseClient, userId: string) {
  const maxAttempts = FINAL_TEST_MAX_ATTEMPTS;

  const ctx = await resolveFinalUserContext(supabase, userId);
  const tiedIds = ctx.linkedUserIds.length ? ctx.linkedUserIds : [userId];
  const countingFrom = ctx.final_test_counting_from;

  let countQuery = supabase
    .from("test_results")
    .select("id", { count: "exact", head: true })
    .in("user_id", tiedIds)
    .eq("type", "final");
  if (countingFrom) {
    countQuery = countQuery.gte("created_at", countingFrom);
  }
  let countRes = await countQuery;

  if (countRes.error && isMissingColumnError(countRes.error.message)) {
    let legacyQ = supabase
      .from("test_results")
      .select("id", { count: "exact", head: true })
      .in("user_id", tiedIds)
      .eq("test_type", "final");
    if (countingFrom) {
      legacyQ = legacyQ.gte("created_at", countingFrom);
    }
    countRes = await legacyQ;
  }

  const usedAttempts = countRes.count ?? 0;

  /** «Сдал» только в текущем окне попыток: после сброса админом старый зачёт не блокирует старт. */
  let passedQuery = supabase
    .from("test_results")
    .select("id")
    .in("user_id", tiedIds)
    .eq("type", "final")
    .eq("status", "passed");
  if (countingFrom) {
    passedQuery = passedQuery.gte("created_at", countingFrom);
  }
  let passedRes = await passedQuery.limit(1).maybeSingle();

  if (passedRes.error && isMissingColumnError(passedRes.error.message)) {
    let legacyPassed = supabase
      .from("test_results")
      .select("id")
      .in("user_id", tiedIds)
      .eq("test_type", "final")
      .eq("status", "passed");
    if (countingFrom) {
      legacyPassed = legacyPassed.gte("created_at", countingFrom);
    }
    passedRes = await legacyPassed.limit(1).maybeSingle();
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
