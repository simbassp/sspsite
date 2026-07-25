import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProfileTestActivity, type ProfileTestActivityData } from "@/lib/profile-test-activity";
import {
  computeTrialProfileStats,
  mapProfileTestResultApiRow,
  mapProfileTestResultsFromApi,
  type TrialProfileStats,
} from "@/lib/profile-trial-stats";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";
import { scanAllTestResultStatsRows } from "@/lib/test-results-stats-server";
import type { TestResult } from "@/lib/types";

const PROFILE_RESULTS_SELECT =
  "id,user_id,type,status,score,created_at,started_at,finished_at,duration_seconds,is_completed,questions_total,questions_correct";

const PROFILE_RESULTS_MID_SELECT =
  "id,user_id,type,status,score,created_at,questions_total,questions_correct";

const RECENT_RESULTS_LIMIT = 300;

export type ProfileTestResultsBundle = {
  rows: Array<Record<string, unknown>>;
  trialStats: TrialProfileStats;
  testActivity: ProfileTestActivityData;
  error: string | null;
};

function emptyTrialStats(): TrialProfileStats {
  return { total: 0, passed: 0, successRate: 0, totalTimeSec: null, lastAttempt: null };
}

function emptyTestActivity(): ProfileTestActivityData {
  return buildProfileTestActivity([]);
}

function chunkIds(ids: string[], size = 80) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function mapStatsRowToTestResult(r: {
  id?: string;
  user_id?: string;
  type?: string;
  test_type?: string;
  status?: string;
  created_at?: string;
  duration_seconds?: number | null;
  is_completed?: boolean | null;
}): TestResult {
  return {
    id: String(r.id ?? `${r.user_id}-${r.created_at}`),
    userId: String(r.user_id ?? ""),
    type: r.type === "final" || r.test_type === "final" ? "final" : "trial",
    status: r.status === "passed" ? "passed" : "failed",
    score: 0,
    createdAt: String(r.created_at ?? ""),
    startedAt: null,
    finishedAt: null,
    durationSeconds:
      r.duration_seconds === null || r.duration_seconds === undefined ? null : Number(r.duration_seconds),
    isCompleted: r.is_completed === null || r.is_completed === undefined ? null : Boolean(r.is_completed),
    questionsTotal: null,
    questionsCorrect: null,
    finalAttemptIndex: null,
  };
}

async function loadRecentFullResults(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<{ rows: Array<Record<string, unknown>>; error: string | null }> {
  let useMidSelect = false;
  const merged = new Map<string, Record<string, unknown>>();

  for (const part of chunkIds(userIds)) {
    let select = useMidSelect ? PROFILE_RESULTS_MID_SELECT : PROFILE_RESULTS_SELECT;
    let res = await supabase
      .from("test_results")
      .select(select)
      .in("user_id", part)
      .order("created_at", { ascending: false })
      .limit(RECENT_RESULTS_LIMIT);

    if (res.error && !useMidSelect && isMissingColumnError(res.error.message)) {
      useMidSelect = true;
      merged.clear();
      select = PROFILE_RESULTS_MID_SELECT;
      res = await supabase
        .from("test_results")
        .select(select)
        .in("user_id", part)
        .order("created_at", { ascending: false })
        .limit(RECENT_RESULTS_LIMIT);
    }
    if (res.error) return { rows: [], error: res.error.message };

    for (const row of (res.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "");
      if (id) merged.set(id, row);
    }
  }

  const rows = [...merged.values()]
    .sort((a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime())
    .slice(0, RECENT_RESULTS_LIMIT);

  return { rows: rows.map(mapProfileTestResultApiRow), error: null };
}

/** Статистика по всей истории + последние попытки для списков в профиле. */
export async function loadProfileTestResultsBundle(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileTestResultsBundle> {
  const ctx = await resolveFinalUserContext(supabase, userId);
  const userIds = [...new Set(ctx.linkedUserIds.filter(Boolean))];
  if (!userIds.length) {
    return { rows: [], trialStats: emptyTrialStats(), testActivity: emptyTestActivity(), error: null };
  }

  const [recent, history] = await Promise.all([
    loadRecentFullResults(supabase, userIds),
    scanAllTestResultStatsRows(supabase, userIds),
  ]);

  if (recent.error) {
    return { rows: [], trialStats: emptyTrialStats(), testActivity: emptyTestActivity(), error: recent.error };
  }
  if (history.error) {
    return {
      rows: recent.rows,
      trialStats: emptyTrialStats(),
      testActivity: emptyTestActivity(),
      error: history.error,
    };
  }

  const historyRows = history.rows.map(mapStatsRowToTestResult).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const trialStats = computeTrialProfileStats(historyRows);
  const testActivity = buildProfileTestActivity(historyRows);

  return { rows: recent.rows, trialStats, testActivity, error: null };
}

/** @deprecated Используйте loadProfileTestResultsBundle. */
export async function loadProfileTestResults(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: Array<Record<string, unknown>>; error: string | null }> {
  const bundle = await loadProfileTestResultsBundle(supabase, userId);
  return { rows: bundle.rows, error: bundle.error };
}

export function mapProfileTestResultsBundleRows(raw: Array<Record<string, unknown>>) {
  return mapProfileTestResultsFromApi(raw);
}
