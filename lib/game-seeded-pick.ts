import type { TestQuestion } from "@/lib/types";
import { shuffleQuestions } from "@/lib/test-question-selection";

export function pickGameQuestions(
  pool: readonly TestQuestion[],
  count: number,
  recentIds: readonly string[] = [],
) {
  if (!pool.length) return [];
  const need = Math.max(1, Math.min(count, pool.length));
  const recent = new Set(recentIds);
  const fresh = pool.filter((q) => !recent.has(q.id));
  const stale = pool.filter((q) => recent.has(q.id));
  return [...shuffleQuestions(fresh), ...shuffleQuestions(stale)].slice(0, need);
}
