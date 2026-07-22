import type { TestResult } from "@/lib/types";

export type TrialProfileStats = {
  total: number;
  passed: number;
  successRate: number;
  totalTimeSec: number | null;
  lastAttempt: TestResult | null;
};

export type TrialProfileStatsPayload = {
  total: number;
  passed: number;
  successRate: number;
  totalTimeSec: number | null;
  lastAttemptCreatedAt: string | null;
};

export function serializeTrialProfileStats(stats: TrialProfileStats): TrialProfileStatsPayload {
  return {
    total: stats.total,
    passed: stats.passed,
    successRate: stats.successRate,
    totalTimeSec: stats.totalTimeSec,
    lastAttemptCreatedAt: stats.lastAttempt?.createdAt ?? null,
  };
}

export function deserializeTrialProfileStats(payload: TrialProfileStatsPayload | null | undefined): TrialProfileStats | null {
  if (!payload) return null;
  const lastCreatedAt = payload.lastAttemptCreatedAt;
  return {
    total: payload.total,
    passed: payload.passed,
    successRate: payload.successRate,
    totalTimeSec: payload.totalTimeSec,
    lastAttempt: lastCreatedAt
      ? {
          id: "stats-last",
          userId: "",
          type: "trial",
          status: "passed",
          score: 0,
          createdAt: lastCreatedAt,
          startedAt: null,
          finishedAt: null,
          durationSeconds: null,
          isCompleted: null,
          questionsTotal: null,
          questionsCorrect: null,
          finalAttemptIndex: null,
        }
      : null,
  };
}

/** Статистика «Ваша активность» — только пробные попытки (type === trial). */
export function computeTrialProfileStats(rows: TestResult[]): TrialProfileStats {
  const trialRows = rows.filter((r) => r.type === "trial");
  const total = trialRows.length;
  const passed = trialRows.filter((r) => r.status === "passed").length;
  const successRate = total ? Math.round((passed / total) * 100) : 0;
  const lastAttempt = trialRows[0] ?? null;
  const completedWithDuration = trialRows.filter(
    (item) =>
      item.isCompleted !== false &&
      item.durationSeconds != null &&
      Number.isFinite(Number(item.durationSeconds)) &&
      Number(item.durationSeconds) > 0,
  );
  const totalTimeSec = completedWithDuration.length
    ? Math.round(completedWithDuration.reduce((acc, item) => acc + Number(item.durationSeconds || 0), 0))
    : null;
  return { total, passed, successRate, totalTimeSec, lastAttempt };
}

export function mapProfileTestResultsFromApi(raw: Array<Record<string, unknown>>): TestResult[] {
  return raw
    .map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      type: r.type === "final" ? ("final" as const) : ("trial" as const),
      status: r.status === "passed" ? ("passed" as const) : ("failed" as const),
      score: Number(r.score || 0),
      createdAt: String(r.created_at),
      startedAt: r.started_at ? String(r.started_at) : null,
      finishedAt: r.finished_at ? String(r.finished_at) : null,
      durationSeconds:
        r.duration_seconds === null || r.duration_seconds === undefined ? null : Number(r.duration_seconds),
      isCompleted: r.is_completed === null || r.is_completed === undefined ? null : Boolean(r.is_completed),
      questionsTotal:
        r.questions_total === null || r.questions_total === undefined ? null : Number(r.questions_total),
      questionsCorrect:
        r.questions_correct === null || r.questions_correct === undefined ? null : Number(r.questions_correct),
      finalAttemptIndex:
        r.final_attempt_index === null || r.final_attempt_index === undefined
          ? null
          : Number(r.final_attempt_index),
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function mapProfileTestResultApiRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    user_id: r.user_id,
    type: r.type ?? r.test_type,
    status: r.status,
    score: r.score,
    created_at: r.created_at,
    started_at: r.started_at ?? null,
    finished_at: r.finished_at ?? null,
    duration_seconds: r.duration_seconds ?? null,
    is_completed: r.is_completed ?? null,
    questions_total: r.questions_total ?? null,
    questions_correct: r.questions_correct ?? null,
  };
}
