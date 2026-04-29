import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const primary = await supabase.from("test_results").delete().eq("user_id", session.id).eq("type", "trial");
    if (!primary.error) return Response.json({ ok: true });

    const legacy = await supabase.from("test_results").delete().eq("user_id", session.id).eq("test_type", "trial");
    if (legacy.error) {
      return Response.json({ ok: false, error: legacy.error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_reset_stats_exception" },
      { status: 500 },
    );
  }
}
