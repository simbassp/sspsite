import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

/** Все user_id в test_results, относящиеся к одному человеку, и окно подсчёта попыток (после сброса админом). */
export async function resolveFinalUserContext(supabase: SupabaseClient, sessionUserId: string) {
  const linked = new Set<string>([sessionUserId]);
  const authLinked = new Set<string>();
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
    if (row.auth_user_id) {
      const authId = String(row.auth_user_id);
      linked.add(authId);
      authLinked.add(authId);
    }
    mergeCounting(row.final_test_counting_from);
  }

  type AppUserRow = {
    id: string;
    auth_user_id?: string | null;
    final_test_counting_from?: string | null;
  };

  const byId = await supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("id", sessionUserId)
    .limit(20);
  if (!byId.error) {
    for (const row of (byId.data || []) as AppUserRow[]) mergeRow(row);
  } else if (isMissingColumnError(byId.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("id", sessionUserId).limit(20);
    if (!fb.error) for (const row of (fb.data || []) as AppUserRow[]) mergeRow(row);
  }

  const byAuth = await supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("auth_user_id", sessionUserId)
    .limit(200);
  if (!byAuth.error) {
    for (const row of (byAuth.data || []) as AppUserRow[]) mergeRow(row);
  } else if (isMissingColumnError(byAuth.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", sessionUserId).limit(200);
    if (!fb.error) for (const row of (fb.data || []) as AppUserRow[]) mergeRow(row);
  }

  for (const authId of authLinked) {
    const linkedByAuth = await supabase
      .from("app_users")
      .select("id,auth_user_id,final_test_counting_from")
      .eq("auth_user_id", authId)
      .limit(200);
    if (!linkedByAuth.error) {
      for (const row of (linkedByAuth.data || []) as AppUserRow[]) mergeRow(row);
    }
  }

  return {
    linkedUserIds: Array.from(linked),
    final_test_counting_from: countingFrom,
  };
}
