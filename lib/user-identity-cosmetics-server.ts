import type { TopRankBadgeId } from "@/lib/achievements-catalog";
import { buildPersonnelRosterTops } from "@/lib/personnel-catalog";
import { loadPersonnelRoster } from "@/lib/personnel-server";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import {
  IDENTITY_COSMETIC_USER_COLUMNS,
  mapIdentityCosmeticsFromRow,
  type UserIdentityCosmetics,
} from "@/lib/user-identity-cosmetics";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

let topRankCache: { ts: number; map: Map<string, TopRankBadgeId> } | null = null;
const TOP_RANK_CACHE_MS = 60_000;

export async function loadTopRankBadgeMap(): Promise<Map<string, TopRankBadgeId>> {
  const now = Date.now();
  if (topRankCache && now - topRankCache.ts < TOP_RANK_CACHE_MS) {
    return topRankCache.map;
  }

  const map = new Map<string, TopRankBadgeId>();
  const roster = await loadPersonnelRoster({ platoon: "all", section: "all", module: "all" });
  if (roster.ok && roster.users.length) {
    const tops = buildPersonnelRosterTops(roster.users);
    tops.activity.slice(0, 3).forEach((user, index) => {
      const badge: TopRankBadgeId = index === 0 ? "top-1" : index === 1 ? "top-2" : "top-3";
      map.set(user.id, badge);
    });
  }

  topRankCache = { ts: now, map };
  return map;
}

export async function loadIdentityCosmeticsMap(userIds: string[]): Promise<Map<string, UserIdentityCosmetics>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, UserIdentityCosmetics>();
  if (!uniqueIds.length) return result;

  const supabase = getServerSupabaseServiceClient();
  const [usersQ, topRankMap] = await Promise.all([
    supabase.from("app_users").select(`id,${IDENTITY_COSMETIC_USER_COLUMNS}`).in("id", uniqueIds),
    loadTopRankBadgeMap(),
  ]);

  let rows = (usersQ.data ?? []) as Array<Record<string, unknown>>;
  if (usersQ.error && isMissingColumnError(usersQ.error.message)) {
    const fallback = await supabase.from("app_users").select("id,profile_name_color").in("id", uniqueIds);
    rows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    result.set(id, mapIdentityCosmeticsFromRow(row as Record<string, unknown>, topRankMap.get(id) ?? null));
  }

  for (const id of uniqueIds) {
    if (!result.has(id)) {
      result.set(id, mapIdentityCosmeticsFromRow({}, topRankMap.get(id) ?? null));
    }
  }

  return result;
}

export async function loadIdentityCosmeticsForUser(userId: string): Promise<UserIdentityCosmetics> {
  const map = await loadIdentityCosmeticsMap([userId]);
  return map.get(userId) ?? {};
}

export async function loadAchievementNotifications(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const notifyQ = await supabase
    .from("app_notifications")
    .select("id,title,body,created_at")
    .eq("user_id", userId)
    .eq("kind", "achievement")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  if (notifyQ.error) return [];
  return (notifyQ.data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}
