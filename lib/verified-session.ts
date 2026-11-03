import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import type { SessionUser, UserPermissions } from "@/lib/types";

/** Only database columns may supply authorization fields. Never merge the UI cookie. */
export function sessionFromProfile(row: Record<string, unknown>): SessionUser | null {
  if (typeof row.id !== "string" || row.status !== "active") return null;
  if (row.role !== "admin" && row.role !== "employee") return null;

  const admin = row.role === "admin";
  const content = row.can_manage_content === true;
  const contentPermission = (column: string) => admin || row[column] === true || (row[column] == null && content);
  const permissions: UserPermissions = {
    news: contentPermission("can_manage_news"),
    tests: contentPermission("can_manage_tests"),
    results: contentPermission("can_manage_results"),
    resetResults: admin || row.can_reset_test_results === true,
    uav: contentPermission("can_manage_uav"),
    counteraction: contentPermission("can_manage_counteraction"),
    tacticalMedicine: contentPermission("can_manage_tactical_medicine"),
    userList: admin || row.can_view_user_list === true,
    users: admin || row.can_manage_users === true,
    online: admin || row.can_view_online === true,
    personnelModeration: admin || row.can_moderate_personnel === true,
  };
  return {
    id: row.id,
    role: row.role,
    name: typeof row.name === "string" ? row.name : "",
    callsign: typeof row.callsign === "string" ? row.callsign : "",
    position: (typeof row.position === "string" ? row.position : "Специалист") as SessionUser["position"],
    canManageContent: permissions.news || permissions.tests || permissions.uav || permissions.counteraction || permissions.tacticalMedicine,
    permissions,
    unitAssignment: normalizeUnitAssignment(row.unit_assignment),
    avatarUrl: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url.trim() : null,
    nameColor: normalizeProfileNameColor(row.profile_name_color),
  };
}

/** getUser validates the Supabase token with Auth; cookie-supplied user/role are not trusted. */
export async function resolveVerifiedSession(
  authClient: Pick<SupabaseClient, "auth">,
  profileClient: Pick<SupabaseClient, "from">,
): Promise<SessionUser | null> {
  try {
    const { data, error } = await authClient.auth.getUser();
    if (error || !data.user?.id) return null;
    const profile = await profileClient.from("app_users")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    if (profile.error || !profile.data) return null;
    return sessionFromProfile(profile.data as Record<string, unknown>);
  } catch {
    // Backend/network failures must never grant an identity or elevated permissions.
    return null;
  }
}
