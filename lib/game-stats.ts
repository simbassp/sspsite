import type { GameModeId } from "@/lib/game-modes";

export type GameStoredStats = {
  totalAnswered: number;
  totalCorrect: number;
  bestBlitz: number;
  bestSurvival: number;
  bestLadder: number;
  duelWins: number;
  lastResults: Array<{
    mode: GameModeId;
    score: number;
    total: number;
    at: string;
    label: string;
  }>;
};

const STORAGE_KEY = "ssp-game-stats-v1";

export const EMPTY_GAME_STATS: GameStoredStats = {
  totalAnswered: 0,
  totalCorrect: 0,
  bestBlitz: 0,
  bestSurvival: 0,
  bestLadder: 0,
  duelWins: 0,
  lastResults: [],
};

export function loadGameStats(): GameStoredStats {
  if (typeof window === "undefined") return EMPTY_GAME_STATS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_GAME_STATS;
    const parsed = JSON.parse(raw) as Partial<GameStoredStats>;
    return {
      ...EMPTY_GAME_STATS,
      ...parsed,
      lastResults: Array.isArray(parsed.lastResults) ? parsed.lastResults.slice(0, 12) : [],
    };
  } catch {
    return EMPTY_GAME_STATS;
  }
}

export function saveGameResult(input: {
  mode: GameModeId;
  correct: number;
  total: number;
  label: string;
  won?: boolean;
}) {
  if (typeof window === "undefined") return loadGameStats();
  const prev = loadGameStats();
  const next: GameStoredStats = {
    ...prev,
    totalAnswered: prev.totalAnswered + input.total,
    totalCorrect: prev.totalCorrect + input.correct,
    lastResults: [
      { mode: input.mode, score: input.correct, total: input.total, at: new Date().toISOString(), label: input.label },
      ...prev.lastResults,
    ].slice(0, 12),
  };

  if (input.mode === "blitz") next.bestBlitz = Math.max(prev.bestBlitz, input.correct);
  if (input.mode === "survival") next.bestSurvival = Math.max(prev.bestSurvival, input.correct);
  if (input.mode === "ladder" && input.correct === input.total) {
    next.bestLadder = Math.max(prev.bestLadder, input.correct);
  }
  if (input.mode === "duel" && input.won) next.duelWins = prev.duelWins + 1;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function gameAccuracy(stats: GameStoredStats) {
  if (!stats.totalAnswered) return 0;
  return Math.round((stats.totalCorrect / stats.totalAnswered) * 100);
}
