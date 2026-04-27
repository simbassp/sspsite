import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

/** Все user_id в test_results, относящиеся к одному человеку, и окно подсчёта попыток (после сброса админом). */
export async function resolveFinalUserContext(supabase: SupabaseClient, sessionUserId: string) {
  const linked = new Set<string>([sessionUserId]);
  let countingFrom: string | null = null;

  function mergeCounting(raw: unknown) {
    if (typeof raw === "string" && raw.trim()) countingFrom = raw;
  }

  function mergeRow(row: {
    id: string;
    auth_user_id?: string | null;
    final_test_counting_from?: string | null;
  }) {
    linked.add(row.id);
    if (row.auth_user_id) linked.add(String(row.auth_user_id));
    mergeCounting(row.final_test_counting_from);
  }

  let byId = await supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("id", sessionUserId)
    .maybeSingle();

  type AppUserRow = {
    id: string;
    auth_user_id?: string | null;
    final_test_counting_from?: string | null;
  };

  if (!byId.error && byId.data) mergeRow(byId.data as AppUserRow);

  if (byId.error && isMissingColumnError(byId.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("id", sessionUserId).maybeSingle();
    if (!fb.error && fb.data) mergeRow(fb.data as AppUserRow);
  }

  let byAuth = await supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("auth_user_id", sessionUserId)
    .maybeSingle();

  if (!byAuth.error && byAuth.data) mergeRow(byAuth.data as AppUserRow);

  if (byAuth.error && isMissingColumnError(byAuth.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", sessionUserId).maybeSingle();
    if (!fb.error && fb.data) mergeRow(fb.data as AppUserRow);
  }

  return {
    linkedUserIds: Array.from(linked),
    final_test_counting_from: countingFrom,
  };
}
