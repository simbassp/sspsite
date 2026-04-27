import type { SupabaseClient } from "@supabase/supabase-js";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

/** Сводка по лимиту итогового теста для пользователя (сервисный клиент Supabase). */
export async function computeFinalTestSummary(supabase: SupabaseClient, userId: string) {
  const maxAttempts = FINAL_TEST_MAX_ATTEMPTS;

  let countingFrom: string | null = null;
  let userQ = await supabase.from("app_users").select("final_test_counting_from").eq("id", userId).maybeSingle();
  if (!userQ.error && userQ.data != null) {
    countingFrom =
      (userQ.data as { final_test_counting_from?: string | null }).final_test_counting_from ?? null;
  }
  if (userQ.error && isMissingColumnError(userQ.error.message)) {
    countingFrom = null;
  }

  let countQuery = supabase
    .from("test_results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "final");
  if (countingFrom) {
    countQuery = countQuery.gte("created_at", countingFrom);
  }
  let countRes = await countQuery;

  if (countRes.error && isMissingColumnError(countRes.error.message)) {
    let legacyQ = supabase
      .from("test_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("test_type", "final");
    if (countingFrom) {
      legacyQ = legacyQ.gte("created_at", countingFrom);
    }
    countRes = await legacyQ;
  }

  const usedAttempts = countRes.count ?? 0;

  let passedRes = await supabase
    .from("test_results")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "final")
    .eq("status", "passed")
    .limit(1)
    .maybeSingle();

  if (passedRes.error && isMissingColumnError(passedRes.error.message)) {
    passedRes = await supabase
      .from("test_results")
      .select("id")
      .eq("user_id", userId)
      .eq("test_type", "final")
      .eq("status", "passed")
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
