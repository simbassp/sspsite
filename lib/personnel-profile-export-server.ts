import { dutyLocationLabel } from "@/lib/duty-location";
import { loadPersonnelProfile } from "@/lib/personnel-server";
import { resolveFinalUserContext } from "@/lib/server-final-user-context";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { formatTotalTestDuration } from "@/lib/format";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import { normalizeUnitAssignment, unitAssignmentLabelOrEmpty } from "@/lib/unit-assignment";
import { rotaUnitLabelCompact } from "@/lib/personnel-catalog";
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
  };
  profile: PersonnelProfilePayload | null;
  testResults: PersonnelProfileExportTestRow[];
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
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

async function fetchExportTestRowsForUser(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const { linkedUserIds } = await resolveFinalUserContext(supabase, userId);
  const userIdsForTests = linkedUserIds.length > 0 ? linkedUserIds : [userId];

  const selectFull =
    "id,type,status,score,created_at,duration_seconds,questions_total,questions_correct";
  const selectMid = "id,type,status,score,created_at,questions_total,questions_correct";

  let testRows: Array<Record<string, unknown>> = [];
  const testPrimary = await supabase
    .from("test_results")
    .select(selectFull)
    .in("user_id", userIdsForTests)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!testPrimary.error) {
    testRows = (testPrimary.data ?? []) as Array<Record<string, unknown>>;
  } else if (isMissingColumnError(testPrimary.error.message)) {
    const retry = await supabase
      .from("test_results")
      .select(selectMid)
      .in("user_id", userIdsForTests)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!retry.error) {
      testRows = (retry.data ?? []) as Array<Record<string, unknown>>;
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
  const duty =
    typeof u.duty_location === "string" && u.duty_location.trim().toLowerCase() === "deployment"
      ? "deployment"
      : "base";

  const rotaPlatoon = u.rota_platoon != null ? Number(u.rota_platoon) : null;
  const rotaSection = u.rota_section != null ? Number(u.rota_section) : null;

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
      rotaUnit: rotaUnitLabelCompact(rotaPlatoon, rotaSection),
    },
    profile,
    testResults,
  };
}

export async function loadPersonnelProfileExportBundle(userId: string): Promise<PersonnelProfileExportBundle | null> {
  const supabase = getServerSupabaseServiceClient();
  const userRes = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,created_at",
    )
    .eq("id", userId)
    .maybeSingle();

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

  const usersRes = await supabase
    .from("app_users")
    .select(
      "id,name,callsign,position,role,status,login,duty_location,unit_assignment,rota_platoon,rota_section,created_at",
    )
    .in("id", uniqueIds);

  const users = (usersRes.data ?? []) as Array<Record<string, unknown>>;
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
