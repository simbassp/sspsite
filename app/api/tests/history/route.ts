import { loadTestsHistoryRows } from "@/lib/tests-history-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 12_000 });
    const result = await loadTestsHistoryRows(supabase, session.id);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 500 });
    }
    return Response.json({ ok: true, rows: result.rows });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}
