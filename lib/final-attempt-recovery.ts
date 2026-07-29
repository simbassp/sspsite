import { FINAL_ATTEMPT_RECOVERY_WINDOW_MS } from "@/lib/final-attempt-constants";
import type { OrphanAttemptSummary } from "@/lib/types";

export type FinalAttemptRecoveryInput = {
  questionIds: string[];
  questionIndex: number;
  answers: Record<string, string>;
  recoveryUsed: boolean;
  interruptedAt: string | null;
  updatedAt: string | null;
  startedAt: string;
};

export function parseQuestionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export function evaluateOrphanAttempt(row: FinalAttemptRecoveryInput | null, now = Date.now()): OrphanAttemptSummary {
  if (!row || !row.questionIds.length) {
    return {
      hasOrphan: Boolean(row),
      canRecover: false,
      recoveryUsed: Boolean(row?.recoveryUsed),
      expired: true,
      secondsRemaining: 0,
      questionIndex: row?.questionIndex ?? 0,
      questionCount: row?.questionIds.length ?? 0,
      answeredCount: row ? Object.keys(row.answers).length : 0,
    };
  }

  if (row.recoveryUsed) {
    return {
      hasOrphan: true,
      canRecover: false,
      recoveryUsed: true,
      expired: false,
      secondsRemaining: 0,
      questionIndex: row.questionIndex,
      questionCount: row.questionIds.length,
      answeredCount: Object.keys(row.answers).length,
    };
  }

  if (!row.interruptedAt) {
    return {
      hasOrphan: true,
      canRecover: false,
      recoveryUsed: false,
      expired: false,
      secondsRemaining: 0,
      questionIndex: row.questionIndex,
      questionCount: row.questionIds.length,
      answeredCount: Object.keys(row.answers).length,
    };
  }

  const interruptedMs = new Date(row.interruptedAt).getTime();
  if (!Number.isFinite(interruptedMs)) {
    return {
      hasOrphan: true,
      canRecover: false,
      recoveryUsed: false,
      expired: true,
      secondsRemaining: 0,
      questionIndex: row.questionIndex,
      questionCount: row.questionIds.length,
      answeredCount: Object.keys(row.answers).length,
    };
  }

  const elapsed = now - interruptedMs;
  const withinWindow = elapsed <= FINAL_ATTEMPT_RECOVERY_WINDOW_MS;
  const secondsRemaining = withinWindow ? Math.max(0, Math.ceil((FINAL_ATTEMPT_RECOVERY_WINDOW_MS - elapsed) / 1000)) : 0;
  const canRecover = withinWindow;

  return {
    hasOrphan: true,
    canRecover,
    recoveryUsed: row.recoveryUsed,
    expired: !withinWindow,
    secondsRemaining,
    questionIndex: row.questionIndex,
    questionCount: row.questionIds.length,
    answeredCount: Object.keys(row.answers).length,
  };
}

export function finalAttemptToRecoveryInput(state: {
  startedAt: string;
  questionIndex: number;
  answers: Record<string, string>;
  questionIds: string[];
  recoveryUsed?: boolean;
  interruptedAt?: string | null;
}): FinalAttemptRecoveryInput {
  return {
    startedAt: state.startedAt,
    questionIndex: state.questionIndex,
    answers: state.answers,
    questionIds: state.questionIds,
    recoveryUsed: Boolean(state.recoveryUsed),
    interruptedAt: state.interruptedAt ?? null,
    updatedAt: null,
  };
}
