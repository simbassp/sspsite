/** Допустимое число ошибок в пробном тесте. */
export const MAX_TRIAL_ERRORS = 2;

/** Допустимое число ошибок в итоговом тесте. */
export const MAX_FINAL_ERRORS = 3;

export function countTestErrors(correct: number, total: number): number {
  const safeTotal = Math.max(1, total);
  const safeCorrect = Math.max(0, Math.min(correct, safeTotal));
  return safeTotal - safeCorrect;
}

export function isTrialPassed(correct: number, total: number): boolean {
  return countTestErrors(correct, total) <= MAX_TRIAL_ERRORS;
}

export function isFinalPassed(correct: number, total: number): boolean {
  return countTestErrors(correct, total) <= MAX_FINAL_ERRORS;
}

export function resolveQuestionCounts(input: {
  questionsCorrect: number | null | undefined;
  questionsTotal: number | null | undefined;
  scorePercent: number | null | undefined;
  defaultTotal?: number;
}) {
  const total =
    input.questionsTotal != null && input.questionsTotal > 0
      ? input.questionsTotal
      : Math.max(1, input.defaultTotal ?? 15);
  const correct =
    input.questionsCorrect != null && Number.isFinite(input.questionsCorrect)
      ? Math.max(0, Math.min(input.questionsCorrect, total))
      : input.scorePercent != null && Number.isFinite(input.scorePercent)
        ? Math.round((input.scorePercent / 100) * total)
        : 0;
  const percent =
    input.scorePercent != null && Number.isFinite(input.scorePercent)
      ? Math.round(input.scorePercent)
      : Math.round((correct / total) * 100);
  return { correct, total, percent };
}

export function formatTestResultDisplay(input: {
  questionsCorrect: number | null | undefined;
  questionsTotal: number | null | undefined;
  scorePercent: number | null | undefined;
  defaultTotal?: number;
}) {
  const { correct, total, percent } = resolveQuestionCounts(input);
  return `${correct}/${total} (${percent}%)`;
}
