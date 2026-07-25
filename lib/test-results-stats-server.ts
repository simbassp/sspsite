import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/server-final-user-context";

export type PersonnelTestRosterStats = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

export type TestResultStatsRow = {
  user_id?: string;
  type?: string;
  test_type?: string;
  status?: string;
  created_at?: string;
  duration_seconds?: number | null;
  is_completed?: boolean | null;
};

const STATS_SELECT = "user_id,type,status,created_at,duration_seconds,is_completed";
const STATS_BASIC_SELECT = "user_id,type,status,created_at";

export const TEST_STATS_PAGE_SIZE = 500;
export const TEST_STATS_MAX_PAGES = 40;

export function emptyTestRosterStats(): PersonnelTestRosterStats {
  return { trialPassed: 0, trialFailed: 0, finalPassed: 0, finalFailed: 0 };
}

export function summarizeTestResultRows(
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

function chunkIds(ids: string[], size = 80) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

async function fetchTestStatsPage(
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
  if (res.error) return { rows: [] as TestResultStatsRow[], error: res.error.message };
  return { rows: (res.data ?? []) as TestResultStatsRow[], error: null as string | null };
}

/** Полная история попыток (без лимита на число попыток на человека). */
export async function scanAllTestResultStatsRows(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<{ rows: TestResultStatsRow[]; error: string | null }> {
  if (!userIds.length) return { rows: [], error: null };

  let useBasicSelect = false;
  const merged: TestResultStatsRow[] = [];

  for (const part of chunkIds(userIds)) {
    let offset = 0;
    let pages = 0;
    for (;;) {
      if (pages >= TEST_STATS_MAX_PAGES) break;
      pages += 1;
      const select = useBasicSelect ? STATS_BASIC_SELECT : STATS_SELECT;
      let page = await fetchTestStatsPage(supabase, part, offset, TEST_STATS_PAGE_SIZE, select);
      if (page.error && !useBasicSelect && isMissingColumnError(page.error)) {
        useBasicSelect = true;
        offset = 0;
        pages = 0;
        merged.length = 0;
        page = await fetchTestStatsPage(supabase, part, offset, TEST_STATS_PAGE_SIZE, STATS_BASIC_SELECT);
      }
      if (page.error) return { rows: merged, error: page.error };
      merged.push(...page.rows);
      if (page.rows.length < TEST_STATS_PAGE_SIZE) break;
      offset += TEST_STATS_PAGE_SIZE;
    }
  }

  return { rows: merged, error: null };
}

/** Статистика по всем сотрудникам выгрузки (с учётом связанных аккаунтов). */
export async function loadBulkTestStatsForRoster(
  supabase: SupabaseClient,
  rosterUserIds: string[],
  linkedMap: Map<string, string>,
): Promise<Map<string, PersonnelTestRosterStats>> {
  const map = new Map<string, PersonnelTestRosterStats>();
  for (const id of rosterUserIds) map.set(id, emptyTestRosterStats());
  if (!rosterUserIds.length) return map;

  const queryIds = [...new Set(linkedMap.keys())];
  const rowsByUser = new Map<string, TestResultStatsRow[]>();

  for (const part of chunkIds(queryIds)) {
    const scan = await scanAllTestResultStatsRows(supabase, part);
    if (scan.error) return map;

    for (const row of scan.rows) {
      const rawUid = String(row.user_id ?? "");
      if (!rawUid) continue;
      const canon = linkedMap.get(rawUid) ?? rawUid;
      if (!map.has(canon)) continue;
      const list = rowsByUser.get(canon) ?? [];
      list.push(row);
      rowsByUser.set(canon, list);
    }
  }

  for (const [id, rows] of rowsByUser) {
    map.set(id, summarizeTestResultRows(rows));
  }

  return map;
}
