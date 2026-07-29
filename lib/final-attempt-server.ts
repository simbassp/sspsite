import {
  evaluateOrphanAttempt as evaluateOrphanAttemptCore,
  parseQuestionIds,
} from "@/lib/final-attempt-recovery";
import { pickReplacementQuestion } from "@/lib/test-question-selection";
import { loadServerTestQuestionPool, resolveQuestionsForAttempt } from "@/lib/test-question-pool-server";
import type { OrphanAttemptSummary } from "@/lib/types";
import type { TestQuestion } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { OrphanAttemptSummary };

export type FinalAttemptDbRow = {
  user_id: string;
  started_at: string;
  question_index: number;
  answers: Record<string, string> | null;
  question_ids?: string[] | null;
  recovery_used?: boolean | null;
  interrupted_at?: string | null;
  updated_at?: string | null;
};

export type FinalAttemptPayload = {
  userId: string;
  startedAt: string;
  questionIndex: number;
  answers: Record<string, string>;
  questionIds: string[];
  recoveryUsed: boolean;
  interruptedAt: string | null;
  updatedAt: string | null;
};

export function mapFinalAttemptRow(row: FinalAttemptDbRow): FinalAttemptPayload {
  const questionIds = parseQuestionIds(row.question_ids);
  return {
    userId: row.user_id,
    startedAt: row.started_at,
    questionIndex: Math.max(0, Number(row.question_index ?? 0)),
    answers: row.answers && typeof row.answers === "object" ? (row.answers as Record<string, string>) : {},
    questionIds,
    recoveryUsed: Boolean(row.recovery_used),
    interruptedAt: row.interrupted_at ? String(row.interrupted_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export function evaluateOrphanAttempt(row: FinalAttemptPayload | null, now = Date.now()): OrphanAttemptSummary {
  if (!row) {
    return evaluateOrphanAttemptCore(null, now);
  }
  return evaluateOrphanAttemptCore(
    {
      startedAt: row.startedAt,
      questionIndex: row.questionIndex,
      answers: row.answers,
      questionIds: row.questionIds,
      recoveryUsed: row.recoveryUsed,
      interruptedAt: row.interruptedAt,
      updatedAt: row.updatedAt,
    },
    now,
  );
}

const FINAL_ATTEMPT_SELECT =
  "user_id,started_at,question_index,answers,question_ids,recovery_used,interrupted_at,updated_at";
const FINAL_ATTEMPT_LEGACY_SELECT = "user_id,started_at,question_index,answers";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function loadFinalAttemptRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinalAttemptPayload | null> {
  let res = await supabase.from("final_attempts").select(FINAL_ATTEMPT_SELECT).eq("user_id", userId).maybeSingle();
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await supabase.from("final_attempts").select(FINAL_ATTEMPT_LEGACY_SELECT).eq("user_id", userId).maybeSingle();
  }
  if (res.error || !res.data) return null;
  return mapFinalAttemptRow(res.data as FinalAttemptDbRow);
}

/** Пометить обрыв (если ещё нет) и вернуть актуальную строку попытки. */
export async function prepareOrphanForRecovery(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinalAttemptPayload | null> {
  let row = await loadFinalAttemptRow(supabase, userId);
  if (!row || !row.questionIds.length || row.recoveryUsed) return row;
  if (!row.interruptedAt) {
    await markFinalAttemptInterrupted(supabase, userId);
    row = await loadFinalAttemptRow(supabase, userId);
  }
  return row;
}

export async function abandonFinalAttempt(supabase: SupabaseClient, userId: string) {
  await supabase.from("final_attempts").delete().eq("user_id", userId);
}

export async function markFinalAttemptInterrupted(supabase: SupabaseClient, userId: string) {
  const now = new Date().toISOString();
  const res = await supabase
    .from("final_attempts")
    .update({ interrupted_at: now, updated_at: now })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  return Boolean(res.data);
}

export async function recoverFinalAttempt(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; attempt: FinalAttemptPayload; questions: TestQuestion[]; replacedQuestion: TestQuestion }
  | { ok: false; error: string }
> {
  const row = await prepareOrphanForRecovery(supabase, userId);
  if (!row) return { ok: false, error: "not_found" };
  if (!row.questionIds.length) return { ok: false, error: "missing_question_ids" };

  const summary = evaluateOrphanAttempt(row);
  if (!summary.canRecover) {
    if (summary.recoveryUsed) return { ok: false, error: "recovery_already_used" };
    if (summary.expired) return { ok: false, error: "recovery_window_expired" };
    if (!row.interruptedAt) return { ok: false, error: "not_interrupted" };
    return { ok: false, error: "recovery_not_available" };
  }

  const pool = await loadServerTestQuestionPool(supabase);
  const exclude = new Set(row.questionIds);
  const replacement = pickReplacementQuestion(pool, exclude);
  if (!replacement) return { ok: false, error: "no_replacement_question" };

  const index = Math.min(row.questionIndex, row.questionIds.length - 1);
  const nextQuestionIds = [...row.questionIds];
  nextQuestionIds[index] = replacement.id;

  const baseQuestions = await resolveQuestionsForAttempt(supabase, row.questionIds);
  if (!baseQuestions) return { ok: false, error: "missing_attempt_questions" };

  const questions = nextQuestionIds.map((id, i) => (i === index ? replacement : baseQuestions[i]!));
  if (questions.length !== nextQuestionIds.length) {
    return { ok: false, error: "missing_attempt_questions" };
  }

  const now = new Date().toISOString();
  const upd = await supabase
    .from("final_attempts")
    .update({
      question_ids: nextQuestionIds,
      question_index: index,
      recovery_used: true,
      interrupted_at: null,
      updated_at: now,
    })
    .eq("user_id", userId)
    .select("user_id,started_at,question_index,answers,question_ids,recovery_used,interrupted_at,updated_at")
    .maybeSingle();

  if (upd.error || !upd.data) {
    return { ok: false, error: upd.error?.message || "recover_update_failed" };
  }

  return {
    ok: true,
    attempt: mapFinalAttemptRow(upd.data as FinalAttemptDbRow),
    questions,
    replacedQuestion: replacement,
  };
}
