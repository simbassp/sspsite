import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import type { DutyLocation, Position, UnitAssignment } from "@/lib/types";
import {
  formatNotificationBody,
  PERSONNEL_DEPLOYMENT_PREMIUM_TITLE,
  PERSONNEL_EXAM_TYPES,
  type PersonnelExamType,
  type PersonnelLicenseCategory,
  normalizePersonnelLicenseCategories,
} from "@/lib/personnel-catalog";
import { resolveBulkLinkedUserIds, resolveFinalUserContext } from "@/lib/server-final-user-context";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { employmentDaysSince } from "@/lib/employment-date";

export type PersonnelModuleSettings = {
  moduleEnabled: boolean;
  moderationEnabled: boolean;
};

export type PersonnelExamRow = {
  id: string;
  examType: PersonnelExamType;
  status: "passed" | "failed";
  passedAt: string | null;
  expiresAt: string | null;
};

export type PersonnelDeploymentRow = {
  id: string;
  dateFrom: string;
  dateTo: string;
  uavHits: number;
  premiumAmount: number;
  days: number;
};

export type PersonnelMedalRow = {
  id: string;
  medalType: string;
  title: string;
  awardedAt: string;
};

export type PersonnelPremiumRow = {
  id: string;
  title: string;
  amount: number;
  awardedAt: string;
  source?: "standalone" | "deployment";
  deploymentId?: string;
};

export type PersonnelUserCard = {
  id: string;
  name: string;
  callsign: string;
  position: Position;
  dutyLocation: DutyLocation;
  unitAssignment: UnitAssignment | null;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  createdAt: string;
  employmentDate: string | null;
  exams: PersonnelExamRow[];
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  medalsCount: number;
  licenseCategories: PersonnelLicenseCategory[];
  testStats: PersonnelTestRosterStats;
};

export type PersonnelTestRosterStats = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

export type PersonnelActivitySegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type PersonnelActivityMonth = {
  month: string;
  segments: PersonnelActivitySegment[];
  total: number;
};

export type PersonnelProfilePayload = PersonnelUserCard & {
  deployments: PersonnelDeploymentRow[];
  medals: PersonnelMedalRow[];
  premiums: PersonnelPremiumRow[];
  pendingRequests: number;
  daysInSystem: number | null;
  employmentDate: string | null;
  activityByMonth: PersonnelActivityMonth[];
  activitySummary: PersonnelActivitySegment[];
};

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

function daysBetween(from: string, to: string) {
  const a = new Date(from);
  const b = new Date(to);
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

const ACTIVITY_MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const ACTIVITY_CATEGORY_DEFS = [
  { key: "deployments", label: "Командировки", color: "#3b82f6" },
  { key: "hits", label: "Сбития БПЛА", color: "#c42b2b" },
  { key: "trialPassed", label: "Пробные (сданы)", color: "#3b82f6" },
  { key: "trialFailed", label: "Пробные (не сданы)", color: "#f59e0b" },
  { key: "finalPassed", label: "Итоговые (сданы)", color: "#10b981" },
  { key: "finalFailed", label: "Итоговые (не сданы)", color: "#c42b2b" },
  { key: "exams", label: "Зачёты", color: "#8b5cf6" },
  { key: "medals", label: "Медали", color: "#f59e0b" },
  { key: "premiums", label: "Премии", color: "#d97706" },
] as const;

type ActivityCategoryKey = (typeof ACTIVITY_CATEGORY_DEFS)[number]["key"];

function monthKeyFromDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
}

function last12MonthBuckets() {
  const now = new Date();
  const items: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    items.push({
      key: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`,
      label: ACTIVITY_MONTH_LABELS[d.getMonth()],
    });
  }
  return items;
}

function buildPersonnelActivityStats(input: {
  deployments: PersonnelDeploymentRow[];
  exams: PersonnelExamRow[];
  medals: PersonnelMedalRow[];
  premiums: PersonnelPremiumRow[];
  testResults: Array<{ type: string; status: string; createdAt: string }>;
}) {
  const monthKeys = last12MonthBuckets();
  const categoryKeys = ACTIVITY_CATEGORY_DEFS.map((c) => c.key);
  const buckets = new Map<string, Record<ActivityCategoryKey, number>>();
  for (const { key } of monthKeys) {
    buckets.set(
      key,
      Object.fromEntries(categoryKeys.map((k) => [k, 0])) as Record<ActivityCategoryKey, number>,
    );
  }
  const totals = Object.fromEntries(categoryKeys.map((k) => [k, 0])) as Record<ActivityCategoryKey, number>;

  const add = (bucketKey: string | null, category: ActivityCategoryKey, amount = 1) => {
    totals[category] += amount;
    if (bucketKey && buckets.has(bucketKey)) {
      buckets.get(bucketKey)![category] += amount;
    }
  };

  for (const deployment of input.deployments) {
    const bucketKey = monthKeyFromDate(deployment.dateFrom);
    add(bucketKey, "deployments");
    if (deployment.uavHits > 0) add(bucketKey, "hits", deployment.uavHits);
  }

  for (const test of input.testResults) {
    if (!test.createdAt) continue;
    const bucketKey = monthKeyFromDate(test.createdAt);
    if (test.type === "final") {
      add(bucketKey, test.status === "passed" ? "finalPassed" : "finalFailed");
    } else {
      add(bucketKey, test.status === "passed" ? "trialPassed" : "trialFailed");
    }
  }

  for (const exam of input.exams) {
    if (exam.status !== "passed" || !exam.passedAt) continue;
    add(monthKeyFromDate(exam.passedAt), "exams");
  }

  for (const medal of input.medals) {
    add(monthKeyFromDate(medal.awardedAt), "medals");
  }

  for (const premium of input.premiums) {
    if (premium.amount > 0) add(monthKeyFromDate(premium.awardedAt), "premiums");
  }

  const activityByMonth: PersonnelActivityMonth[] = monthKeys.map(({ key, label }) => {
    const bucket = buckets.get(key)!;
    const segments = ACTIVITY_CATEGORY_DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      value: bucket[def.key],
      color: def.color,
    }));
    return {
      month: label,
      segments,
      total: segments.reduce((sum, seg) => sum + seg.value, 0),
    };
  });

  const activitySummary: PersonnelActivitySegment[] = ACTIVITY_CATEGORY_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    value: totals[def.key],
    color: def.color,
  }));

  return { activityByMonth, activitySummary };
}

function mapExamRow(row: Record<string, unknown>): PersonnelExamRow {
  return {
    id: String(row.id),
    examType: String(row.exam_type) as PersonnelExamType,
    status: row.status === "failed" ? "failed" : "passed",
    passedAt: row.passed_at ? String(row.passed_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

export async function loadPersonnelUserBasics(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const userRes = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at,employment_date",
    )
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
    employmentDate: u.employment_date ? String(u.employment_date).slice(0, 10) : null,
  };
}

async function loadExamsForUsers(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, PersonnelExamRow[]>();
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_exams").select("*").in("user_id", userIds);
  if (res.error) return new Map<string, PersonnelExamRow[]>();
  const map = new Map<string, PersonnelExamRow[]>();
  for (const row of res.data ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    const list = map.get(uid) ?? [];
    list.push(mapExamRow(row as Record<string, unknown>));
    map.set(uid, list);
  }
  return map;
}

async function loadDeploymentStats(userIds: string[]) {
  const empty = { count: 0, days: 0, hits: 0, premiums: 0 };
  if (userIds.length === 0) return new Map<string, typeof empty>();
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_deployments").select("*").in("user_id", userIds);
  const map = new Map<string, typeof empty>();
  if (res.error) return map;
  for (const row of res.data ?? []) {
    const r = row as {
      user_id: string;
      date_from: string;
      date_to: string;
      uav_hits?: number;
      premium_amount?: number;
    };
    const uid = String(r.user_id);
    const cur = map.get(uid) ?? { ...empty };
    cur.count += 1;
    cur.days += daysBetween(r.date_from, r.date_to);
    cur.hits += Number(r.uav_hits ?? 0);
    cur.premiums += Number(r.premium_amount ?? 0);
    map.set(uid, cur);
  }
  return map;
}

async function loadMedalsCount(userIds: string[]) {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_medals").select("user_id").in("user_id", userIds);
  if (res.error) return map;
  for (const row of res.data ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    map.set(uid, (map.get(uid) ?? 0) + 1);
  }
  return map;
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
    if (isMissingColumnError(primary.error.message)) {
      const legacy = await supabase
        .from("test_results")
        .select("user_id,test_type,status")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(Math.min(ids.length * 120, 8000));
      if (!legacy.error) return (legacy.data ?? []) as Array<Record<string, unknown>>;
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

  const zeroIds = userIds.filter((id) => {
    const s = map.get(id)!;
    return s.trialPassed + s.trialFailed + s.finalPassed + s.finalFailed === 0;
  });

  if (zeroIds.length > 0) {
    for (let i = 0; i < zeroIds.length; i += 8) {
      const chunk = zeroIds.slice(i, i + 8);
      await Promise.all(
        chunk.map(async (id) => {
          const ctx = await resolveFinalUserContext(supabase, id);
          const linkedIds = ctx.linkedUserIds.length ? ctx.linkedUserIds : [id];
          const extraRows: Array<Record<string, unknown>> = [];
          for (let j = 0; j < linkedIds.length; j += 80) {
            extraRows.push(...(await fetchChunk(linkedIds.slice(j, j + 80))));
          }
          if (extraRows.length) {
            map.set(id, summarizeTestResultRows(extraRows));
          }
        }),
      );
    }
  }

  return map;
}

async function loadPremiumTotals(userIds: string[]) {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_premiums").select("user_id,amount").in("user_id", userIds);
  if (res.error) return map;
  for (const row of res.data ?? []) {
    const r = row as { user_id: string; amount?: number };
    const uid = String(r.user_id);
    map.set(uid, (map.get(uid) ?? 0) + Number(r.amount ?? 0));
  }
  return map;
}

function groupRowsByUserId<T extends { user_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const uid = String(row.user_id);
    const list = map.get(uid) ?? [];
    list.push(row);
    map.set(uid, list);
  }
  return map;
}

function assemblePersonnelProfile(
  basic: {
    id: string;
    name: string;
    callsign: string;
    position: Position;
    dutyLocation: DutyLocation;
    unitAssignment: UnitAssignment | null;
    rotaPlatoon: number | null;
    rotaSection: number | null;
    createdAt: string;
    employmentDate: string | null;
  },
  input: {
    deploymentRows: Array<{
      id: string;
      date_from: string;
      date_to: string;
      uav_hits?: number;
      premium_amount?: number;
    }>;
    medalRows: Array<{ id: string; medal_type: string; title: string; awarded_at: string }>;
    premiumRows: Array<{ id: string; title?: string; amount?: number; awarded_at: string }>;
    examRows: Array<Record<string, unknown>>;
    licenseCategories: PersonnelLicenseCategory[];
    testRows: Array<{ type?: string; test_type?: string; status?: string; created_at?: string }>;
    pendingRequests?: number;
  },
): PersonnelProfilePayload {
  const deployments: PersonnelDeploymentRow[] = input.deploymentRows.map((row) => ({
    id: String(row.id),
    dateFrom: String(row.date_from),
    dateTo: String(row.date_to),
    uavHits: Number(row.uav_hits ?? 0),
    premiumAmount: Number(row.premium_amount ?? 0),
    days: daysBetween(String(row.date_from), String(row.date_to)),
  }));

  const depStats = deployments.reduce(
    (acc, d) => {
      acc.count += 1;
      acc.days += d.days;
      acc.hits += d.uavHits;
      acc.premiums += d.premiumAmount;
      return acc;
    },
    { count: 0, days: 0, hits: 0, premiums: 0 },
  );

  const medals: PersonnelMedalRow[] = input.medalRows.map((row) => ({
    id: String(row.id),
    medalType: String(row.medal_type),
    title: String(row.title),
    awardedAt: String(row.awarded_at),
  }));

  const standalonePremiums: PersonnelPremiumRow[] = input.premiumRows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "Премия"),
    amount: Number(row.amount ?? 0),
    awardedAt: String(row.awarded_at),
    source: "standalone" as const,
  }));

  const deploymentPremiums: PersonnelPremiumRow[] = deployments
    .filter((d) => d.premiumAmount > 0)
    .map((d) => ({
      id: `deployment:${d.id}`,
      title: PERSONNEL_DEPLOYMENT_PREMIUM_TITLE,
      amount: d.premiumAmount,
      awardedAt: d.dateTo,
      source: "deployment" as const,
      deploymentId: d.id,
    }));

  const premiums = [...standalonePremiums, ...deploymentPremiums].sort(
    (a, b) => +new Date(b.awardedAt) - +new Date(a.awardedAt),
  );

  const standalonePremiumsTotal = standalonePremiums.reduce((sum, p) => sum + p.amount, 0);
  const exams = input.examRows.map((row) => mapExamRow(row));
  const testResults = input.testRows.map((row) => {
    const type = row.type === "final" || row.test_type === "final" ? "final" : "trial";
    return {
      type,
      status: row.status === "passed" ? "passed" : "failed",
      createdAt: String(row.created_at ?? ""),
    };
  });

  const { activityByMonth, activitySummary } = buildPersonnelActivityStats({
    deployments,
    exams,
    medals,
    premiums,
    testResults,
  });

  return {
    ...basic,
    exams,
    deploymentsCount: depStats.count,
    deploymentDays: depStats.days,
    uavHitsTotal: depStats.hits,
    premiumsTotal: depStats.premiums + standalonePremiumsTotal,
    medalsCount: medals.length,
    licenseCategories: input.licenseCategories,
    testStats: summarizeTestResultRows(input.testRows),
    deployments,
    medals,
    premiums,
    pendingRequests: input.pendingRequests ?? 0,
    daysInSystem: employmentDaysSince(basic.employmentDate),
    employmentDate: basic.employmentDate,
    activityByMonth,
    activitySummary,
  };
}

/** Пакетная загрузка профилей для массового Excel (один round-trip на таблицу). */
export async function loadPersonnelProfilesBulk(
  userIds: string[],
  options?: { linkedUserMap?: Map<string, string> },
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, PersonnelProfilePayload>();
  if (uniqueIds.length === 0) return result;

  const supabase = getServerSupabaseServiceClient();
  const testQueryIds = options?.linkedUserMap
    ? [...new Set(options.linkedUserMap.keys())]
    : uniqueIds;

  const [usersRes, depRes, medalRes, premiumRes, examRes, licenseRes, testPrimaryRes] = await Promise.all([
    supabase
      .from("app_users")
      .select(
        "id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at,employment_date",
      )
      .in("id", uniqueIds),
    supabase.from("personnel_deployments").select("*").in("user_id", uniqueIds).order("date_from", { ascending: false }),
    supabase.from("personnel_medals").select("*").in("user_id", uniqueIds).order("awarded_at", { ascending: false }),
    supabase.from("personnel_premiums").select("*").in("user_id", uniqueIds).order("awarded_at", { ascending: false }),
    supabase.from("personnel_exams").select("*").in("user_id", uniqueIds),
    supabase.from("personnel_licenses").select("user_id,categories").in("user_id", uniqueIds),
    supabase
      .from("test_results")
      .select("user_id,type,status,created_at")
      .in("user_id", testQueryIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(uniqueIds.length * 120, 8000)),
  ]);

  if (usersRes.error || !usersRes.data?.length) return result;

  let testRows = (testPrimaryRes.data ?? []) as Array<Record<string, unknown>>;
  if (testPrimaryRes.error && isMissingColumnError(testPrimaryRes.error.message)) {
    const legacy = await supabase
      .from("test_results")
      .select("user_id,test_type,status,created_at")
      .in("user_id", testQueryIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(uniqueIds.length * 120, 8000));
    testRows = (legacy.data ?? []) as Array<Record<string, unknown>>;
  }

  const depByUser = groupRowsByUserId(
    (depRes.data ?? []) as Array<{ user_id: string; id: string; date_from: string; date_to: string; uav_hits?: number; premium_amount?: number }>,
  );
  const medalByUser = groupRowsByUserId(
    (medalRes.data ?? []) as Array<{ user_id: string; id: string; medal_type: string; title: string; awarded_at: string }>,
  );
  const premiumByUser = groupRowsByUserId(
    (premiumRes.data ?? []) as Array<{ user_id: string; id: string; title?: string; amount?: number; awarded_at: string }>,
  );
  const examByUser = groupRowsByUserId((examRes.data ?? []) as Array<{ user_id: string } & Record<string, unknown>>);
  const licenseMap = new Map<string, PersonnelLicenseCategory[]>();
  for (const row of (licenseRes.data ?? []) as Array<{ user_id: string; categories?: string[] }>) {
    licenseMap.set(String(row.user_id), normalizePersonnelLicenseCategories(row.categories));
  }

  const testsByUser = new Map<string, Array<{ type?: string; test_type?: string; status?: string; created_at?: string }>>();
  for (const row of testRows) {
    const rawUid = String(row.user_id ?? "");
    if (!rawUid) continue;
    const uid = options?.linkedUserMap?.get(rawUid) ?? rawUid;
    if (!uniqueIds.includes(uid)) continue;
    const list = testsByUser.get(uid) ?? [];
    if (list.length >= 120) continue;
    list.push(row as { type?: string; test_type?: string; status?: string; created_at?: string });
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
      employmentDate: u.employment_date ? String(u.employment_date).slice(0, 10) : null,
    };

    result.set(
      id,
      assemblePersonnelProfile(basic, {
        deploymentRows: depByUser.get(id) ?? [],
        medalRows: medalByUser.get(id) ?? [],
        premiumRows: premiumByUser.get(id) ?? [],
        examRows: examByUser.get(id) ?? [],
        licenseCategories: licenseMap.get(id) ?? [],
        testRows: testsByUser.get(id) ?? [],
      }),
    );
  }

  return result;
}

export async function loadPersonnelRoster(filters?: {
  platoon?: number | "all";
  section?: number | "all";
  search?: string;
}) {
  const supabase = getServerSupabaseServiceClient();
  let q = supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,duty_location,unit_assignment,rota_platoon,rota_section,created_at,status",
    )
    .eq("unit_assignment", "company_4")
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);

  if (filters?.platoon && filters.platoon !== "all") {
    q = q.eq("rota_platoon", filters.platoon);
  }
  if (filters?.section && filters.section !== "all") {
    q = q.eq("rota_section", filters.section);
  }

  const usersRes = await q;
  if (usersRes.error) {
    if (isMissingColumnError(usersRes.error.message)) {
      return { ok: false as const, error: "missing_columns", users: [] as PersonnelUserCard[] };
    }
    return { ok: false as const, error: usersRes.error.message, users: [] as PersonnelUserCard[] };
  }

  let rows = (usersRes.data ?? []) as Array<Record<string, unknown>>;
  const search = (filters?.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => {
      const name = String(r.name ?? "").toLowerCase();
      const callsign = String(r.callsign ?? "").toLowerCase();
      return name.includes(search) || callsign.includes(search);
    });
  }

  const userIds = rows.map((r) => String(r.id));
  const [examsMap, depMap, medalsMap, licensesMap, premiumMap, testStatsMap] = await Promise.all([
    loadExamsForUsers(userIds),
    loadDeploymentStats(userIds),
    loadMedalsCount(userIds),
    loadLicenses(userIds),
    loadPremiumTotals(userIds),
    loadTestStatsForUsers(userIds),
  ]);

  const users: PersonnelUserCard[] = rows.map((u) => {
    const id = String(u.id);
    const dep = depMap.get(id) ?? { count: 0, days: 0, hits: 0, premiums: 0 };
    const standalonePremiums = premiumMap.get(id) ?? 0;
    return {
      id,
      name: String(u.name ?? ""),
      callsign: String(u.callsign ?? ""),
      position: String(u.position ?? "Специалист") as Position,
      dutyLocation: (u.duty_location === "deployment" ? "deployment" : "base") as DutyLocation,
      unitAssignment: normalizeUnitAssignment(u.unit_assignment),
      rotaPlatoon: u.rota_platoon != null ? Number(u.rota_platoon) : null,
      rotaSection: u.rota_section != null ? Number(u.rota_section) : null,
      createdAt: String(u.created_at ?? new Date().toISOString()),
      employmentDate: u.employment_date ? String(u.employment_date).slice(0, 10) : null,
      exams: examsMap.get(id) ?? [],
      deploymentsCount: dep.count,
      deploymentDays: dep.days,
      uavHitsTotal: dep.hits,
      premiumsTotal: dep.premiums + standalonePremiums,
      medalsCount: medalsMap.get(id) ?? 0,
      licenseCategories: licensesMap.get(id) ?? [],
      testStats: testStatsMap.get(id) ?? emptyTestRosterStats(),
    };
  });

  return { ok: true as const, users };
}

export async function loadPersonnelProfile(userId: string): Promise<PersonnelProfilePayload | null> {
  const basic = await loadPersonnelUserBasics(userId);
  if (!basic) return null;

  const supabase = getServerSupabaseServiceClient();
  const { linkedUserIds } = await resolveFinalUserContext(supabase, userId);

  const [depRes, medalRes, premiumRes, examRes, licenseRes, pendingRes, testPrimaryRes] = await Promise.all([
    supabase.from("personnel_deployments").select("*").eq("user_id", userId).order("date_from", { ascending: false }),
    supabase.from("personnel_medals").select("*").eq("user_id", userId).order("awarded_at", { ascending: false }),
    supabase.from("personnel_premiums").select("*").eq("user_id", userId).order("awarded_at", { ascending: false }),
    supabase.from("personnel_exams").select("*").eq("user_id", userId),
    supabase.from("personnel_licenses").select("categories").eq("user_id", userId).maybeSingle(),
    supabase
      .from("personnel_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
    supabase.from("test_results").select("type,status,created_at").in("user_id", linkedUserIds),
  ]);

  let testRows = (testPrimaryRes.data ?? []) as Array<Record<string, unknown>>;
  if (testPrimaryRes.error && isMissingColumnError(testPrimaryRes.error.message)) {
    const testLegacyRes = await supabase
      .from("test_results")
      .select("test_type,status,created_at")
      .in("user_id", linkedUserIds);
    testRows = (testLegacyRes.data ?? []) as Array<Record<string, unknown>>;
  }

  const deployments: PersonnelDeploymentRow[] = (depRes.data ?? []).map((row) => {
    const r = row as {
      id: string;
      date_from: string;
      date_to: string;
      uav_hits?: number;
      premium_amount?: number;
    };
    return {
      id: String(r.id),
      dateFrom: String(r.date_from),
      dateTo: String(r.date_to),
      uavHits: Number(r.uav_hits ?? 0),
      premiumAmount: Number(r.premium_amount ?? 0),
      days: daysBetween(String(r.date_from), String(r.date_to)),
    };
  });

  const depStats = deployments.reduce(
    (acc, d) => {
      acc.count += 1;
      acc.days += d.days;
      acc.hits += d.uavHits;
      acc.premiums += d.premiumAmount;
      return acc;
    },
    { count: 0, days: 0, hits: 0, premiums: 0 },
  );

  const medals: PersonnelMedalRow[] = (medalRes.data ?? []).map((row) => {
    const r = row as { id: string; medal_type: string; title: string; awarded_at: string };
    return {
      id: String(r.id),
      medalType: String(r.medal_type),
      title: String(r.title),
      awardedAt: String(r.awarded_at),
    };
  });

  const standalonePremiums: PersonnelPremiumRow[] = (premiumRes.data ?? []).map((row) => {
    const r = row as { id: string; title: string; amount: number; awarded_at: string };
    return {
      id: String(r.id),
      title: String(r.title ?? "Премия"),
      amount: Number(r.amount ?? 0),
      awardedAt: String(r.awarded_at),
      source: "standalone" as const,
    };
  });

  const deploymentPremiums: PersonnelPremiumRow[] = deployments
    .filter((d) => d.premiumAmount > 0)
    .map((d) => ({
      id: `deployment:${d.id}`,
      title: PERSONNEL_DEPLOYMENT_PREMIUM_TITLE,
      amount: d.premiumAmount,
      awardedAt: d.dateTo,
      source: "deployment" as const,
      deploymentId: d.id,
    }));

  const premiums = [...standalonePremiums, ...deploymentPremiums].sort(
    (a, b) => +new Date(b.awardedAt) - +new Date(a.awardedAt),
  );

  const standalonePremiumsTotal = standalonePremiums.reduce((sum, p) => sum + p.amount, 0);

  const exams = (examRes.data ?? []).map((row) => mapExamRow(row as Record<string, unknown>));
  const licenseCategories = normalizePersonnelLicenseCategories(
    (licenseRes.data as { categories?: string[] } | null)?.categories,
  );

  const testResults = testRows.map((row) => {
    const r = row as { type?: string; test_type?: string; status?: string; created_at?: string };
    const type = r.type === "final" || r.test_type === "final" ? "final" : "trial";
    return {
      type,
      status: r.status === "passed" ? "passed" : "failed",
      createdAt: String(r.created_at ?? ""),
    };
  });

  const { activityByMonth, activitySummary } = buildPersonnelActivityStats({
    deployments,
    exams,
    medals,
    premiums,
    testResults,
  });

  return {
    ...basic,
    exams,
    deploymentsCount: depStats.count,
    deploymentDays: depStats.days,
    uavHitsTotal: depStats.hits,
    premiumsTotal: depStats.premiums + standalonePremiumsTotal,
    medalsCount: medals.length,
    licenseCategories,
    testStats: summarizeTestResultRows(testRows),
    deployments,
    medals,
    premiums,
    pendingRequests: pendingRes.count ?? 0,
    daysInSystem: employmentDaysSince(basic.employmentDate),
    employmentDate: basic.employmentDate,
    activityByMonth,
    activitySummary,
  };
}

export async function createPersonnelRequest(input: {
  userId: string;
  requestType: "medal" | "premium" | "deployment" | "exam";
  payload: Record<string, unknown>;
}) {
  const supabase = getServerSupabaseServiceClient();
  const ins = await supabase
    .from("personnel_requests")
    .insert({
      user_id: input.userId,
      request_type: input.requestType,
      payload: input.payload,
      status: "pending",
    })
    .select("id")
    .single();
  return ins;
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
  const supabase = getServerSupabaseServiceClient();
  await supabase.from("app_notifications").insert({
    user_id: userId,
    kind: "personnel",
    title,
    body,
    href: href ?? null,
  });
}

export async function loadNotifications(userId: string, limit = 30) {
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase
    .from("app_notifications")
    .select("id,title,body,href,is_read,created_at,kind")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) return [];
  return (res.data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    title: String((r as { title: string }).title),
    body: formatNotificationBody(String((r as { body?: string }).body ?? "")),
    href: (r as { href?: string | null }).href ?? null,
    isRead: (r as { is_read?: boolean }).is_read === true,
    createdAt: String((r as { created_at: string }).created_at),
    kind: String((r as { kind?: string }).kind ?? "info"),
  }));
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

export async function loadPendingRequests(limit = 100) {
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase
    .from("personnel_requests")
    .select("id,user_id,request_type,payload,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) return [];
  const rows = res.data ?? [];
  const userIds = [...new Set(rows.map((r) => String((r as { user_id: string }).user_id)))];
  const usersRes =
    userIds.length > 0
      ? await supabase.from("app_users").select("id,name,callsign").in("id", userIds)
      : { data: [] as Array<{ id: string; name: string; callsign: string }> };
  const userMap = new Map((usersRes.data ?? []).map((u) => [String(u.id), u]));
  return rows.map((row) => {
    const r = row as { id: string; user_id: string; request_type: string; payload: Record<string, unknown>; created_at: string };
    const user = userMap.get(r.user_id);
    return {
      id: r.id,
      request_type: r.request_type,
      payload: r.payload,
      created_at: r.created_at,
      app_users: user ? { name: user.name, callsign: user.callsign } : undefined,
    };
  });
}

export async function reviewPersonnelRequest(input: {
  requestId: string;
  reviewerId: string;
  approve: boolean;
  note?: string;
}) {
  const supabase = getServerSupabaseServiceClient();
  const reqRes = await supabase.from("personnel_requests").select("*").eq("id", input.requestId).maybeSingle();
  if (reqRes.error || !reqRes.data) return { ok: false as const, error: "not_found" };
  const req = reqRes.data as {
    id: string;
    user_id: string;
    request_type: string;
    payload: Record<string, unknown>;
    status: string;
  };
  if (req.status !== "pending") return { ok: false as const, error: "already_reviewed" };

  const status = input.approve ? "approved" : "rejected";
  await supabase
    .from("personnel_requests")
    .update({
      status,
      reviewer_id: input.reviewerId,
      review_note: input.note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);

  if (input.approve) {
    const p = req.payload ?? {};
    if (req.request_type === "medal") {
      await supabase.from("personnel_medals").insert({
        user_id: req.user_id,
        medal_type: String(p.medalType ?? "custom"),
        title: String(p.title ?? "Медаль"),
        awarded_at: String(p.awardedAt ?? new Date().toISOString().slice(0, 10)),
      });
    } else if (req.request_type === "premium") {
      await supabase.from("personnel_premiums").insert({
        user_id: req.user_id,
        title: String(p.title ?? "Премия за сбитие"),
        amount: Number(p.amount ?? 0),
        awarded_at: String(p.awardedAt ?? new Date().toISOString().slice(0, 10)),
      });
    } else if (req.request_type === "deployment") {
      await supabase.from("personnel_deployments").insert({
        user_id: req.user_id,
        date_from: String(p.dateFrom),
        date_to: String(p.dateTo),
        uav_hits: Number(p.uavHits ?? 0),
        premium_amount: Number(p.premiumAmount ?? 0),
      });
    } else if (req.request_type === "exam") {
      await supabase.from("personnel_exams").upsert(
        {
          user_id: req.user_id,
          exam_type: String(p.examType),
          status: p.status === "failed" ? "failed" : "passed",
          passed_at: p.passedAt ? String(p.passedAt) : null,
          expires_at: p.expiresAt ? String(p.expiresAt) : null,
        },
        { onConflict: "user_id,exam_type" },
      );
    }
  }

  await notifyUser(
    req.user_id,
    input.approve ? "Заявка одобрена" : "Заявка отклонена",
    input.approve ? "Запись добавлена в личное дело." : input.note || "Модератор отклонил заявку.",
    `/personnel/${req.user_id}`,
  );

  return { ok: true as const };
}

export type PersonnelManageEntity = "deployment" | "premium" | "medal" | "exam" | "licenses";

async function assertTargetCompany4(userId: string) {
  const basic = await loadPersonnelUserBasics(userId);
  if (!basic || basic.unitAssignment !== "company_4") {
    return { ok: false as const, error: "not_found" };
  }
  return { ok: true as const };
}

export async function deletePersonnelRecord(input: {
  userId: string;
  entity: PersonnelManageEntity;
  id?: string;
  examType?: string;
}) {
  const target = await assertTargetCompany4(input.userId);
  if (!target.ok) return target;

  const supabase = getServerSupabaseServiceClient();
  if (input.entity === "licenses") {
    await supabase.from("personnel_licenses").delete().eq("user_id", input.userId);
    return { ok: true as const };
  }

  if (input.entity === "exam") {
    if (!input.examType && !input.id) return { ok: false as const, error: "missing_id" };
    let q = supabase.from("personnel_exams").delete().eq("user_id", input.userId);
    q = input.id ? q.eq("id", input.id) : q.eq("exam_type", input.examType!);
    const res = await q;
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  if (!input.id) return { ok: false as const, error: "missing_id" };
  const table =
    input.entity === "deployment"
      ? "personnel_deployments"
      : input.entity === "premium"
        ? "personnel_premiums"
        : "personnel_medals";
  const res = await supabase.from(table).delete().eq("id", input.id).eq("user_id", input.userId);
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const };
}

export async function updatePersonnelRecord(input: {
  userId: string;
  entity: PersonnelManageEntity;
  id?: string;
  examType?: string;
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

  if (input.entity === "exam") {
    const examType = String(input.examType ?? d.examType ?? "");
    if (!PERSONNEL_EXAM_TYPES.includes(examType as PersonnelExamType)) {
      return { ok: false as const, error: "invalid_exam_type" };
    }
    const res = await supabase.from("personnel_exams").upsert(
      {
        user_id: input.userId,
        exam_type: examType,
        status: d.status === "failed" ? "failed" : "passed",
        passed_at: d.passedAt ? String(d.passedAt) : null,
        expires_at: d.expiresAt ? String(d.expiresAt) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,exam_type" },
    );
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  if (!input.id) return { ok: false as const, error: "missing_id" };

  if (input.entity === "deployment") {
    const res = await supabase
      .from("personnel_deployments")
      .update({
        date_from: String(d.dateFrom),
        date_to: String(d.dateTo),
        uav_hits: Number(d.uavHits ?? 0),
        premium_amount: Number(d.premiumAmount ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId);
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  if (input.entity === "premium") {
    const res = await supabase
      .from("personnel_premiums")
      .update({
        title: String(d.title ?? "Премия за сбитие"),
        amount: Number(d.amount ?? 0),
        awarded_at: String(d.awardedAt),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId);
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  if (input.entity === "medal") {
    const res = await supabase
      .from("personnel_medals")
      .update({
        title: String(d.title ?? "Медаль"),
        awarded_at: String(d.awardedAt),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId);
    if (res.error) return { ok: false as const, error: res.error.message };
    return { ok: true as const };
  }

  return { ok: false as const, error: "invalid_entity" };
}

export async function createPersonnelRecord(input: {
  userId: string;
  entity: PersonnelManageEntity;
  data: Record<string, unknown>;
}) {
  const target = await assertTargetCompany4(input.userId);
  if (!target.ok) return target;

  if (input.entity !== "premium") {
    return { ok: false as const, error: "create_not_supported" };
  }

  const supabase = getServerSupabaseServiceClient();
  const d = input.data;
  const amount = Number(d.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false as const, error: "invalid_amount" };
  }

  const awardedAt = String(d.awardedAt ?? new Date().toISOString().slice(0, 10));
  const res = await supabase.from("personnel_premiums").insert({
    user_id: input.userId,
    title: String(d.title ?? "Премия за сбитие"),
    amount,
    awarded_at: awardedAt,
  });
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const };
}

export async function resetPersonnelExamsForUserIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: true as const, affectedUsers: 0 };
  }

  const supabase = getServerSupabaseServiceClient();
  const usersRes = await supabase
    .from("app_users")
    .select("id")
    .eq("unit_assignment", "company_4")
    .eq("status", "active")
    .in("id", uniqueIds);

  if (usersRes.error) {
    return { ok: false as const, error: usersRes.error.message };
  }

  const allowedIds = (usersRes.data ?? []).map((row) => String((row as { id: string }).id));
  if (allowedIds.length === 0) {
    return { ok: false as const, error: "no_targets" };
  }

  const del = await supabase.from("personnel_exams").delete().in("user_id", allowedIds);
  if (del.error) {
    return { ok: false as const, error: del.error.message };
  }

  return { ok: true as const, affectedUsers: allowedIds.length };
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

export async function resetPersonnelExams(input: {
  scope: "single" | "all" | "filter";
  userId?: string;
  platoon?: number | "all";
  section?: number | "all";
  search?: string;
}) {
  if (input.scope === "single") {
    if (!input.userId) return { ok: false as const, error: "missing_user_id" };
    return resetPersonnelExamsForUserIds([input.userId]);
  }

  if (input.scope === "all") {
    const all = await loadActiveCompany4UserIds();
    if (!all.ok) return { ok: false as const, error: all.error };
    return resetPersonnelExamsForUserIds(all.userIds);
  }

  const filtered = await loadActiveCompany4UserIds({
    platoon: input.platoon,
    section: input.section,
    search: input.search,
  });
  if (!filtered.ok) return { ok: false as const, error: filtered.error };
  return resetPersonnelExamsForUserIds(filtered.userIds);
}
