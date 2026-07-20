import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { readSiteSettingNumber } from "@/lib/site-analytics";
import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { mapIdentityCosmeticsFromRow, type UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";
import { loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { UNIT_COMMANDERS, unitAssignmentLabel } from "@/lib/unit-assignment";

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

function mapOnlineUser(row: Record<string, unknown>, cosmetics: UserIdentityCosmetics) {
  return {
    id: String(row.id || ""),
    name: toSafeString(row.name),
    callsign: toSafeString(row.callsign),
    nameColor: cosmetics.adminNameColor ?? null,
    cosmetics,
  };
}

function buildPerson(
  name: unknown,
  callsign: unknown,
  cosmetics: UserIdentityCosmetics,
  tail?: string,
) {
  return {
    name: toSafeString(name),
    callsign: toSafeString(callsign),
    nameColor: cosmetics.adminNameColor ?? null,
    cosmetics,
    ...(tail ? { tail } : {}),
  };
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const [newestQ, leftQ, promotedQ] = await Promise.all([
      supabase
        .from("app_users")
        .select("id,name,callsign,created_at,status,profile_name_color")
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

    let newest: Record<string, unknown> | null = Array.isArray(newestQ.data)
      ? (newestQ.data[0] as Record<string, unknown>)
      : null;
    if (newestQ.error && isMissingColumnError(newestQ.error.message)) {
      const fallbackNewest = await supabase
        .from("app_users")
        .select("id,name,callsign,created_at,status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      newest = (fallbackNewest.data as Record<string, unknown> | null) ?? null;
    }

    const left = Array.isArray(leftQ.data) ? leftQ.data[0] : null;
    const promoted = Array.isArray(promotedQ.data) ? promotedQ.data[0] : null;
    const leftPayload = (left?.payload || {}) as Record<string, unknown>;
    const promotedPayload = (promoted?.payload || {}) as Record<string, unknown>;

    const colorLookupIds = [
      typeof newest?.id === "string" ? newest.id : "",
      typeof leftPayload.user_id === "string" ? leftPayload.user_id : "",
      typeof promotedPayload.user_id === "string" ? promotedPayload.user_id : "",
    ].filter(Boolean);

    let usersSummary: {
      totalUsers: number;
      onlineUsers: Array<{
        id: string;
        name: string;
        callsign: string;
        nameColor: ProfileNameColorId | null;
        cosmetics: UserIdentityCosmetics;
      }>;
    } | null = null;
    let siteAnalytics: { totalVisits: number; totalActiveSeconds: number } | null = null;

    const onlineStrictQ = supabase
      .from("app_users")
      .select("id,name,callsign,is_online,last_seen_at,status,profile_name_color")
      .eq("status", "active");
    const analyticsQ = supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["site_total_visits", "site_total_active_seconds"]);

    const [onlineStrictRes, analyticsRes] = await Promise.all([onlineStrictQ, analyticsQ]);

    if (onlineStrictRes.error && isMissingColumnError(onlineStrictRes.error.message)) {
      const fallbackQ = await supabase.from("app_users").select("id,name,callsign,is_online,status");
      if (!fallbackQ.error) {
        const rows = Array.isArray(fallbackQ.data) ? fallbackQ.data : [];
        const activeRows = rows.filter((row) => String(row.status || "active") === "active");
        const onlineRows = activeRows.filter((row) => row.is_online === true);
        const fallbackCosmeticsMap = await loadIdentityCosmeticsMap(onlineRows.map((row) => String(row.id || "")));
        usersSummary = {
          totalUsers: activeRows.length,
          onlineUsers: onlineRows.map((row) => {
            const id = String(row.id || "");
            const cosmetics = fallbackCosmeticsMap.get(id) ?? mapIdentityCosmeticsFromRow({});
            return mapOnlineUser(row as Record<string, unknown>, cosmetics);
          }),
        };
      }
    } else if (!onlineStrictRes.error) {
      const rows = Array.isArray(onlineStrictRes.data) ? onlineStrictRes.data : [];
      const onlineRows = rows
        .filter((row) => effectiveOnlineStrict(row.is_online, row.last_seen_at))
        .sort((a, b) => toSafeString(a.name).localeCompare(toSafeString(b.name), "ru"));
      const cosmeticsMap = await loadIdentityCosmeticsMap(onlineRows.map((row) => String(row.id || "")));
      usersSummary = {
        totalUsers: rows.length,
        onlineUsers: onlineRows.map((row) => {
          const id = String(row.id || "");
          const cosmetics = cosmeticsMap.get(id) ?? mapIdentityCosmeticsFromRow(row as Record<string, unknown>);
          return mapOnlineUser(row as Record<string, unknown>, cosmetics);
        }),
      };
    }

    const cosmeticsMap = await loadIdentityCosmeticsMap(colorLookupIds);

    if (!analyticsRes.error) {
      const map = new Map((analyticsRes.data ?? []).map((row) => [String(row.key), row.value]));
      siteAnalytics = {
        totalVisits: readSiteSettingNumber(map.get("site_total_visits")),
        totalActiveSeconds: readSiteSettingNumber(map.get("site_total_active_seconds")),
      };
    } else {
      const totalsQ = await supabase.from("app_users").select("visit_count,active_seconds_total");
      if (!totalsQ.error) {
        const rows = totalsQ.data ?? [];
        siteAnalytics = {
          totalVisits: rows.reduce((sum, row) => sum + readSiteSettingNumber(row.visit_count), 0),
          totalActiveSeconds: rows.reduce((sum, row) => sum + readSiteSettingNumber(row.active_seconds_total), 0),
        };
      }
    }

    const leftUserId = typeof leftPayload.user_id === "string" ? leftPayload.user_id : "";
    const promotedUserId = typeof promotedPayload.user_id === "string" ? promotedPayload.user_id : "";

    const events = [
      newest
        ? {
            id: `newcomer:${String(newest.id || "")}`,
            type: "user_added",
            title: "Наш новый товарищ:",
            description: formatPerson(newest.name, newest.callsign),
            person: buildPerson(
              newest.name,
              newest.callsign,
              cosmeticsMap.get(String(newest.id || "")) ?? mapIdentityCosmeticsFromRow(newest),
            ),
            created_at: newest.created_at ? String(newest.created_at) : null,
          }
        : null,
      left
        ? {
            id: `left:${String(left.id || "")}`,
            type: "user_removed",
            title: "Товарищ покинул нас:",
            description: formatPerson(leftPayload.name, leftPayload.callsign),
            person: buildPerson(
              leftPayload.name,
              leftPayload.callsign,
              leftUserId
                ? cosmeticsMap.get(leftUserId) ?? mapIdentityCosmeticsFromRow({})
                : mapIdentityCosmeticsFromRow({}),
            ),
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
            person: buildPerson(
              promotedPayload.name,
              promotedPayload.callsign,
              promotedUserId
                ? cosmeticsMap.get(promotedUserId) ?? mapIdentityCosmeticsFromRow({})
                : mapIdentityCosmeticsFromRow({}),
              ` — новая должность: ${toSafeString(promotedPayload.position) || "Не указана"}`,
            ),
            created_at: promoted.created_at ? String(promoted.created_at) : null,
          }
        : null,
      ...UNIT_COMMANDERS.map((item) => ({
        id: `commander:${item.unit}`,
        type: "commander_assigned" as const,
        title: unitAssignmentLabel[item.unit],
        description: item.commander,
        created_at: null,
      })),
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
      siteAnalytics,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
