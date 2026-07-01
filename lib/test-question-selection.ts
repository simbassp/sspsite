import type { TestQuestion } from "@/lib/types";

const RECENT_IDS_STORAGE_PREFIX = "ssp-test-recent-question-ids:";
const MAX_RECENT_IDS = 96;

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bucket = new Uint32Array(1);
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    let value = 0;
    do {
      crypto.getRandomValues(bucket);
      value = bucket[0] ?? 0;
    } while (value >= limit);
    return value % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function shuffleQuestions<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function recentStorageKey(userId: string) {
  return `${RECENT_IDS_STORAGE_PREFIX}${userId}`;
}

export function loadRecentQuestionIds(userId: string): string[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(recentStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id)).filter(Boolean);
  } catch {
    return [];
  }
}

export function rememberQuestionIds(userId: string, ids: string[]) {
  if (typeof window === "undefined" || !userId || !ids.length) return;
  try {
    const prev = loadRecentQuestionIds(userId);
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...ids, ...prev]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
      if (merged.length >= MAX_RECENT_IDS) break;
    }
    window.localStorage.setItem(recentStorageKey(userId), JSON.stringify(merged));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Случайная выборка без повторов внутри попытки.
 * Сначала берёт вопросы, которых не было в недавних попытках этого пользователя.
 */
export function pickTestQuestions(
  bank: readonly TestQuestion[],
  count: number,
  recentIds: readonly string[] = [],
): TestQuestion[] {
  if (!bank.length) return [];
  const need = Math.max(1, Math.min(count, bank.length));
  const recent = new Set(recentIds);
  const fresh = bank.filter((q) => !recent.has(q.id));
  const stale = bank.filter((q) => recent.has(q.id));
  const ordered = [...shuffleQuestions(fresh), ...shuffleQuestions(stale)];
  return ordered.slice(0, need);
}
