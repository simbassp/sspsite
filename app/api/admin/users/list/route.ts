import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

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
        "id,auth_user_id,login,name,callsign,position,can_manage_content,can_manage_news,can_manage_tests,can_manage_results,can_manage_uav,can_manage_counteraction,can_manage_users,can_view_online,is_online,role,status",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    let rows: Array<Record<string, unknown>> = (primaryQ.data || []) as Array<Record<string, unknown>>;
    let queryError: string | null = primaryQ.error?.message || null;
    if (primaryQ.error && isMissingColumnError(primaryQ.error.message)) {
      const fallbackQ = await supabase
        .from("app_users")
        .select("id,name,callsign,position,role,status,can_manage_content,is_online")
        .limit(1000);
      rows = (fallbackQ.data || []) as Array<Record<string, unknown>>;
      queryError = fallbackQ.error?.message || null;
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
      can_view_online: r.can_view_online ?? false,
      is_online: r.is_online ?? false,
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
