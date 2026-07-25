import { normalizeProfileNameColor, type ProfileNameColorId } from "@/lib/profile-name-color";
import { normalizeAvatarStoragePath } from "@/lib/avatar-display";
import {
  ACHIEVEMENT_COSMETIC_USER_COLUMNS,
  IDENTITY_COSMETIC_USER_COLUMNS,
  mapIdentityCosmeticsFromRow,
  mergeIdentityCosmetics,
  type UserIdentityCosmetics,
} from "@/lib/user-identity-cosmetics";
import { buildTopRankBadgeMapFromUsers, loadIdentityCosmeticsMap } from "@/lib/user-identity-cosmetics-server";
import { normalizeUnitAssignment, matchesUnitFilter, type UnitAssignmentFilter } from "@/lib/unit-assignment";
import type { DutyLocation, Position, UnitAssignment } from "@/lib/types";
import {
  buildPersonnelRosterTops,
  formatNotificationBody,
  type PersonnelLicenseCategory,
  normalizePersonnelLicenseCategories,
} from "@/lib/personnel-catalog";
import { resolveBulkLinkedUserIds, resolveFinalUserContext } from "@/lib/server-final-user-context";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import {
  calcRosterStats,
  hasAdvancedRosterFilters,
  userMatchesRosterFilters,
  type RosterFilterParams,
  EMPTY_ROSTER_FILTER_PARAMS,
} from "@/lib/personnel-roster-filters";

export type PersonnelModuleSettings = {
  moduleEnabled: boolean;
  moderationEnabled: boolean;
};

export type PersonnelTestRosterStats = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

export type PersonnelUserCard = {
  id: string;
  name: string;
  callsign: string;
  avatarUrl?: string | null;
  nameColor?: ProfileNameColorId | null;
  cosmetics?: UserIdentityCosmetics | null;
  position: Position;
  dutyLocation: DutyLocation;
  unitAssignment: UnitAssignment | null;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  createdAt: string;
  licenseCategories: PersonnelLicenseCategory[];
  testStats: PersonnelTestRosterStats;
  testStatsOnDate?: PersonnelTestRosterStats | null;
};

export type PersonnelProfilePayload = PersonnelUserCard;

const ROSTER_USER_SELECT =
  `id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at,status,avatar_url,${IDENTITY_COSMETIC_USER_COLUMNS}`;
const ROSTER_USER_SELECT_FALLBACK =
  `id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at,status,avatar_url,profile_name_color,${ACHIEVEMENT_COSMETIC_USER_COLUMNS}`;

function mapPersonnelUserCardRow(
  u: Record<string, unknown>,
  extras: Omit<
    PersonnelUserCard,
    keyof Pick<
      PersonnelUserCard,
      | "id"
      | "name"
      | "callsign"
      | "avatarUrl"
      | "nameColor"
      | "cosmetics"
      | "position"
      | "dutyLocation"
      | "unitAssignment"
      | "rotaPlatoon"
      | "rotaSection"
      | "createdAt"
    >
  >,
  topRankBadge: import("@/lib/achievements-catalog").TopRankBadgeId | null = null,
  cosmeticsOverride?: UserIdentityCosmetics | null,
): PersonnelUserCard {
  const cosmetics = mergeIdentityCosmetics(
    mapIdentityCosmeticsFromRow(u, topRankBadge),
    cosmeticsOverride ?? {},
  );
  return {
    id: String(u.id),
    name: String(u.name ?? ""),
    callsign: String(u.callsign ?? ""),
    avatarUrl: normalizeAvatarStoragePath(typeof u.avatar_url === "string" ? u.avatar_url : null),
    nameColor: cosmetics.adminNameColor ?? null,
    cosmetics,
    position: String(u.position ?? "Специалист") as Position,
    dutyLocation: (u.duty_location === "deployment" ? "deployment" : "base") as DutyLocation,
    unitAssignment: normalizeUnitAssignment(u.unit_assignment),
    rotaPlatoon: u.rota_platoon != null ? Number(u.rota_platoon) : null,
    rotaSection: u.rota_section != null ? Number(u.rota_section) : null,
    createdAt: String(u.created_at ?? new Date().toISOString()),
    ...extras,
  };
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("column") && m.includes("could not find") && m.includes("schema cache"))
  );
}

function isMissingTableError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("relation") && m.includes("does not exist");
}

export async function loadPersonnelModuleSettings(): Promise<PersonnelModuleSettings> {
  const defaults: PersonnelModuleSettings = { moduleEnabled: false, moderationEnabled: true };
  try {
    const supabase = getServerSupabaseServiceClient();
    const res = await supabase.from("site_settings").select("key,value").in("key", [
      "personnel_module_enabled",
      "personnel_moderation_enabled",
    ]);
    if (res.error) {
      if (isMissingTableError(res.error.message)) return defaults;
      return defaults;
    }
    const map = new Map((res.data ?? []).map((r) => [String(r.key), r.value]));
    return {
      moduleEnabled: map.get("personnel_module_enabled") === true,
      moderationEnabled: map.get("personnel_moderation_enabled") !== false,
    };
  } catch {
    return defaults;
  }
}

export async function savePersonnelModuleSettings(input: Partial<PersonnelModuleSettings>) {
  const supabase = getServerSupabaseServiceClient();
  if (input.moduleEnabled !== undefined) {
    await supabase.from("site_settings").upsert({
      key: "personnel_module_enabled",
      value: input.moduleEnabled,
      updated_at: new Date().toISOString(),
    });
  }
  if (input.moderationEnabled !== undefined) {
    await supabase.from("site_settings").upsert({
      key: "personnel_moderation_enabled",
      value: input.moderationEnabled,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function loadPersonnelUserBasics(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const userRes = await supabase
    .from("app_users")
    .select("id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (userRes.error || !userRes.data) return null;
  const u = userRes.data as Record<string, unknown>;
  return {
    id: String(u.id),
    name: String(u.name ?? ""),
    callsign: String(u.callsign ?? ""),
    position: String(u.position ?? "Специалист") as Position,
    dutyLocation: (u.duty_location === "deployment" ? "deployment" : "base") as DutyLocation,
    unitAssignment: normalizeUnitAssignment(u.unit_assignment),
    rotaPlatoon: u.rota_platoon != null ? Number(u.rota_platoon) : null,
    rotaSection: u.rota_section != null ? Number(u.rota_section) : null,
    createdAt: String(u.created_at ?? new Date().toISOString()),
  };
}

async function loadLicenses(userIds: string[]) {
  const map = new Map<string, PersonnelLicenseCategory[]>();
  if (userIds.length === 0) return map;
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_licenses").select("user_id,categories").in("user_id", userIds);
  if (res.error) return map;
  for (const row of res.data ?? []) {
    const r = row as { user_id: string; categories?: string[] };
    map.set(String(r.user_id), normalizePersonnelLicenseCategories(r.categories));
  }
  return map;
}

function emptyTestRosterStats(): PersonnelTestRosterStats {
  return { trialPassed: 0, trialFailed: 0, finalPassed: 0, finalFailed: 0 };
}

function summarizeTestResultRows(
  rows: Array<{ type?: string; test_type?: string; status?: string }>,
): PersonnelTestRosterStats {
  const stats = emptyTestRosterStats();
  for (const test of rows) {
    const type = test.type ?? test.test_type ?? "trial";
    if (type === "final") {
      if (test.status === "passed") stats.finalPassed += 1;
      else stats.finalFailed += 1;
    } else if (test.status === "passed") stats.trialPassed += 1;
    else stats.trialFailed += 1;
  }
  return stats;
}

function mskDayBounds(dateIso: string) {
  const start = new Date(`${dateIso}T00:00:00+03:00`);
  const end = new Date(`${dateIso}T23:59:59.999+03:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isValidDateIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function loadTestStatsForUsersOnDate(userIds: string[], dateIso: string) {
  const map = new Map<string, PersonnelTestRosterStats>();
  for (const id of userIds) map.set(id, emptyTestRosterStats());
  if (userIds.length === 0 || !isValidDateIso(dateIso)) return map;

  const supabase = getServerSupabaseServiceClient();
  const linkedMap = await resolveBulkLinkedUserIds(supabase, userIds);
  const queryIds = [...new Set(linkedMap.keys())];
  if (!queryIds.length) return map;

  const { start, end } = mskDayBounds(dateIso);

  const fetchChunk = async (ids: string[]) => {
    const primary = await supabase
      .from("test_results")
      .select("user_id,type,status,created_at")
      .in("user_id", ids)
      .gte("created_at", start)
      .lte("created_at", end);

    if (!primary.error) {
      return (primary.data ?? []) as Array<Record<string, unknown>>;
    }
    return [] as Array<Record<string, unknown>>;
  };

  const testRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < queryIds.length; i += 80) {
    testRows.push(...(await fetchChunk(queryIds.slice(i, i + 80))));
  }

  const rowsByUser = new Map<string, Array<{ type?: string; status?: string }>>();
  for (const row of testRows) {
    const rawUid = String(row.user_id ?? "");
    if (!rawUid) continue;
    const canon = linkedMap.get(rawUid) ?? rawUid;
    if (!map.has(canon)) continue;
    const list = rowsByUser.get(canon) ?? [];
    list.push(row as { type?: string; status?: string });
    rowsByUser.set(canon, list);
  }

  for (const [id, rows] of rowsByUser) {
    map.set(id, summarizeTestResultRows(rows));
  }

  return map;
}

async function loadTestStatsForUsers(userIds: string[]) {
  const map = new Map<string, PersonnelTestRosterStats>();
  for (const id of userIds) map.set(id, emptyTestRosterStats());
  if (userIds.length === 0) return map;

  const supabase = getServerSupabaseServiceClient();
  const linkedMap = await resolveBulkLinkedUserIds(supabase, userIds);
  const queryIds = [...new Set(linkedMap.keys())];

  let testRows = [] as Array<Record<string, unknown>>;

  const fetchChunk = async (ids: string[]) => {
    const primary = await supabase
      .from("test_results")
      .select("user_id,type,status")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(ids.length * 120, 8000));

    if (!primary.error) {
      return (primary.data ?? []) as Array<Record<string, unknown>>;
    }
    return [] as Array<Record<string, unknown>>;
  };

  for (let i = 0; i < queryIds.length; i += 80) {
    const chunk = queryIds.slice(i, i + 80);
    testRows.push(...(await fetchChunk(chunk)));
  }

  const rowsByUser = new Map<string, Array<{ type?: string; test_type?: string; status?: string }>>();
  for (const row of testRows) {
    const rawUid = String(row.user_id ?? "");
    if (!rawUid) continue;
    const canon = linkedMap.get(rawUid) ?? rawUid;
    if (!map.has(canon)) continue;
    const list = rowsByUser.get(canon) ?? [];
    if (list.length >= 120) continue;
    list.push(row as { type?: string; test_type?: string; status?: string });
    rowsByUser.set(canon, list);
  }

  for (const [id, rows] of rowsByUser) {
    map.set(id, summarizeTestResultRows(rows));
  }

  return map;
}

async function loadProfileTestRows(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const { linkedUserIds } = await resolveFinalUserContext(supabase, userId);
  const testPrimaryRes = await supabase
    .from("test_results")
    .select("type,status,created_at")
    .in("user_id", linkedUserIds);
  if (testPrimaryRes.error) return [] as Array<Record<string, unknown>>;
  return (testPrimaryRes.data ?? []) as Array<Record<string, unknown>>;
}

async function assemblePersonnelCard(
  basic: NonNullable<Awaited<ReturnType<typeof loadPersonnelUserBasics>>>,
  licenseCategories: PersonnelLicenseCategory[],
  testRows: Array<{ type?: string; test_type?: string; status?: string }>,
): Promise<PersonnelProfilePayload> {
  return {
    ...basic,
    licenseCategories,
    testStats: summarizeTestResultRows(testRows),
  };
}

export async function loadPersonnelProfilesBulk(
  userIds: string[],
  options?: { linkedUserMap?: Map<string, string> },
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, PersonnelProfilePayload>();
  if (uniqueIds.length === 0) return result;

  const supabase = getServerSupabaseServiceClient();
  const testQueryIds = options?.linkedUserMap ? [...new Set(options.linkedUserMap.keys())] : uniqueIds;

  const [usersRes, licenseRes, testPrimaryRes] = await Promise.all([
    supabase
      .from("app_users")
      .select("id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at")
      .in("id", uniqueIds),
    supabase.from("personnel_licenses").select("user_id,categories").in("user_id", uniqueIds),
    supabase
      .from("test_results")
      .select("user_id,type,status,created_at")
      .in("user_id", testQueryIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(uniqueIds.length * 120, 8000)),
  ]);

  if (usersRes.error || !usersRes.data?.length) return result;

  const licenseMap = new Map<string, PersonnelLicenseCategory[]>();
  for (const row of (licenseRes.data ?? []) as Array<{ user_id: string; categories?: string[] }>) {
    licenseMap.set(String(row.user_id), normalizePersonnelLicenseCategories(row.categories));
  }

  const testsByUser = new Map<string, Array<{ type?: string; status?: string; created_at?: string }>>();
  for (const row of (testPrimaryRes.data ?? []) as Array<Record<string, unknown>>) {
    const rawUid = String(row.user_id ?? "");
    if (!rawUid) continue;
    const uid = options?.linkedUserMap?.get(rawUid) ?? rawUid;
    if (!uniqueIds.includes(uid)) continue;
    const list = testsByUser.get(uid) ?? [];
    if (list.length >= 120) continue;
    list.push(row as { type?: string; status?: string; created_at?: string });
    testsByUser.set(uid, list);
  }

  for (const u of usersRes.data as Array<Record<string, unknown>>) {
    const id = String(u.id);
    const basic = {
      id,
      name: String(u.name ?? ""),
      callsign: String(u.callsign ?? ""),
      position: String(u.position ?? "Специалист") as Position,
      dutyLocation: (u.duty_location === "deployment" ? "deployment" : "base") as DutyLocation,
      unitAssignment: normalizeUnitAssignment(u.unit_assignment),
      rotaPlatoon: u.rota_platoon != null ? Number(u.rota_platoon) : null,
      rotaSection: u.rota_section != null ? Number(u.rota_section) : null,
      createdAt: String(u.created_at ?? new Date().toISOString()),
    };

    result.set(
      id,
      await assemblePersonnelCard(basic, licenseMap.get(id) ?? [], testsByUser.get(id) ?? []),
    );
  }

  return result;
}

export async function loadPersonnelRoster(filters?: {
  platoon?: number | "all";
  section?: number | "all";
  search?: string;
  testDate?: string;
  page?: number;
  pageSize?: number;
  rosterFilters?: RosterFilterParams;
  mode?: "list" | "export";
}) {
  const supabase = getServerSupabaseServiceClient();
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters?.pageSize ?? 10));
  const exportMode = filters?.mode === "export";
  const effectivePageSize = exportMode ? 500 : pageSize;
  const rosterFilters = filters?.rosterFilters ?? EMPTY_ROSTER_FILTER_PARAMS;
  const testDate =
    typeof filters?.testDate === "string" && isValidDateIso(filters.testDate.trim())
      ? filters.testDate.trim()
      : "";
  const advanced = hasAdvancedRosterFilters(rosterFilters, testDate);

  const buildRosterQuery = (select: string, withRange = false) => {
    let q = supabase
      .from("app_users")
      .select(select, withRange ? { count: "exact" } : undefined)
      .eq("unit_assignment", "company_4")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (filters?.platoon && filters.platoon !== "all") {
      q = q.eq("rota_platoon", filters.platoon);
    }
    if (filters?.section && filters.section !== "all") {
      q = q.eq("rota_section", filters.section);
    }
    if (rosterFilters.dutyStatus === "base") {
      q = q.eq("duty_location", "base");
    } else if (rosterFilters.dutyStatus === "deployment") {
      q = q.eq("duty_location", "deployment");
    }
    const search = (filters?.search ?? "").trim();
    if (search) {
      const escaped = search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
      q = q.or(`name.ilike.%${escaped}%,callsign.ilike.%${escaped}%`);
    }
    return q;
  };

  const enrichRows = async (rows: Array<Record<string, unknown>>) => {
    const userIds = rows.map((r) => String(r.id));
    const cosmeticsMap = userIds.length ? await loadIdentityCosmeticsMap(userIds) : new Map<string, UserIdentityCosmetics>();
    const [licensesMap, testStatsMap, testStatsOnDateMap] = await Promise.all([
      loadLicenses(userIds),
      loadTestStatsForUsers(userIds),
      testDate ? loadTestStatsForUsersOnDate(userIds, testDate) : Promise.resolve(new Map<string, PersonnelTestRosterStats>()),
    ]);

    const users: PersonnelUserCard[] = rows.map((u) => {
      const id = String(u.id);
      return mapPersonnelUserCardRow(
        u,
        {
          licenseCategories: licensesMap.get(id) ?? [],
          testStats: testStatsMap.get(id) ?? emptyTestRosterStats(),
          testStatsOnDate: testDate ? testStatsOnDateMap.get(id) ?? emptyTestRosterStats() : null,
        },
        null,
        cosmeticsMap.get(id) ?? null,
      );
    });

    const topRankMap = buildTopRankBadgeMapFromUsers(users);
    for (const user of users) {
      const badge = topRankMap.get(user.id) ?? null;
      if (badge) {
        user.cosmetics = { ...(user.cosmetics ?? {}), topRankBadge: badge };
      }
    }
    return users;
  };

  const buildStatsForUsers = (users: PersonnelUserCard[]) =>
    calcRosterStats(users.map((user) => ({ dutyLocation: user.dutyLocation })));

  if (advanced) {
    let usersRes = await buildRosterQuery(ROSTER_USER_SELECT).limit(500);
    if (usersRes.error && isMissingColumnError(usersRes.error.message)) {
      usersRes = await buildRosterQuery(ROSTER_USER_SELECT_FALLBACK).limit(500);
    }
    if (usersRes.error) {
      if (isMissingColumnError(usersRes.error.message)) {
        return { ok: false as const, error: "missing_columns", users: [] as PersonnelUserCard[], total: 0 };
      }
      return { ok: false as const, error: usersRes.error.message, users: [] as PersonnelUserCard[], total: 0 };
    }

    const allUsers = await enrichRows((usersRes.data ?? []) as unknown as Array<Record<string, unknown>>);
    const filtered = allUsers.filter((user) => userMatchesRosterFilters(user, rosterFilters, testDate));
    const total = filtered.length;
    const pageUsers = exportMode ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
    return {
      ok: true as const,
      users: pageUsers,
      total,
      stats: buildStatsForUsers(filtered),
      tops: buildPersonnelRosterTops(filtered),
    };
  }

  let countRes = await buildRosterQuery("id", true).limit(0);
  if (countRes.error && isMissingColumnError(countRes.error.message)) {
    countRes = await buildRosterQuery("id", true).limit(0);
  }
  if (countRes.error) {
    if (isMissingColumnError(countRes.error.message)) {
      return { ok: false as const, error: "missing_columns", users: [] as PersonnelUserCard[], total: 0 };
    }
    return { ok: false as const, error: countRes.error.message, users: [] as PersonnelUserCard[], total: 0 };
  }

  const total = countRes.count ?? 0;
  if (total === 0) {
    return {
      ok: true as const,
      users: [] as PersonnelUserCard[],
      total: 0,
      stats: calcRosterStats([]),
      tops: undefined,
    };
  }
  const from = exportMode ? 0 : (page - 1) * pageSize;
  const to = exportMode ? Math.min(total, effectivePageSize) - 1 : from + pageSize - 1;

  let pageRes = await buildRosterQuery(ROSTER_USER_SELECT, true).range(from, to);
  if (pageRes.error && isMissingColumnError(pageRes.error.message)) {
    pageRes = await buildRosterQuery(ROSTER_USER_SELECT_FALLBACK, true).range(from, to);
  }
  if (pageRes.error) {
    return { ok: false as const, error: pageRes.error.message, users: [] as PersonnelUserCard[], total: 0 };
  }

  const pageUsers = await enrichRows((pageRes.data ?? []) as unknown as Array<Record<string, unknown>>);

  let stats = buildStatsForUsers(pageUsers);
  if (total > 0) {
    const statsRes = await buildRosterQuery("id,duty_location").limit(500);
    const statsRows = (statsRes.data ?? []) as unknown as Array<{ id: string; duty_location?: string | null }>;
    if (statsRows.length) {
      stats = calcRosterStats(
        statsRows.map((row) => ({
          dutyLocation:
            typeof row.duty_location === "string" && row.duty_location.trim().toLowerCase() === "deployment"
              ? "deployment"
              : "base",
        })),
      );
    }
  }

  let tops: ReturnType<typeof buildPersonnelRosterTops> | undefined;
  if (!exportMode && page === 1) {
    let topsRes = await buildRosterQuery(ROSTER_USER_SELECT).limit(500);
    if (topsRes.error && isMissingColumnError(topsRes.error.message)) {
      topsRes = await buildRosterQuery(ROSTER_USER_SELECT_FALLBACK).limit(500);
    }
    if (!topsRes.error) {
      const topsUsers = await enrichRows((topsRes.data ?? []) as unknown as Array<Record<string, unknown>>);
      tops = buildPersonnelRosterTops(topsUsers);
    }
  }

  return {
    ok: true as const,
    users: pageUsers,
    total,
    stats,
    tops,
  };
}

export async function loadPersonnelRosterCardsByIds(userIds: string[], testDate?: string | null) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [] as PersonnelUserCard[];

  const supabase = getServerSupabaseServiceClient();
  const primaryRes = await supabase
    .from("app_users")
    .select(ROSTER_USER_SELECT)
    .in("id", uniqueIds)
    .eq("unit_assignment", "company_4")
    .eq("status", "active");
  const usersRes =
    primaryRes.error && isMissingColumnError(primaryRes.error.message)
      ? await supabase
          .from("app_users")
          .select(ROSTER_USER_SELECT_FALLBACK)
          .in("id", uniqueIds)
          .eq("unit_assignment", "company_4")
          .eq("status", "active")
      : primaryRes;

  if (usersRes.error) return [] as PersonnelUserCard[];

  const rows = (usersRes.data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => String(r.id));
  const dateIso =
    typeof testDate === "string" && isValidDateIso(testDate.trim()) ? testDate.trim() : null;

  const [testStatsMap, testStatsOnDateMap, licensesMap] = await Promise.all([
    loadTestStatsForUsers(ids),
    dateIso ? loadTestStatsForUsersOnDate(ids, dateIso) : Promise.resolve(new Map<string, PersonnelTestRosterStats>()),
    loadLicenses(ids),
  ]);

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  const users: PersonnelUserCard[] = rows.map((u) => {
    const id = String(u.id);
    return mapPersonnelUserCardRow(
      u,
      {
        licenseCategories: licensesMap.get(id) ?? [],
        testStats: testStatsMap.get(id) ?? emptyTestRosterStats(),
        testStatsOnDate: dateIso ? testStatsOnDateMap.get(id) ?? emptyTestRosterStats() : null,
      },
      null,
    );
  });

  users.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return users;
}

export async function loadPersonnelProfile(userId: string): Promise<PersonnelProfilePayload | null> {
  const basic = await loadPersonnelUserBasics(userId);
  if (!basic) return null;

  const supabase = getServerSupabaseServiceClient();
  const [licenseRes, testRows] = await Promise.all([
    supabase.from("personnel_licenses").select("categories").eq("user_id", userId).maybeSingle(),
    loadProfileTestRows(userId),
  ]);

  const licenseCategories = normalizePersonnelLicenseCategories(
    (licenseRes.data as { categories?: string[] } | null)?.categories,
  );

  return assemblePersonnelCard(basic, licenseCategories, testRows);
}

export async function createPersonnelRequest(_input: {
  userId: string;
  requestType: "medal" | "premium" | "deployment" | "exam";
  payload: Record<string, unknown>;
}) {
  return { error: { message: "feature_removed" }, data: null };
}

export async function notifyModerators(title: string, body: string, href: string) {
  const supabase = getServerSupabaseServiceClient();
  const mods = await supabase
    .from("app_users")
    .select("id")
    .or("can_moderate_personnel.eq.true,role.eq.admin")
    .eq("status", "active")
    .limit(200);
  if (mods.error || !mods.data?.length) return;
  const rows = mods.data.map((m) => ({
    user_id: String((m as { id: string }).id),
    kind: "personnel_request",
    title,
    body,
    href,
  }));
  await supabase.from("app_notifications").insert(rows);
}

export async function notifyUser(userId: string, title: string, body: string, href?: string) {
  await insertNotificationRow({
    user_id: userId,
    kind: "personnel",
    title,
    body,
    href: href ?? null,
  });
}

export type NotificationSender = {
  id?: string | null;
  label: string;
};

function isMissingNotificationColumn(message: string | undefined, column: string) {
  const lower = (message || "").toLowerCase();
  return (
    (lower.includes("column") && lower.includes(column.toLowerCase()) && lower.includes("does not exist")) ||
    (lower.includes("could not find") && lower.includes(column.toLowerCase()) && lower.includes("column"))
  );
}

export function formatNotificationSenderLabel(input: {
  name?: string | null;
  callsign?: string | null;
  role?: string | null;
}) {
  const label = [input.name, input.callsign]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (label) return label;
  if (input.role === "admin") return "Администратор";
  return null;
}

function resolveNotificationSenderLabel(kind: string, senderLabel: string | null | undefined) {
  const trimmed = typeof senderLabel === "string" ? senderLabel.trim() : "";
  if (trimmed) return trimmed;
  if (kind === "admin_message" || kind === "admin_broadcast") return "Администратор";
  return null;
}

function stripNotificationSenderFields(row: Record<string, unknown>) {
  const next = { ...row };
  delete next.sender_id;
  delete next.sender_label;
  return next;
}

async function insertNotificationRow(row: Record<string, unknown>) {
  const supabase = getServerSupabaseServiceClient();
  let ins = await supabase.from("app_notifications").insert(row);
  if (
    ins.error &&
    (isMissingNotificationColumn(ins.error.message, "sender_id") ||
      isMissingNotificationColumn(ins.error.message, "sender_label"))
  ) {
    ins = await supabase.from("app_notifications").insert(stripNotificationSenderFields(row));
  }
  return ins;
}

async function insertNotificationRows(rows: Array<Record<string, unknown>>) {
  const supabase = getServerSupabaseServiceClient();
  let ins = await supabase.from("app_notifications").insert(rows);
  if (
    ins.error &&
    (isMissingNotificationColumn(ins.error.message, "sender_id") ||
      isMissingNotificationColumn(ins.error.message, "sender_label"))
  ) {
    ins = await supabase.from("app_notifications").insert(rows.map(stripNotificationSenderFields));
  }
  return ins;
}

export async function sendAdminMessage(
  userId: string,
  title: string,
  body: string,
  href?: string | null,
  sender?: NotificationSender | null,
) {
  const normalizedTitle = title.trim();
  const normalizedBody = formatNotificationBody(body.trim());
  if (!normalizedTitle) return { ok: false as const, error: "title_required" };
  if (!userId.trim()) return { ok: false as const, error: "user_required" };

  const ins = await insertNotificationRow({
    user_id: userId,
    kind: "admin_message",
    title: normalizedTitle,
    body: normalizedBody,
    href: href?.trim() || null,
    sender_id: sender?.id ?? null,
    sender_label: sender?.label ?? null,
  });
  if (ins.error) return { ok: false as const, error: ins.error.message };
  return { ok: true as const };
}

function isMissingBroadcastRpcError(message: string | undefined) {
  const lower = (message || "").toLowerCase();
  return (
    lower.includes("broadcast_app_notification") &&
    (lower.includes("does not exist") || lower.includes("could not find"))
  );
}

async function sendAdminBroadcastLegacy(
  normalizedTitle: string,
  normalizedBody: string,
  href: string | null,
  sender?: NotificationSender | null,
  unitFilter: UnitAssignmentFilter = "all",
) {
  const supabase = getServerSupabaseServiceClient();

  const primary = await supabase.from("app_users").select("id,unit_assignment").eq("status", "active").limit(5000);
  let userRows: Array<{ id: string; unit_assignment?: unknown }> = [];

  if (primary.error && isMissingColumnError(primary.error.message)) {
    if (unitFilter !== "all") {
      return { ok: false as const, error: "Колонка unit_assignment отсутствует. Фильтр по подразделению недоступен." };
    }
    const fallback = await supabase.from("app_users").select("id").eq("status", "active").limit(5000);
    if (fallback.error) return { ok: false as const, error: fallback.error.message };
    userRows = (fallback.data ?? []).map((row) => ({ id: String((row as { id?: string }).id ?? "") }));
  } else if (primary.error) {
    return { ok: false as const, error: primary.error.message };
  } else {
    userRows = (primary.data ?? []) as Array<{ id: string; unit_assignment?: unknown }>;
  }

  const userIds = userRows
    .filter((row) => row.id && matchesUnitFilter(unitFilter, normalizeUnitAssignment(row.unit_assignment)))
    .map((row) => row.id);

  const rows = userIds.map((user_id) => ({
    user_id,
    kind: "admin_broadcast",
    title: normalizedTitle,
    body: normalizedBody,
    href,
    sender_id: sender?.id ?? null,
    sender_label: sender?.label ?? null,
  }));

  if (!rows.length) return { ok: true as const, sent: 0 };

  const batchSize = 500;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize);
    const ins = await insertNotificationRows(chunk);
    if (ins.error) return { ok: false as const, error: ins.error.message };
  }

  return { ok: true as const, sent: rows.length };
}

export async function sendAdminBroadcast(
  title: string,
  body: string,
  href?: string | null,
  sender?: NotificationSender | null,
  unitFilter: UnitAssignmentFilter = "all",
) {
  const normalizedTitle = title.trim();
  const normalizedBody = formatNotificationBody(body.trim());
  if (!normalizedTitle) return { ok: false as const, error: "title_required" };

  const normalizedHref = href?.trim() || null;

  if (unitFilter !== "all") {
    return sendAdminBroadcastLegacy(normalizedTitle, normalizedBody, normalizedHref, sender, unitFilter);
  }

  const supabase = getServerSupabaseServiceClient();
  const rpc = await supabase.rpc("broadcast_app_notification", {
    p_title: normalizedTitle,
    p_body: normalizedBody,
    p_href: normalizedHref,
    p_sender_id: sender?.id ?? null,
    p_sender_label: sender?.label ?? null,
  });

  if (!rpc.error && typeof rpc.data === "number") {
    return { ok: true as const, sent: rpc.data };
  }

  if (
    rpc.error &&
    !isMissingBroadcastRpcError(rpc.error.message) &&
    !isMissingNotificationColumn(rpc.error.message, "sender_id") &&
    !isMissingNotificationColumn(rpc.error.message, "sender_label")
  ) {
    return { ok: false as const, error: rpc.error.message };
  }

  return sendAdminBroadcastLegacy(normalizedTitle, normalizedBody, normalizedHref, sender);
}

export async function loadNotifications(userId: string, limit = 30) {
  const supabase = getServerSupabaseServiceClient();
  const primary = await supabase
    .from("app_notifications")
    .select("id,title,body,href,is_read,created_at,kind,sender_label")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  let rows: Array<Record<string, unknown>> = (primary.data ?? []) as Array<Record<string, unknown>>;
  if (primary.error && isMissingNotificationColumn(primary.error.message, "sender_label")) {
    const fallback = await supabase
      .from("app_notifications")
      .select("id,title,body,href,is_read,created_at,kind")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (fallback.error) return [];
    rows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  } else if (primary.error) {
    return [];
  }

  return rows.map((r) => {
    const kind = String(r.kind ?? "info");
    return {
      id: String(r.id),
      title: String(r.title),
      body: formatNotificationBody(String(r.body ?? "")),
      href: (r.href as string | null | undefined) ?? null,
      isRead: r.is_read === true,
      createdAt: String(r.created_at),
      kind,
      senderLabel: resolveNotificationSenderLabel(kind, r.sender_label as string | null | undefined),
    };
  });
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const supabase = getServerSupabaseServiceClient();
  let q = supabase.from("app_notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (ids?.length) {
    q = q.in("id", ids);
  }
  await q;
}

export async function countUnreadNotifications(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return res.count ?? 0;
}

export async function loadPendingRequests(_limit = 100) {
  return [] as Array<{
    id: string;
    request_type: string;
    payload: Record<string, unknown>;
    created_at: string;
    app_users?: { name: string; callsign: string };
  }>;
}

export async function reviewPersonnelRequest(_input: {
  requestId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  return { ok: false as const, error: "feature_removed" };
}

export type PersonnelManageEntity = "licenses";

async function assertTargetCompany4(userId: string) {
  const basic = await loadPersonnelUserBasics(userId);
  if (!basic || basic.unitAssignment !== "company_4") {
    return { ok: false as const, error: "not_found" };
  }
  return { ok: true as const };
}

export async function deletePersonnelRecord(input: { userId: string; entity: PersonnelManageEntity }) {
  const target = await assertTargetCompany4(input.userId);
  if (!target.ok) return target;

  const supabase = getServerSupabaseServiceClient();
  if (input.entity === "licenses") {
    await supabase.from("personnel_licenses").delete().eq("user_id", input.userId);
    return { ok: true as const };
  }

  return { ok: false as const, error: "invalid_entity" };
}

export async function updatePersonnelRecord(input: {
  userId: string;
  entity: PersonnelManageEntity;
  data: Record<string, unknown>;
}) {
  const target = await assertTargetCompany4(input.userId);
  if (!target.ok) return target;

  const supabase = getServerSupabaseServiceClient();
  const d = input.data;

  if (input.entity === "licenses") {
    const categories = normalizePersonnelLicenseCategories(d.categories);
    const res = await supabase.from("personnel_licenses").upsert(
      {
        user_id: input.userId,
        categories,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  return { ok: false as const, error: "invalid_entity" };
}

export async function createPersonnelRecord(_input: {
  userId: string;
  entity: PersonnelManageEntity;
  data: Record<string, unknown>;
}) {
  return { ok: false as const, error: "create_not_supported" };
}

export async function loadActiveCompany4UserIds(filters?: {
  platoon?: number | "all";
  section?: number | "all";
  search?: string;
}) {
  const roster = await loadPersonnelRoster(filters);
  if (!roster.ok) return { ok: false as const, error: roster.error, userIds: [] as string[] };
  return { ok: true as const, userIds: roster.users.map((u) => u.id) };
}

export async function resolvePersonnelExportUserIds(requestedIds: string[]) {
  const ordered = [...new Set(requestedIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ordered.length === 0) {
    return { ok: false as const, error: "no_users", userIds: [] as string[] };
  }

  const supabase = getServerSupabaseServiceClient();
  const res = await supabase
    .from("app_users")
    .select("id")
    .in("id", ordered)
    .eq("unit_assignment", "company_4")
    .eq("status", "active");

  if (res.error) {
    return { ok: false as const, error: res.error.message, userIds: [] as string[] };
  }

  const allowed = new Set((res.data ?? []).map((row) => String(row.id)));
  const userIds = ordered.filter((id) => allowed.has(id));
  if (userIds.length === 0) {
    return { ok: false as const, error: "no_users", userIds: [] as string[] };
  }

  return { ok: true as const, userIds };
}
