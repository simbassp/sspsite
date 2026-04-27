import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id,auth_user_id,login,name,callsign,position,can_manage_content,can_manage_news,can_manage_tests,can_manage_results,can_manage_uav,can_manage_counteraction,can_manage_users,role,status",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, rows: data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_users_list_exception" },
      { status: 500 },
    );
  }
}
