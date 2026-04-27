import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const { data, error } = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/tests/history] query error", { userId: session.id, message: error.message });
      }
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/tests/history] ok", { userId: session.id, count: (data || []).length });
    }
    return Response.json({ ok: true, rows: data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}
