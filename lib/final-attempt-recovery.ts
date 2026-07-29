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

function effectiveInterruptedAt(row: FinalAttemptRecoveryInput): string {
  return row.interruptedAt || row.updatedAt || row.startedAt;
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

  const interruptedMs = new Date(effectiveInterruptedAt(row)).getTime();
  const elapsed = now - interruptedMs;
  const withinWindow = elapsed <= FINAL_ATTEMPT_RECOVERY_WINDOW_MS;
  const secondsRemaining = withinWindow ? Math.max(0, Math.ceil((FINAL_ATTEMPT_RECOVERY_WINDOW_MS - elapsed) / 1000)) : 0;
  const canRecover = withinWindow && !row.recoveryUsed;

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
