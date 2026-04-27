import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

/** Использовать только при наличии колонки last_seen_at в БД. */
function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= ONLINE_LAST_SEEN_MAX_MS;
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const primaryQ = await supabase
      .from("app_users")
      .select(
        "id,auth_user_id,login,name,callsign,position,can_manage_content,can_manage_news,can_manage_tests,can_manage_results,can_manage_uav,can_manage_counteraction,can_manage_users,can_reset_test_results,can_view_online,is_online,last_seen_at,role,status",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    let rows: Array<Record<string, unknown>> = (primaryQ.data || []) as Array<Record<string, unknown>>;
    let queryError: string | null = primaryQ.error?.message || null;
    let onlineFromFlagOnly = false;
    if (primaryQ.error && isMissingColumnError(primaryQ.error.message)) {
      const fallbackQ = await supabase
        .from("app_users")
        .select("id,name,callsign,position,role,status,can_manage_content,is_online")
        .limit(1000);
      rows = (fallbackQ.data || []) as Array<Record<string, unknown>>;
      queryError = fallbackQ.error?.message || null;
      onlineFromFlagOnly = true;
    }
    if (queryError) return Response.json({ ok: false, error: queryError }, { status: 500 });
    const normalized = rows.map((r) => ({
      id: r.id,
      auth_user_id: r.auth_user_id ?? null,
      login: typeof r.login === "string" ? r.login : "",
      name: r.name,
      callsign: r.callsign,
      position: r.position,
      can_manage_content: r.can_manage_content ?? false,
      can_manage_news: r.can_manage_news ?? undefined,
      can_manage_tests: r.can_manage_tests ?? undefined,
      can_manage_results: r.can_manage_results ?? undefined,
      can_manage_uav: r.can_manage_uav ?? undefined,
      can_manage_counteraction: r.can_manage_counteraction ?? undefined,
      can_manage_users: r.can_manage_users ?? false,
      can_reset_test_results: r.can_reset_test_results ?? undefined,
      can_view_online: r.can_view_online ?? false,
      is_online: onlineFromFlagOnly ? r.is_online === true : effectiveOnlineStrict(r.is_online, r.last_seen_at),
      role: r.role === "admin" ? "admin" : "employee",
      status: r.status === "inactive" ? "inactive" : "active",
    }));
    return Response.json({ ok: true, rows: normalized });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_users_list_exception" },
      { status: 500 },
    );
  }
}
