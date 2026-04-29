import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { canManageUsers } from "@/lib/permissions";
import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";

export const runtime = "nodejs";

function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= ONLINE_LAST_SEEN_MAX_MS;
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

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
    let accessStats: { totalUsers: number; onlineUsers: number } | null = null;

    if (canManageUsers(session)) {
      const onlineStrictQ = await supabase.from("app_users").select("id,is_online,last_seen_at");
      if (onlineStrictQ.error && isMissingColumnError(onlineStrictQ.error.message)) {
        const fallbackQ = await supabase.from("app_users").select("id,is_online");
        if (!fallbackQ.error) {
          const rows = Array.isArray(fallbackQ.data) ? fallbackQ.data : [];
          accessStats = {
            totalUsers: rows.length,
            onlineUsers: rows.filter((row) => row.is_online === true).length,
          };
        }
      } else if (!onlineStrictQ.error) {
        const rows = Array.isArray(onlineStrictQ.data) ? onlineStrictQ.data : [];
        accessStats = {
          totalUsers: rows.length,
          onlineUsers: rows.filter((row) => effectiveOnlineStrict(row.is_online, row.last_seen_at)).length,
        };
      }
    }

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
      accessStats,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
