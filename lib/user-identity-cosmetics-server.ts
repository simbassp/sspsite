import type { TopRankBadgeId } from "@/lib/achievements-catalog";
import { buildPersonnelRosterTops, type PersonnelRosterTopUser } from "@/lib/personnel-catalog";
import { loadPersonnelRoster } from "@/lib/personnel-server";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import {
  ACHIEVEMENT_COSMETIC_USER_COLUMNS,
  IDENTITY_COSMETIC_USER_COLUMNS,
  mapIdentityCosmeticsFromRow,
  type UserIdentityCosmetics,
} from "@/lib/user-identity-cosmetics";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function fetchUserCosmeticRow(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  const withBank = await supabase
    .from("app_users")
    .select(`${ACHIEVEMENT_COSMETIC_USER_COLUMNS},profile_cosmetic_bank_overlay`)
    .eq("id", userId)
    .maybeSingle();
  if (!withBank.error) return (withBank.data ?? {}) as Record<string, unknown>;

  if (isMissingColumnError(withBank.error.message)) {
    const core = await supabase
      .from("app_users")
      .select(ACHIEVEMENT_COSMETIC_USER_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (!core.error) return (core.data ?? {}) as Record<string, unknown>;
  }

  return {};
}

let topRankCache: { ts: number; map: Map<string, TopRankBadgeId> } | null = null;
let topRankInflight: Promise<Map<string, TopRankBadgeId>> | null = null;
const TOP_RANK_CACHE_MS = 5 * 60_000;

export function buildTopRankBadgeMapFromUsers<T extends PersonnelRosterTopUser>(users: T[]): Map<string, TopRankBadgeId> {
  const map = new Map<string, TopRankBadgeId>();
  if (!users.length) return map;
  const tops = buildPersonnelRosterTops(users);
  tops.trialTests.slice(0, 3).forEach((user, index) => {
    const badge: TopRankBadgeId = index === 0 ? "top-1" : index === 1 ? "top-2" : "top-3";
    map.set(user.id, badge);
  });
  return map;
}

/** Топ-бейджи по активности роты; кэш 5 мин, без повторной загрузки roster параллельно. */
export async function loadTopRankBadgeMap(): Promise<Map<string, TopRankBadgeId>> {
  const now = Date.now();
  if (topRankCache && now - topRankCache.ts < TOP_RANK_CACHE_MS) {
    return topRankCache.map;
  }
  if (topRankInflight) return topRankInflight;

  topRankInflight = (async () => {
    const map = new Map<string, TopRankBadgeId>();
    try {
      const roster = await loadPersonnelRoster({ platoon: "all", section: "all" });
      if (roster.ok && roster.users.length) {
        for (const [id, badge] of buildTopRankBadgeMapFromUsers(roster.users)) {
          map.set(id, badge);
        }
      }
    } finally {
      topRankInflight = null;
    }
    topRankCache = { ts: Date.now(), map };
    return map;
  })();

  return topRankInflight;
}

export type LoadIdentityCosmeticsOptions = {
  /** Тяжёлая операция — только для одиночных профилей. По умолчанию false. */
  includeTopRank?: boolean;
};

export async function loadIdentityCosmeticsMap(
  userIds: string[],
  options: LoadIdentityCosmeticsOptions = {},
): Promise<Map<string, UserIdentityCosmetics>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, UserIdentityCosmetics>();
  if (!uniqueIds.length) return result;

  const includeTopRank = options.includeTopRank === true && uniqueIds.length <= 3;
  const supabase = getServerSupabaseServiceClient();

  const [usersQ, topRankMap] = await Promise.all([
    supabase.from("app_users").select(`id,${IDENTITY_COSMETIC_USER_COLUMNS}`).in("id", uniqueIds),
    includeTopRank ? loadTopRankBadgeMap() : Promise.resolve(new Map<string, TopRankBadgeId>()),
  ]);

  let rows = (usersQ.data ?? []) as Array<Record<string, unknown>>;
  if (usersQ.error && isMissingColumnError(usersQ.error.message)) {
    const fallback = await supabase
      .from("app_users")
      .select(`id,profile_name_color,${ACHIEVEMENT_COSMETIC_USER_COLUMNS}`)
      .in("id", uniqueIds);
    rows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    result.set(id, mapIdentityCosmeticsFromRow(row, includeTopRank ? topRankMap.get(id) ?? null : null));
  }

  for (const id of uniqueIds) {
    if (!result.has(id)) {
      result.set(
        id,
        mapIdentityCosmeticsFromRow({}, includeTopRank ? topRankMap.get(id) ?? null : null),
      );
    }
  }

  return result;
}

export function mapIdentityCosmeticsFromUserRow(
  row: Record<string, unknown>,
  topRankBadge: TopRankBadgeId | null = null,
): UserIdentityCosmetics {
  return mapIdentityCosmeticsFromRow(row, topRankBadge);
}

export async function loadIdentityCosmeticsForUser(
  userId: string,
  options: LoadIdentityCosmeticsOptions = { includeTopRank: true },
): Promise<UserIdentityCosmetics> {
  const map = await loadIdentityCosmeticsMap([userId], options);
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
