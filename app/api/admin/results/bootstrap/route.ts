import { canManageResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const [usersQ, resultsQ] = await Promise.all([
      supabase.from("app_users").select("id,name,callsign,role,status").order("created_at", { ascending: false }).limit(1000),
      supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .eq("type", "final")
        .order("created_at", { ascending: false })
        .limit(3000),
    ]);

    if (usersQ.error || resultsQ.error) {
      return Response.json(
        { ok: false, error: usersQ.error?.message || resultsQ.error?.message || "admin_results_failed" },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      users: usersQ.data || [],
      results: resultsQ.data || [],
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_results_exception" },
      { status: 500 },
    );
  }
}
