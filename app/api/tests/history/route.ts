import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    let query = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (query.error && isMissingColumnError(query.error.message)) {
      query = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20);
    }
    if (query.error) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/tests/history] query error", { userId: session.id, message: query.error.message });
      }
      return Response.json({ ok: false, error: query.error.message }, { status: 500 });
    }
    const rows = ((query.data || []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type ?? r.test_type,
      status: r.status,
      score: r.score,
      created_at: r.created_at,
    }));
    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/tests/history] ok", { userId: session.id, count: rows.length });
    }
    return Response.json({ ok: true, rows });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}
