import type { TestQuestion } from "@/lib/types";
import { shuffleQuestions } from "@/lib/test-question-selection";

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function pickDailyQuestions(pool: readonly TestQuestion[], count: number, dateKey: string) {
  if (!pool.length) return [];
  const need = Math.max(1, Math.min(count, pool.length));
  const rand = seededRandom(hashSeed(`game-tournament:${dateKey}`));
  const scored = pool.map((question, index) => ({
    question,
    score: rand() + index / Math.max(pool.length, 1),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, need).map((item) => item.question);
}

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

export function mskDateKey(date = new Date()) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}
