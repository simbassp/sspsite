import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const t0 = Date.now();
    const { data, error } = await supabase
      .from("test_results")
      .select("id,user_id,test_type:type,status,score,created_at,completed_at:created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const t1 = Date.now();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, rows: data || [], timingsMs: { historyQuery: t1 - t0 } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}
