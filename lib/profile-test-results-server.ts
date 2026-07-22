import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeTrialProfileStats,
  mapProfileTestResultApiRow,
  mapProfileTestResultsFromApi,
  type TrialProfileStats,
} from "@/lib/profile-trial-stats";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

const PROFILE_RESULTS_SELECT =
  "id,user_id,type,status,score,created_at,started_at,finished_at,duration_seconds,is_completed,questions_total,questions_correct";

const PROFILE_RESULTS_MID_SELECT =
  "id,user_id,type,status,score,created_at,questions_total,questions_correct";

const PROFILE_RESULTS_STATS_SELECT = "id,type,status,created_at,duration_seconds,is_completed";
const PROFILE_RESULTS_STATS_MID_SELECT = "id,type,status,created_at";

const PAGE_SIZE = 500;
const RECENT_RESULTS_LIMIT = 300;
const MAX_STATS_PAGES = 40;

export type ProfileTestResultsBundle = {
  rows: Array<Record<string, unknown>>;
  trialStats: TrialProfileStats;
  error: string | null;
};

function emptyTrialStats(): TrialProfileStats {
  return { total: 0, passed: 0, successRate: 0, totalTimeSec: null, lastAttempt: null };
}

function chunkIds(ids: string[], size = 80) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

async function fetchResultsPage(
  supabase: SupabaseClient,
  userIds: string[],
  offset: number,
  limit: number,
  select: string,
) {
  const res = await supabase
    .from("test_results")
    .select(select)
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (res.error) return { rows: [] as Array<Record<string, unknown>>, error: res.error.message };
  return { rows: (res.data ?? []) as unknown as Array<Record<string, unknown>>, error: null as string | null };
}

function mapStatsRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    userId: "",
    type: r.type === "final" || r.test_type === "final" ? ("final" as const) : ("trial" as const),
    status: r.status === "passed" ? ("passed" as const) : ("failed" as const),
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

async function scanTrialStats(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<{ stats: TrialProfileStats; error: string | null }> {
  let useMidSelect = false;
  const trialRows: ReturnType<typeof mapStatsRow>[] = [];

  for (const part of chunkIds(userIds)) {
    let offset = 0;
    let pages = 0;
    for (;;) {
      if (pages >= MAX_STATS_PAGES) break;
      pages += 1;
      const select = useMidSelect ? PROFILE_RESULTS_STATS_MID_SELECT : PROFILE_RESULTS_STATS_SELECT;
      let page = await fetchResultsPage(supabase, part, offset, PAGE_SIZE, select);
      if (page.error && !useMidSelect && isMissingColumnError(page.error)) {
        useMidSelect = true;
        offset = 0;
        pages = 0;
        trialRows.length = 0;
        page = await fetchResultsPage(supabase, part, offset, PAGE_SIZE, PROFILE_RESULTS_STATS_MID_SELECT);
      }
      if (page.error) return { stats: emptyTrialStats(), error: page.error };

      for (const row of page.rows) {
        const mapped = mapStatsRow(row);
        if (mapped.type === "trial") trialRows.push(mapped);
      }

      if (page.rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  trialRows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return { stats: computeTrialProfileStats(trialRows), error: null };
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
  if (!userIds.length) return { rows: [], trialStats: emptyTrialStats(), error: null };

  const [recent, statsLoad] = await Promise.all([
    loadRecentFullResults(supabase, userIds),
    scanTrialStats(supabase, userIds),
  ]);

  if (recent.error) return { rows: [], trialStats: emptyTrialStats(), error: recent.error };
  if (statsLoad.error) return { rows: recent.rows, trialStats: emptyTrialStats(), error: statsLoad.error };

  return { rows: recent.rows, trialStats: statsLoad.stats, error: null };
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
