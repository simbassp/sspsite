import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { canManageUsers, canViewOnline } from "@/lib/permissions";
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

function toSafeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatPerson(name: unknown, callsign: unknown) {
  const n = toSafeString(name).trim();
  const c = toSafeString(callsign).trim();
  if (n && c) return `${n} ${c}`;
  return n || c || "Пользователь";
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const [newestQ, leftQ, promotedQ] = await Promise.all([
      supabase
        .from("app_users")
        .select("id,name,callsign,created_at,status")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("dashboard_events")
        .select("id,payload,created_at")
        .eq("kind", "user_deleted")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("dashboard_events")
        .select("id,payload,created_at")
        .eq("kind", "position_promoted")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const newest = Array.isArray(newestQ.data) ? newestQ.data[0] : null;
    const left = Array.isArray(leftQ.data) ? leftQ.data[0] : null;
    const promoted = Array.isArray(promotedQ.data) ? promotedQ.data[0] : null;
    const leftPayload = (left?.payload || {}) as Record<string, unknown>;
    const promotedPayload = (promoted?.payload || {}) as Record<string, unknown>;
    let usersSummary: { totalUsers: number; onlineUsers: Array<{ id: string; name: string; callsign: string }> } | null = null;
    const canReadUsersSummary = canManageUsers(session) || canViewOnline(session);

    if (canReadUsersSummary) {
      const onlineStrictQ = await supabase.from("app_users").select("id,name,callsign,is_online,last_seen_at");
      if (onlineStrictQ.error && isMissingColumnError(onlineStrictQ.error.message)) {
        const fallbackQ = await supabase.from("app_users").select("id,name,callsign,is_online");
        if (!fallbackQ.error) {
          const rows = Array.isArray(fallbackQ.data) ? fallbackQ.data : [];
          const onlineRows = rows.filter((row) => row.is_online === true);
          usersSummary = {
            totalUsers: rows.length,
            onlineUsers: onlineRows.map((row) => ({
              id: String(row.id || ""),
              name: toSafeString(row.name),
              callsign: toSafeString(row.callsign),
            })),
          };
        }
      } else if (!onlineStrictQ.error) {
        const rows = Array.isArray(onlineStrictQ.data) ? onlineStrictQ.data : [];
        const onlineRows = rows.filter((row) => effectiveOnlineStrict(row.is_online, row.last_seen_at));
        usersSummary = {
          totalUsers: rows.length,
          onlineUsers: onlineRows.map((row) => ({
            id: String(row.id || ""),
            name: toSafeString(row.name),
            callsign: toSafeString(row.callsign),
          })),
        };
      }
    }

    const events = [
      newest
        ? {
            id: `newcomer:${String(newest.id || "")}`,
            type: "user_added",
            title: "Наш новый товарищ:",
            description: formatPerson(newest.name, newest.callsign),
            created_at: newest.created_at ? String(newest.created_at) : null,
          }
        : null,
      left
        ? {
            id: `left:${String(left.id || "")}`,
            type: "user_removed",
            title: "Товарищ покинул нас:",
            description: formatPerson(leftPayload.name, leftPayload.callsign),
            created_at: left.created_at ? String(left.created_at) : null,
          }
        : null,
      promoted
        ? {
            id: `promoted:${String(promoted.id || "")}`,
            type: "position_changed",
            title: "Повышение должности",
            description: `${formatPerson(promotedPayload.name, promotedPayload.callsign)} — новая должность: ${
              toSafeString(promotedPayload.position) || "Не указана"
            }`,
            created_at: promoted.created_at ? String(promoted.created_at) : null,
          }
        : null,
      {
        id: "commander",
        type: "commander_assigned",
        title: "Наш командир",
        description: "Владислав Клиган",
        created_at: null,
      },
    ]
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a?.created_at ? Date.parse(a.created_at) : -1;
        const tb = b?.created_at ? Date.parse(b.created_at) : -1;
        return tb - ta;
      })
      .slice(0, 8);

    return Response.json({
      ok: true,
      events,
      usersSummary,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
