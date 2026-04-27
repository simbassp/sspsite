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
    let usersQ = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("status", "active");
    if (usersQ.error && isMissingColumnError(usersQ.error.message)) {
      usersQ = await supabase.from("app_users").select("id", { count: "exact", head: true });
    }
    const newsQ = await supabase.from("news").select("id", { count: "exact", head: true });
    if (usersQ.error || newsQ.error) {
      return Response.json(
        { ok: false, error: usersQ.error?.message || newsQ.error?.message || "home_stats_failed" },
        { status: 500 },
      );
    }
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

    const reactionsQ = await supabase.from("dashboard_reactions").select("card_key,emoji,user_id");

    const reactionCounts: Record<string, Record<string, number>> = {
      newcomer: {},
      departed: {},
      promoted: {},
      commander: {},
    };
    const myReactions: Record<string, string | null> = {
      newcomer: null,
      departed: null,
      promoted: null,
      commander: null,
    };

    if (!reactionsQ.error && Array.isArray(reactionsQ.data)) {
      for (const row of reactionsQ.data) {
        const cardKey = String((row as { card_key?: unknown }).card_key || "");
        const emoji = String((row as { emoji?: unknown }).emoji || "");
        const userId = String((row as { user_id?: unknown }).user_id || "");
        if (!reactionCounts[cardKey] || !emoji) continue;
        reactionCounts[cardKey][emoji] = (reactionCounts[cardKey][emoji] || 0) + 1;
        if (userId === session.id) {
          myReactions[cardKey] = emoji;
        }
      }
    }

    const newest = Array.isArray(newestQ.data) ? newestQ.data[0] : null;
    const left = Array.isArray(leftQ.data) ? leftQ.data[0] : null;
    const promoted = Array.isArray(promotedQ.data) ? promotedQ.data[0] : null;
    const leftPayload = (left?.payload || {}) as Record<string, unknown>;
    const promotedPayload = (promoted?.payload || {}) as Record<string, unknown>;

    return Response.json({
      ok: true,
      active_users: usersQ.count ?? 0,
      news_count: newsQ.count ?? 0,
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
      reactions: reactionCounts,
      my_reactions: myReactions,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
