import { DEFAULT_TEST_CONFIG } from "@/lib/test-config";
import type { TestConfig } from "@/lib/types";

/** Допустимое число ошибок в пробном тесте. */
export const MAX_TRIAL_ERRORS = 2;

/** Допустимое число ошибок в итоговом тесте. */
export const MAX_FINAL_ERRORS = 3;

/** Минимальный процент правильных ответов для зачёта «Весь банк». */
export const BANK_PASS_PERCENT = 80;

/** Минимум правильных ответов для зачёта «Весь банк» при заданном размере банка. */
export function bankPassCorrectThreshold(total: number): number {
  const safeTotal = Math.max(1, total);
  return Math.ceil((safeTotal * BANK_PASS_PERCENT) / 100);
}

export function isBankPassed(correct: number, total: number): boolean {
  const safeTotal = Math.max(1, total);
  const safeCorrect = Math.max(0, Math.min(correct, safeTotal));
  return safeCorrect >= bankPassCorrectThreshold(safeTotal);
}

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

export type TestQuestionCountConfig = Pick<TestConfig, "trialQuestionCount" | "finalQuestionCount">;

export function defaultQuestionCountForTestType(
  type: "trial" | "final",
  config?: Partial<TestQuestionCountConfig> | null,
): number {
  if (type === "final") {
    return config?.finalQuestionCount ?? DEFAULT_TEST_CONFIG.finalQuestionCount;
  }
  return config?.trialQuestionCount ?? DEFAULT_TEST_CONFIG.trialQuestionCount;
}

export function formatTestResultForType(
  row: {
    type: "trial" | "final";
    questionsCorrect: number | null | undefined;
    questionsTotal: number | null | undefined;
    scorePercent: number | null | undefined;
  },
  config?: Partial<TestQuestionCountConfig> | null,
) {
  return formatTestResultDisplay({
    questionsCorrect: row.questionsCorrect,
    questionsTotal: row.questionsTotal,
    scorePercent: row.scorePercent,
    defaultTotal: defaultQuestionCountForTestType(row.type, config),
  });
}
