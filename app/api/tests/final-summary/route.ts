import { computeFinalTestSummary } from "@/lib/server-final-test-summary";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const finalTest = await computeFinalTestSummary(supabase, session.id);
    return Response.json({ ok: true, finalTest });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "final_summary_exception" },
      { status: 500 },
    );
  }
}
