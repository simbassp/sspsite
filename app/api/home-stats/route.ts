import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const newestQ = await supabase
      .from("app_users")
      .select("id,name,callsign,created_at,status")
      .order("created_at", { ascending: false })
      .limit(1);

    const leftQ = await supabase
      .from("dashboard_events")
      .select("id,payload,created_at")
      .eq("kind", "user_deleted")
      .order("created_at", { ascending: false })
      .limit(1);

    const promotedQ = await supabase
      .from("dashboard_events")
      .select("id,payload,created_at")
      .eq("kind", "position_promoted")
      .order("created_at", { ascending: false })
      .limit(1);

    const newest = Array.isArray(newestQ.data) ? newestQ.data[0] : null;
    const left = Array.isArray(leftQ.data) ? leftQ.data[0] : null;
    const promoted = Array.isArray(promotedQ.data) ? promotedQ.data[0] : null;
    const leftPayload = (left?.payload || {}) as Record<string, unknown>;
    const promotedPayload = (promoted?.payload || {}) as Record<string, unknown>;

    return Response.json({
      ok: true,
      highlights: {
        newcomer: newest
          ? {
              name: String(newest.name || ""),
              callsign: String(newest.callsign || ""),
              created_at: newest.created_at,
            }
          : null,
        departed: left
          ? {
              name: String(leftPayload.name || ""),
              callsign: String(leftPayload.callsign || ""),
              created_at: left.created_at,
            }
          : null,
        promoted: promoted
          ? {
              name: String(promotedPayload.name || ""),
              callsign: String(promotedPayload.callsign || ""),
              position: String(promotedPayload.position || ""),
              created_at: promoted.created_at,
            }
          : null,
        commander: { name: "Владислав", callsign: "Клиган" },
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
