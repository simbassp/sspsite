import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { readSiteSettingNumber } from "@/lib/site-analytics";
import { effectiveOnlineStrict, onlineStaleBeforeIso } from "@/lib/presence-online";
import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { mapIdentityCosmeticsFromRow, type UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";
import { loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { createRouteCache } from "@/lib/server-route-cache";

export const runtime = "nodejs";

const HOME_STATS_CACHE_MS = 30_000;

const ONLINE_USER_CORE_COLUMNS = "id,name,callsign,is_online,last_seen_at,status,profile_name_color";

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

function cosmeticsFromRow(row: Record<string, unknown>): UserIdentityCosmetics {
  return mapIdentityCosmeticsFromRow(row);
}

type HomeStatsBody = {
  ok: true;
  events: unknown[];
  usersSummary: {
    totalUsers: number;
    onlineUsers: Array<{
      id: string;
      name: string;
      callsign: string;
      nameColor: ProfileNameColorId | null;
      cosmetics: UserIdentityCosmetics;
    }>;
  } | null;
  siteAnalytics: { totalVisits: number; totalActiveSeconds: number } | null;
};

const homeStatsCache = createRouteCache<HomeStatsBody>(HOME_STATS_CACHE_MS);

async function buildHomeStats(): Promise<HomeStatsBody> {
  const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 8_000 });
    const [newestQ, leftQ] = await Promise.all([
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
    const leftPayload = (left?.payload || {}) as Record<string, unknown>;
    const leftUserId = typeof leftPayload.user_id === "string" ? leftPayload.user_id : "";

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

    const staleBefore = onlineStaleBeforeIso();
    const onlineStrictQ = supabase
      .from("app_users")
      .select(ONLINE_USER_CORE_COLUMNS)
      .eq("status", "active")
      .eq("is_online", true)
      .gte("last_seen_at", staleBefore);
    const totalUsersQ = supabase.from("app_users").select("id", { count: "exact", head: true }).eq("status", "active");
    const analyticsQ = supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["site_total_visits", "site_total_active_seconds"]);

    const [onlineStrictRes, totalUsersRes, analyticsRes] = await Promise.all([
      onlineStrictQ,
      totalUsersQ,
      analyticsQ,
    ]);

    if (onlineStrictRes.error && isMissingColumnError(onlineStrictRes.error.message)) {
      const fallbackQ = await supabase.from("app_users").select("id,name,callsign,is_online,status");
      if (!fallbackQ.error) {
        const rows = Array.isArray(fallbackQ.data) ? fallbackQ.data : [];
        const activeRows = rows.filter((row) => String(row.status || "active") === "active");
        const onlineRows = activeRows.filter((row) => row.is_online === true);
        const onlineIds = onlineRows.map((row) => String(row.id || "")).filter(Boolean);
        const cosmeticsById = onlineIds.length ? await loadIdentityCosmeticsMap(onlineIds) : new Map<string, UserIdentityCosmetics>();
        usersSummary = {
          totalUsers: activeRows.length,
          onlineUsers: onlineRows.map((row) => {
            const record = row as Record<string, unknown>;
            const id = String(record.id || "");
            const cosmetics = cosmeticsById.get(id) ?? cosmeticsFromRow(record);
            return mapOnlineUser(record, cosmetics);
          }),
        };
      }
    } else if (!onlineStrictRes.error) {
      const rows = Array.isArray(onlineStrictRes.data) ? onlineStrictRes.data : [];
      const onlineRows = rows
        .filter((row) => effectiveOnlineStrict(row.is_online, row.last_seen_at))
        .sort((a, b) => toSafeString(a.name).localeCompare(toSafeString(b.name), "ru"));

      const onlineIds = onlineRows.map((row) => String(row.id || "")).filter(Boolean);
      const cosmeticsById = onlineIds.length ? await loadIdentityCosmeticsMap(onlineIds) : new Map<string, UserIdentityCosmetics>();
      const totalUsers = typeof totalUsersRes.count === "number" ? totalUsersRes.count : rows.length;

      usersSummary = {
        totalUsers,
        onlineUsers: onlineRows.map((row) => {
          const record = row as Record<string, unknown>;
          const id = String(record.id || "");
          const cosmetics = cosmeticsById.get(id) ?? cosmeticsFromRow(record);
          return mapOnlineUser(record, cosmetics);
        }),
      };
    }

    const eventUserIds = [
      newest && typeof newest.id === "string" ? newest.id : "",
      leftUserId,
    ].filter(Boolean);
    const eventCosmeticsById = eventUserIds.length
      ? await loadIdentityCosmeticsMap(eventUserIds)
      : new Map<string, UserIdentityCosmetics>();

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

    const events = [
      newest
        ? {
            id: `newcomer:${String(newest.id || "")}`,
            type: "user_added",
            title: "Новый пользователь",
            description: formatPerson(newest.name, newest.callsign),
            person: buildPerson(
              newest.name,
              newest.callsign,
              eventCosmeticsById.get(String(newest.id || "")) ?? cosmeticsFromRow(newest),
            ),
            created_at: newest.created_at ? String(newest.created_at) : null,
          }
        : null,
      left
        ? {
            id: `left:${String(left.id || "")}`,
            type: "user_removed",
            title: "Пользователь покинул нас",
            description: formatPerson(leftPayload.name, leftPayload.callsign),
            person: buildPerson(
              leftPayload.name,
              leftPayload.callsign,
              leftUserId
                ? eventCosmeticsById.get(leftUserId) ?? mapIdentityCosmeticsFromRow({})
                : mapIdentityCosmeticsFromRow({}),
            ),
            created_at: left.created_at ? String(left.created_at) : null,
          }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a?.created_at ? Date.parse(a.created_at) : -1;
        const tb = b?.created_at ? Date.parse(b.created_at) : -1;
        return tb - ta;
      })
      .slice(0, 8);

  return {
    ok: true,
    events,
    usersSummary,
    siteAnalytics,
  };
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const body = await homeStatsCache.getOrLoad(buildHomeStats);
    return Response.json(body);
  } catch {
    const cached = homeStatsCache.read();
    if (cached) return Response.json(cached);
    return Response.json({
      ok: true,
      events: [],
      usersSummary: null,
      siteAnalytics: null,
      degraded: true,
    });
  }
}
