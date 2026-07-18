import { employmentDaysSince } from "@/lib/employment-date";
import { dutyLocationLabel } from "@/lib/duty-location";
import { loadPersonnelProfile } from "@/lib/personnel-server";
import { resolveFinalUserContext } from "@/lib/server-final-user-context";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { formatTotalTestDuration } from "@/lib/format";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import { normalizeUnitAssignment, unitAssignmentLabelOrEmpty } from "@/lib/unit-assignment";
import {
  PERSONNEL_EXAM_TYPES,
  personnelExamLabel,
  rotaUnitLabelCompact,
} from "@/lib/personnel-catalog";
import type { PersonnelProfilePayload } from "@/lib/personnel-server";

export type PersonnelProfileExportTestRow = {
  createdAt: string;
  type: "trial" | "final";
  status: "passed" | "failed";
  score: number;
  questionsTotal: number | null;
  questionsCorrect: number | null;
  durationSeconds: number | null;
  resultText: string;
};

export type PersonnelProfileExportBundle = {
  exportedAt: string;
  user: {
    id: string;
    name: string;
    callsign: string;
    login: string;
    position: string;
    role: string;
    status: string;
    dutyLocation: string;
    unitAssignment: string;
    rotaUnit: string;
    employmentDate: string;
    employmentDays: string;
  };
  profile: PersonnelProfilePayload | null;
  exams: Array<{
    examType: string;
    label: string;
    status: string;
    passedAt: string;
    expiresAt: string;
  }>;
  testResults: PersonnelProfileExportTestRow[];
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function formatRuDate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleDateString("ru-RU");
}

function formatRuDateTime(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapExportTestRows(testRows: Array<Record<string, unknown>>): PersonnelProfileExportTestRow[] {
  return testRows.map((row) => {
    const type = row.type === "final" || row.test_type === "final" ? "final" : "trial";
    const status = row.status === "passed" ? "passed" : "failed";
    const questionsTotal =
      row.questions_total === null || row.questions_total === undefined ? null : Number(row.questions_total);
    const questionsCorrect =
      row.questions_correct === null || row.questions_correct === undefined ? null : Number(row.questions_correct);
    const durationSeconds =
      row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds);

    return {
      createdAt: formatRuDateTime(String(row.created_at ?? "")),
      type,
      status,
      score: Number(row.score ?? 0),
      questionsTotal,
      questionsCorrect,
      durationSeconds,
      resultText: formatTestResultForType({
        type,
        questionsCorrect,
        questionsTotal,
        scorePercent: Number(row.score ?? 0),
      }),
    };
  });
}

async function fetchExportTestRowsForUser(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const { linkedUserIds } = await resolveFinalUserContext(supabase, userId);
  const userIdsForTests = linkedUserIds.length > 0 ? linkedUserIds : [userId];

  let testRows: Array<Record<string, unknown>> = [];
  const testPrimary = await supabase
    .from("test_results")
    .select("id,type,status,score,created_at,duration_seconds,questions_total,questions_correct,test_type")
    .in("user_id", userIdsForTests)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!testPrimary.error) {
    testRows = (testPrimary.data ?? []) as Array<Record<string, unknown>>;
  } else if (isMissingColumnError(testPrimary.error.message)) {
    const legacy = await supabase
      .from("test_results")
      .select("id,test_type,status,score,created_at,questions_total,questions_correct")
      .in("user_id", userIdsForTests)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!legacy.error) {
      testRows = (legacy.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  return mapExportTestRows(testRows);
}

async function loadUserExportProfileData(userId: string) {
  const [profile, testResults] = await Promise.all([
    loadPersonnelProfile(userId).catch(() => null),
    fetchExportTestRowsForUser(userId).catch(() => [] as PersonnelProfileExportTestRow[]),
  ]);
  return { profile, testResults };
}

async function runInPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(chunk.map(worker))));
  }
  return results;
}

function buildExportBundleFromUser(
  u: Record<string, unknown>,
  profile: PersonnelProfilePayload | null,
  testResults: PersonnelProfileExportTestRow[],
  exportedAt: string,
): PersonnelProfileExportBundle {
  const examMap = new Map((profile?.exams ?? []).map((e) => [e.examType, e]));
  const exams = PERSONNEL_EXAM_TYPES.map((type) => {
    const row = examMap.get(type);
    const passed = row?.status === "passed";
    return {
      examType: type,
      label: personnelExamLabel[type],
      status: passed ? "Сдан" : "Не сдан",
      passedAt: formatRuDate(row?.passedAt),
      expiresAt: formatRuDate(row?.expiresAt),
    };
  });

  const employmentDateRaw =
    u.employment_date != null && String(u.employment_date).trim()
      ? String(u.employment_date).slice(0, 10)
      : null;
  const days = employmentDaysSince(employmentDateRaw);
  const duty =
    typeof u.duty_location === "string" && u.duty_location.trim().toLowerCase() === "deployment"
      ? "deployment"
      : "base";

  const rotaPlatoon = u.rota_platoon != null ? Number(u.rota_platoon) : null;
  const rotaSection = u.rota_section != null ? Number(u.rota_section) : null;
  const rotaModule = u.rota_module != null ? Number(u.rota_module) : null;

  return {
    exportedAt,
    user: {
      id: String(u.id),
      name: String(u.name ?? ""),
      callsign: String(u.callsign ?? ""),
      login: String(u.login ?? ""),
      position: String(u.position ?? ""),
      role: u.role === "admin" ? "Администратор" : "Сотрудник",
      status: u.status === "inactive" ? "Неактивен" : "Активен",
      dutyLocation: dutyLocationLabel[duty],
      unitAssignment: unitAssignmentLabelOrEmpty(normalizeUnitAssignment(u.unit_assignment)),
      rotaUnit: rotaUnitLabelCompact(rotaPlatoon, rotaSection, rotaModule),
      employmentDate: employmentDateRaw ? formatRuDate(employmentDateRaw) : "—",
      employmentDays: days != null ? `${days} дн.` : "—",
    },
    profile,
    exams,
    testResults,
  };
}

export async function loadPersonnelProfileExportBundle(userId: string): Promise<PersonnelProfileExportBundle | null> {
  const supabase = getServerSupabaseServiceClient();
  let userRes = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,rota_module,employment_date,created_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (userRes.error && isMissingColumnError(userRes.error.message)) {
    userRes = await supabase
      .from("app_users")
      .select(
        "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,rota_module,created_at",
      )
      .eq("id", userId)
      .maybeSingle();
  }

  if (userRes.error || !userRes.data) return null;
  const { profile, testResults } = await loadUserExportProfileData(userId);
  return buildExportBundleFromUser(
    userRes.data as Record<string, unknown>,
    profile,
    testResults,
    new Date().toLocaleString("ru-RU"),
  );
}

export function buildPersonnelExportFilename(bundle: PersonnelProfileExportBundle) {
  const base = (bundle.user.callsign || bundle.user.name || bundle.user.login || "profile")
    .trim()
    .replace(/[^\w\u0400-\u04FF-]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${base || "profile"}-${date}.xlsx`;
}

/** ASCII-only имя для заголовка filename= (без кириллицы). */
export function buildPersonnelExportAsciiFilename(bundle: PersonnelProfileExportBundle) {
  const base = (bundle.user.login || "profile")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${base || "profile"}-${date}.xlsx`;
}

export function buildPersonnelExportContentDisposition(bundle: PersonnelProfileExportBundle) {
  const filename = buildPersonnelExportFilename(bundle);
  const asciiFilename = buildPersonnelExportAsciiFilename(bundle);
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function formatExportMoney(amount: number) {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

export function formatExportDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return formatTotalTestDuration(seconds);
}

export function buildPersonnelBulkExportFilename(scope: "all" | "filter") {
  const date = new Date().toISOString().slice(0, 10);
  return scope === "all" ? `personnel-4rota-${date}.xlsx` : `personnel-filter-${date}.xlsx`;
}

export function buildPersonnelBulkExportContentDisposition(scope: "all" | "filter") {
  const filename = buildPersonnelBulkExportFilename(scope);
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function loadPersonnelBulkExportBundles(userIds: string[]): Promise<PersonnelProfileExportBundle[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const supabase = getServerSupabaseServiceClient();
  const exportedAt = new Date().toLocaleString("ru-RU");

  const usersPrimary = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,rota_module,employment_date,created_at",
    )
    .in("id", uniqueIds);

  let users = (usersPrimary.data ?? []) as Array<Record<string, unknown>>;
  if (usersPrimary.error && isMissingColumnError(usersPrimary.error.message)) {
    const fallback = await supabase
      .from("app_users")
      .select(
        "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,rota_module,created_at",
      )
      .in("id", uniqueIds);
    users = (fallback.data ?? []) as Array<Record<string, unknown>>;
  }
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  const profileData = await runInPool(uniqueIds, 6, async (userId) => ({
    userId,
    ...(await loadUserExportProfileData(userId)),
  }));

  const bundles: PersonnelProfileExportBundle[] = [];
  for (const item of profileData) {
    const u = userMap.get(item.userId);
    if (!u) continue;
    bundles.push(buildExportBundleFromUser(u, item.profile, item.testResults, exportedAt));
  }

  return bundles;
}

export async function loadPersonnelProfileExportBundles(userIds: string[]) {
  if (userIds.length === 0) return [];
  if (userIds.length === 1) {
    const bundle = await loadPersonnelProfileExportBundle(userIds[0]!);
    return bundle ? [bundle] : [];
  }
  return loadPersonnelBulkExportBundles(userIds);
}
