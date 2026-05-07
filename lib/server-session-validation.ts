import type { SessionUser } from "@/lib/types";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function normalizeDbPermissions(row: Record<string, unknown>, fallbackContent: boolean, role: "admin" | "employee") {
  if (role === "admin") {
    return {
      news: true,
      tests: true,
      results: true,
      resetResults: true,
      uav: true,
      counteraction: true,
      userList: true,
      users: true,
      online: true,
    };
  }
  return {
    news: row.can_manage_news === true || (row.can_manage_news == null && fallbackContent),
    tests: row.can_manage_tests === true || (row.can_manage_tests == null && fallbackContent),
    results: row.can_manage_results === true || (row.can_manage_results == null && fallbackContent),
    resetResults: row.can_reset_test_results === true,
    uav: row.can_manage_uav === true || (row.can_manage_uav == null && fallbackContent),
    counteraction: row.can_manage_counteraction === true || (row.can_manage_counteraction == null && fallbackContent),
    userList: row.can_view_user_list === true,
    users: row.can_manage_users === true,
    online: row.can_view_online === true,
  };
}

function samePermissions(a: SessionUser["permissions"], b: SessionUser["permissions"]) {
  return (
    a.news === b.news &&
    a.tests === b.tests &&
    a.results === b.results &&
    a.resetResults === b.resetResults &&
    a.uav === b.uav &&
    a.counteraction === b.counteraction &&
    a.userList === b.userList &&
    a.users === b.users &&
    a.online === b.online
  );
}

/** Returns true when session is still valid; false when user must re-login. */
export async function isSessionStillValid(session: SessionUser): Promise<boolean> {
  try {
    const supabase = getServerSupabaseServiceClient();
    const primary = await supabase
      .from("app_users")
      .select(
        "id,role,status,can_manage_content,can_manage_news,can_manage_tests,can_manage_results,can_manage_uav,can_manage_counteraction,can_manage_users,can_view_user_list,can_view_online,can_reset_test_results",
      )
      .eq("id", session.id)
      .maybeSingle();

    let row = (primary.data || null) as Record<string, unknown> | null;
    let err = primary.error;
    if (err && isMissingColumnError(err.message)) {
      const fallback = await supabase
        .from("app_users")
        .select("id,role,status,can_manage_content,can_manage_users,can_view_online")
        .eq("id", session.id)
        .maybeSingle();
      row = (fallback.data || null) as Record<string, unknown> | null;
      err = fallback.error;
    }

    if (err) return true; // don't kick users on transient backend issues
    if (!row) return false;
    if (row.status === "inactive") return false;

    const role: "admin" | "employee" = row.role === "admin" ? "admin" : "employee";
    const fallbackContent = row.can_manage_content === true;
    const currentPermissions = normalizeDbPermissions(row, fallbackContent, role);
    const currentCanManageContent =
      currentPermissions.news || currentPermissions.tests || currentPermissions.uav || currentPermissions.counteraction;

    if (session.role !== role) return false;
    if (session.canManageContent !== currentCanManageContent) return false;
    if (!samePermissions(session.permissions, currentPermissions)) return false;
    return true;
  } catch {
    return true;
  }
}
