import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

import type { TestResultsResetScope } from "@/lib/types";

async function deleteTestResultsByType(
  supabase: SupabaseClient,
  linkedUserIds: string[],
  type: "trial" | "final",
) {
  const del = await supabase.from("test_results").delete().in("user_id", linkedUserIds).eq("type", type);
  if (del.error && !isMissingColumnError(del.error.message)) {
    throw new Error(del.error.message);
  }
}

async function resetFinalAttemptWindow(
  supabase: SupabaseClient,
  targetUserId: string,
  adminUserId: string,
) {
  const nowIso = new Date().toISOString();
  const upd = await supabase.from("app_users").update({ final_test_counting_from: nowIso }).eq("id", targetUserId);
  if (upd.error) {
    if (isMissingColumnError(upd.error.message)) {
      throw new Error("migration_required_final_test_counting_from");
    }
    throw new Error(upd.error.message);
  }

  const ins = await supabase.from("final_attempt_reset_events").insert({
    target_user_id: targetUserId,
    admin_user_id: adminUserId,
  });
  if (ins.error && process.env.NODE_ENV !== "production") {
    console.debug("[reset-test-stats] audit insert", ins.error.message);
  }
}

export async function deleteTestResultAttempt(supabase: SupabaseClient, attemptId: string) {
  const del = await supabase.from("test_results").delete().eq("id", attemptId);
  if (del.error) {
    throw new Error(del.error.message);
  }
}

async function deleteBankCompletions(supabase: SupabaseClient, linkedUserIds: string[]) {
  const del = await supabase.from("bank_test_completions").delete().in("user_id", linkedUserIds);
  if (del.error && !isMissingColumnError(del.error.message)) {
    const msg = del.error.message.toLowerCase();
    if (!msg.includes("does not exist") && !msg.includes("schema cache")) {
      throw new Error(del.error.message);
    }
  }
}

export async function resetTestResultsForUser(
  supabase: SupabaseClient,
  targetUserId: string,
  scope: TestResultsResetScope,
  adminUserId: string,
) {
  const { linkedUserIds } = await resolveFinalUserContext(supabase, targetUserId);

  if (scope === "trial" || scope === "all") {
    await deleteTestResultsByType(supabase, linkedUserIds, "trial");
  }

  if (scope === "final" || scope === "all") {
    await deleteTestResultsByType(supabase, linkedUserIds, "final");
    await resetFinalAttemptWindow(supabase, targetUserId, adminUserId);
  }

  if (scope === "all") {
    await deleteBankCompletions(supabase, linkedUserIds);
  }
}
