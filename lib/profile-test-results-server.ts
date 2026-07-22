import type { SupabaseClient } from "@supabase/supabase-js";
import { mapProfileTestResultApiRow } from "@/lib/profile-trial-stats";
import { isMissingColumnError, resolveFinalUserContext } from "@/lib/server-final-user-context";

const PROFILE_RESULTS_SELECT =
  "id,user_id,type,status,score,created_at,started_at,finished_at,duration_seconds,is_completed,questions_total,questions_correct";

const PROFILE_RESULTS_LEGACY_SELECT =
  "id,user_id,test_type,status,score,created_at,questions_total,questions_correct";

const PAGE_SIZE = 500;

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
  legacy: boolean,
) {
  const select = legacy ? PROFILE_RESULTS_LEGACY_SELECT : PROFILE_RESULTS_SELECT;
  const res = await supabase
    .from("test_results")
    .select(select)
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (res.error) return { rows: [] as Array<Record<string, unknown>>, error: res.error.message };
  return { rows: (res.data ?? []) as unknown as Array<Record<string, unknown>>, error: null as string | null };
}

/** Полная история попыток для профиля (все связанные user_id, без урезания до 20). */
export async function loadProfileTestResults(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: Array<Record<string, unknown>>; error: string | null }> {
  const ctx = await resolveFinalUserContext(supabase, userId);
  const userIds = [...new Set(ctx.linkedUserIds.filter(Boolean))];
  if (!userIds.length) return { rows: [], error: null };

  let legacy = false;
  const merged = new Map<string, Record<string, unknown>>();

  for (const part of chunkIds(userIds)) {
    let offset = 0;
    for (;;) {
      let page = await fetchResultsPage(supabase, part, offset, PAGE_SIZE, legacy);
      if (page.error && !legacy && isMissingColumnError(page.error)) {
        legacy = true;
        offset = 0;
        merged.clear();
        page = await fetchResultsPage(supabase, part, offset, PAGE_SIZE, true);
      }
      if (page.error) return { rows: [], error: page.error };

      for (const row of page.rows) {
        const id = String(row.id ?? "");
        if (id) merged.set(id, row);
      }

      if (page.rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const rows = [...merged.values()].sort(
    (a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime(),
  );

  return { rows: rows.map(mapProfileTestResultApiRow), error: null };
}
