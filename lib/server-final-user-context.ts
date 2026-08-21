import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

/** Все user_id в test_results, относящиеся к одному человеку, и окно подсчёта попыток (после сброса админом). */
type FinalUserContext = {
  linkedUserIds: string[];
  final_test_counting_from: string | null;
};

const FINAL_USER_CONTEXT_TTL_MS = 60_000;
const finalUserContextCache = new Map<string, { expiresAt: number; value: FinalUserContext }>();

async function resolveFinalUserContextUncached(supabase: SupabaseClient, sessionUserId: string): Promise<FinalUserContext> {
  const linked = new Set<string>([sessionUserId]);
  const authLinked = new Set<string>();
  let countingFrom: string | null = null;

  function mergeCounting(raw: unknown) {
    if (typeof raw === "string" && raw.trim()) countingFrom = raw;
  }

  function mergeRow(row: {
    id: string;
    auth_user_id?: string | null;
    final_test_counting_from?: string | null;
  }) {
    linked.add(row.id);
    if (row.auth_user_id) {
      const authId = String(row.auth_user_id);
      linked.add(authId);
      authLinked.add(authId);
    }
    mergeCounting(row.final_test_counting_from);
  }

  type AppUserRow = {
    id: string;
    auth_user_id?: string | null;
    final_test_counting_from?: string | null;
  };

  const byId = supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("id", sessionUserId)
    .limit(20);
  const byAuth = supabase
    .from("app_users")
    .select("id,auth_user_id,final_test_counting_from")
    .eq("auth_user_id", sessionUserId)
    .limit(200);

  const [byIdRes, byAuthRes] = await Promise.all([byId, byAuth]);

  if (!byIdRes.error) {
    for (const row of (byIdRes.data || []) as AppUserRow[]) mergeRow(row);
  } else if (isMissingColumnError(byIdRes.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("id", sessionUserId).limit(20);
    if (!fb.error) for (const row of (fb.data || []) as AppUserRow[]) mergeRow(row);
  }

  if (!byAuthRes.error) {
    for (const row of (byAuthRes.data || []) as AppUserRow[]) mergeRow(row);
  } else if (isMissingColumnError(byAuthRes.error.message)) {
    const fb = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", sessionUserId).limit(200);
    if (!fb.error) for (const row of (fb.data || []) as AppUserRow[]) mergeRow(row);
  }

  if (authLinked.size) {
    const linkedQueries = [...authLinked].map((authId) =>
      supabase
        .from("app_users")
        .select("id,auth_user_id,final_test_counting_from")
        .eq("auth_user_id", authId)
        .limit(200),
    );
    const linkedResults = await Promise.all(linkedQueries);
    for (const linkedByAuth of linkedResults) {
      if (!linkedByAuth.error) {
        for (const row of (linkedByAuth.data || []) as AppUserRow[]) mergeRow(row);
      }
    }
  }

  return {
    linkedUserIds: Array.from(linked),
    final_test_counting_from: countingFrom,
  };
}

export async function resolveFinalUserContext(supabase: SupabaseClient, sessionUserId: string) {
  const now = Date.now();
  const cached = finalUserContextCache.get(sessionUserId);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await resolveFinalUserContextUncached(supabase, sessionUserId);
  finalUserContextCache.set(sessionUserId, { value, expiresAt: now + FINAL_USER_CONTEXT_TTL_MS });
  return value;
}

export function invalidateFinalUserContextCache(userId?: string) {
  if (userId) {
    finalUserContextCache.delete(userId);
    return;
  }
  finalUserContextCache.clear();
}

function chunkIds(ids: string[], size = 80) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Пакетно: id связанного аккаунта → id сотрудника из выгрузки. */
export async function resolveBulkLinkedUserIds(supabase: SupabaseClient, rosterUserIds: string[]) {
  const rosterSet = new Set(rosterUserIds);
  const toCanonical = new Map<string, string>();
  for (const id of rosterUserIds) toCanonical.set(id, id);

  type AppUserRow = { id: string; auth_user_id?: string | null };

  const resolveCanon = (id: string, authId: string | null): string | null => {
    if (rosterSet.has(id)) return id;
    if (authId && rosterSet.has(authId)) return authId;
    const fromId = toCanonical.get(id);
    if (fromId) return fromId;
    if (authId) {
      const fromAuth = toCanonical.get(authId);
      if (fromAuth) return fromAuth;
    }
    return null;
  };

  const linkRow = (row: AppUserRow) => {
    const id = String(row.id);
    const authId = row.auth_user_id ? String(row.auth_user_id) : null;
    const canon = resolveCanon(id, authId);
    if (!canon) return;
    toCanonical.set(id, canon);
    if (authId) toCanonical.set(authId, canon);
  };

  let frontier = [...rosterUserIds];
  const seenQueries = new Set<string>();

  for (let hop = 0; hop < 5 && frontier.length; hop++) {
    const batch = [...new Set(frontier)].filter((id) => {
      const key = `q:${id}`;
      if (seenQueries.has(key)) return false;
      seenQueries.add(key);
      return true;
    });
    if (!batch.length) break;
    frontier = [];

    for (const part of chunkIds(batch)) {
      const [byId, byAuth] = await Promise.all([
        supabase.from("app_users").select("id,auth_user_id").in("id", part),
        supabase.from("app_users").select("id,auth_user_id").in("auth_user_id", part),
      ]);

      const merged = [...((byId.data ?? []) as AppUserRow[]), ...((byAuth.data ?? []) as AppUserRow[])];
      for (const row of merged) {
        linkRow(row);
        const id = String(row.id);
        const authId = row.auth_user_id ? String(row.auth_user_id) : null;
        frontier.push(id);
        if (authId) frontier.push(authId);
      }
    }
  }

  return toCanonical;
}
