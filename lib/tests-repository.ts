"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  addTrialResult,
  completeFinalAttempt,
  getFinalAttempt,
  getTestConfig,
  listTestQuestions,
  listTestResults,
  markFinalAttemptAsFailed,
  removeTestQuestion,
  saveFinalAttempt,
  startFinalAttempt,
  updateTestConfig,
  upsertTestQuestion,
} from "@/lib/storage";
import { createDefaultQuestionBank } from "@/lib/test-question-bank";
import { normalizeTestConfig } from "@/lib/test-config";
import { dedupeQuestionOptions } from "@/lib/answer-equivalence";
import { withTimeoutAndRetry } from "@/lib/async-utils";
import { FinalAttemptState, TestConfig, TestQuestion, TestResult, TestType } from "@/lib/types";

type TestResultRow = {
  id: string;
  user_id: string;
  type?: "trial" | "final";
  test_type?: "trial" | "final";
  status: "passed" | "failed";
  score: number;
  created_at: string;
  questions_total?: number | null;
  questions_correct?: number | null;
};

type FinalAttemptRow = {
  user_id: string;
  started_at: string;
  question_index: number;
  answers: Record<string, string>;
};

type TestQuestionRow = {
  id: string;
  type: "trial" | "final";
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec?: number;
  order_index: number;
  is_active?: boolean;
  active?: boolean;
  created_at: string;
};

type TestConfigRow = {
  trial_question_count: number;
  final_question_count: number;
  time_per_question_sec?: number | null;
  uav_auto_generation?: boolean | null;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("column") && m.includes("could not find") && m.includes("schema cache"))
  );
}

async function resolveHistoryUserIds(supabase: ReturnType<typeof getSupabaseBrowserClient>, userId: string) {
  const ids = new Set<string>([userId]);
  try {
    const byAppIdPrimary = await supabase.from("app_users").select("id,auth_user_id").eq("id", userId).limit(1);
    let byAppIdRows: Array<Record<string, unknown>> = (byAppIdPrimary.data || []) as Array<Record<string, unknown>>;
    let byAppIdError: string | null = byAppIdPrimary.error?.message || null;
    if (byAppIdPrimary.error && isMissingColumnError(byAppIdPrimary.error.message)) {
      const byAppIdLegacy = await supabase.from("app_users").select("id").eq("id", userId).limit(1);
      byAppIdRows = (byAppIdLegacy.data || []) as Array<Record<string, unknown>>;
      byAppIdError = byAppIdLegacy.error?.message || null;
    }
    if (!byAppIdError) {
      for (const row of byAppIdRows) {
        if (row.id) ids.add(String(row.id));
        if (row.auth_user_id) ids.add(String(row.auth_user_id));
      }
    }
  } catch {}
  try {
    const byAuthId = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", userId).limit(1);
    if (!byAuthId.error) {
      for (const row of (byAuthId.data || []) as Array<Record<string, unknown>>) {
        if (row.id) ids.add(String(row.id));
        if (row.auth_user_id) ids.add(String(row.auth_user_id));
      }
    }
  } catch {}
  return Array.from(ids);
}

async function insertTestResultCompat(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  payload: {
    user_id: string;
    type: "trial" | "final";
    status: "passed" | "failed";
    score: number;
    questions_total?: number;
    questions_correct?: number;
  },
) {
  const base: Record<string, unknown> = {
    user_id: payload.user_id,
    type: payload.type,
    status: payload.status,
    score: payload.score,
  };
  if (payload.questions_total != null) base.questions_total = payload.questions_total;
  if (payload.questions_correct != null) base.questions_correct = payload.questions_correct;

  let primary = await supabase.from("test_results").insert(base);
  if (primary.error && isMissingColumnError(primary.error.message) && ("questions_total" in base || "questions_correct" in base)) {
    delete base.questions_total;
    delete base.questions_correct;
    primary = await supabase.from("test_results").insert(base);
  }
  if (!primary.error) return { error: null as null | { message: string } };
  if (!isMissingColumnError(primary.error.message)) {
    return { error: primary.error as { message: string } };
  }
  const legacy = await supabase.from("test_results").insert({
    user_id: payload.user_id,
    test_type: payload.type,
    status: payload.status,
    score: payload.score,
  });
  if (!legacy.error) return { error: null as null | { message: string } };
  return { error: legacy.error as { message: string } };
}

function mapResult(row: TestResultRow): TestResult {
  return {
    id: row.id,
    userId: row.user_id,
    type: (row.type ?? row.test_type) === "final" ? "final" : "trial",
    status: row.status,
    score: row.score,
    createdAt: row.created_at,
    questionsTotal: row.questions_total ?? undefined,
    questionsCorrect: row.questions_correct ?? undefined,
  };
}

function mapAttempt(row: FinalAttemptRow): FinalAttemptState {
  return {
    userId: row.user_id,
    startedAt: row.started_at,
    questionIndex: row.question_index,
    answers: Object.fromEntries(Object.entries(row.answers || {}).map(([k, v]) => [Number(k), String(v)])),
  };
}

function mapQuestion(row: TestQuestionRow): TestQuestion {
  return dedupeQuestionOptions({
    id: row.id,
    type: row.type,
    text: row.text,
    options: row.options,
    correctIndex: row.correct_index,
    timeLimitSec: Number(row.time_limit_sec ?? 10),
    order: row.order_index,
    isActive: Boolean(row.is_active ?? row.active ?? true),
    createdAt: row.created_at,
  });
}

function parseQuestionOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {}
    return raw
      .split(/\r?\n|;/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function mapUnknownQuestionRow(row: Record<string, unknown>, index: number): TestQuestion {
  const idRaw = row.id ?? row.question_id ?? row.uuid ?? `legacy-${index + 1}`;
  const typeRaw = row.type ?? row.test_type ?? row.mode ?? "final";
  const textRaw = row.text ?? row.question_text ?? row.question ?? "";
  const optionsRaw = row.options ?? row.answers ?? row.variants ?? row.answer_options ?? [];
  const correctIndexRaw = row.correct_index ?? row.correct_answer_index ?? row.correct_option ?? row.correct_answer ?? 0;
  const timeRaw = row.time_limit_sec ?? row.time_sec ?? row.time_limit ?? 20;
  const orderRaw = row.order_index ?? row.sort_order ?? row.order ?? index + 1;
  const activeRaw = row.is_active ?? row.active ?? row.enabled ?? true;
  const createdRaw = row.created_at ?? row.created ?? new Date().toISOString();
  const numericCorrect = Number(correctIndexRaw ?? 0);
  const options = parseQuestionOptions(optionsRaw);
  const correctIndex =
    Number.isFinite(numericCorrect) && numericCorrect >= 0
      ? numericCorrect
      : Math.max(0, options.findIndex((opt) => String(opt) === String(correctIndexRaw)));

  return dedupeQuestionOptions({
    id: String(idRaw),
    type: String(typeRaw) === "trial" ? "trial" : "final",
    text: String(textRaw),
    options,
    correctIndex,
    timeLimitSec: Math.max(5, Number(timeRaw || 20)),
    order: Math.max(1, Number(orderRaw || index + 1)),
    isActive: Boolean(activeRaw),
    createdAt: String(createdRaw),
  });
}

function mapConfig(row: TestConfigRow): TestConfig {
  const uav =
    typeof row.uav_auto_generation === "boolean" ? row.uav_auto_generation : undefined;
  return normalizeTestConfig({
    trialQuestionCount: row.trial_question_count,
    finalQuestionCount: row.final_question_count,
    timePerQuestionSec: row.time_per_question_sec ?? undefined,
    uavAutoGeneration: uav,
  });
}

export async function fetchUserResults(userId: string) {
  if (!isSupabaseConfigured) {
    return listTestResults().filter((r) => r.userId === userId);
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const userIds = await resolveHistoryUserIds(supabase, userId);
    let { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("test_results")
          .select("id,user_id,type,status,score,created_at,questions_total,questions_correct")
          .in("user_id", userIds)
          .order("created_at", { ascending: false }),
      7000,
      1,
      "fetch_user_results_timeout",
    );
    if (error && isMissingColumnError(error.message)) {
      const legacyRes = await withTimeoutAndRetry(
        () =>
          supabase
            .from("test_results")
            .select("id,user_id,test_type,status,score,created_at,questions_total,questions_correct")
            .in("user_id", userIds)
            .order("created_at", { ascending: false }),
        7000,
        1,
        "fetch_user_results_legacy_timeout",
      );
      data = legacyRes.data as unknown;
      error = legacyRes.error as { message: string } | null;
    }
    if (error || !data) {
      return listTestResults().filter((r) => r.userId === userId);
    }
    return (data as TestResultRow[]).map(mapResult);
  } catch {
    return listTestResults().filter((r) => r.userId === userId);
  }
}

export async function fetchAllResults() {
  if (!isSupabaseConfigured) {
    return listTestResults();
  }
  try {
    const supabase = getSupabaseBrowserClient();
    let { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("test_results")
          .select("id,user_id,type,status,score,created_at,questions_total,questions_correct")
          .order("created_at", { ascending: false }),
      7000,
      1,
      "fetch_all_results_timeout",
    );
    if (error && isMissingColumnError(error.message)) {
      const retry = await withTimeoutAndRetry(
        () =>
          supabase.from("test_results").select("id,user_id,type,status,score,created_at").order("created_at", { ascending: false }),
        7000,
        1,
        "fetch_all_results_fallback_timeout",
      );
      data = retry.data as typeof data;
      error = retry.error as typeof error;
    }
    if (error || !data) {
      return listTestResults();
    }
    return (data as TestResultRow[]).map(mapResult);
  } catch {
    return listTestResults();
  }
}

export async function createTrialResult(
  userId: string,
  score: number,
  meta?: { questionsTotal: number; questionsCorrect: number },
) {
  if (!isSupabaseConfigured) {
    addTrialResult(userId, score, meta);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await insertTestResultCompat(supabase, {
    user_id: userId,
    type: "trial",
    status: score >= 60 ? "passed" : "failed",
    score,
    ...(meta
      ? {
          questions_total: meta.questionsTotal,
          questions_correct: meta.questionsCorrect,
        }
      : {}),
  });
  if (error) {
    addTrialResult(userId, score, meta);
  }
}

export async function beginFinalAttempt(userId: string) {
  if (!isSupabaseConfigured) {
    return startFinalAttempt(userId);
  }
  const supabase = getSupabaseBrowserClient();
  const payload = {
    user_id: userId,
    started_at: new Date().toISOString(),
    question_index: 0,
    answers: {},
  };
  const { error } = await supabase.from("final_attempts").upsert(payload, { onConflict: "user_id" });
  if (error) {
    return startFinalAttempt(userId);
  }
  return {
    userId,
    startedAt: payload.started_at,
    questionIndex: 0,
    answers: {},
  } satisfies FinalAttemptState;
}

export async function persistFinalAttempt(state: FinalAttemptState) {
  if (!isSupabaseConfigured) {
    saveFinalAttempt(state);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("final_attempts").upsert(
    {
      user_id: state.userId,
      started_at: state.startedAt,
      question_index: state.questionIndex,
      answers: state.answers,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    saveFinalAttempt(state);
  }
}

export async function loadFinalAttempt(userId: string) {
  if (!isSupabaseConfigured) {
    return getFinalAttempt(userId);
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("final_attempts")
          .select("user_id,started_at,question_index,answers")
          .eq("user_id", userId)
          .maybeSingle(),
      6000,
      1,
      "load_final_attempt_timeout",
    );
    if (error || !data) {
      return getFinalAttempt(userId);
    }
    return mapAttempt(data as FinalAttemptRow);
  } catch {
    return getFinalAttempt(userId);
  }
}

export async function finishFinalAttempt(
  userId: string,
  score: number,
  passed: boolean,
  meta?: { questionsTotal: number; questionsCorrect: number },
) {
  if (!isSupabaseConfigured) {
    completeFinalAttempt(userId, score, passed, meta);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const insert = await insertTestResultCompat(supabase, {
    user_id: userId,
    type: "final",
    status: passed ? "passed" : "failed",
    score,
    ...(meta
      ? {
          questions_total: meta.questionsTotal,
          questions_correct: meta.questionsCorrect,
        }
      : {}),
  });

  if (insert.error) {
    completeFinalAttempt(userId, score, passed, meta);
    return;
  }

  await supabase.from("final_attempts").delete().eq("user_id", userId);
}

export async function forceFailFinalAttempt(userId: string) {
  if (!isSupabaseConfigured) {
    markFinalAttemptAsFailed(userId);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const [{ data: existing }, { data: cfgRow }] = await Promise.all([
    supabase.from("final_attempts").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("test_settings").select("final_question_count").eq("id", 1).maybeSingle(),
  ]);

  if (!existing) return;

  const questionsTotal = Math.max(1, Number((cfgRow as { final_question_count?: number } | null)?.final_question_count ?? 15));

  const insert = await insertTestResultCompat(supabase, {
    user_id: userId,
    type: "final",
    status: "failed",
    score: 0,
    questions_total: questionsTotal,
    questions_correct: 0,
  });

  if (insert.error) {
    markFinalAttemptAsFailed(userId);
    return;
  }

  await supabase.from("final_attempts").delete().eq("user_id", userId);
}

export async function fetchTestQuestions(type: TestType) {
  if (!isSupabaseConfigured) {
    return listTestQuestions(type).filter((q) => q.isActive);
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("test_questions")
    .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
    .eq("type", type)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error || !data) {
    return listTestQuestions(type).filter((q) => q.isActive);
  }
  return (data as TestQuestionRow[]).map(mapQuestion);
}

export async function fetchActiveQuestionPool() {
  if (!isSupabaseConfigured) {
    return listTestQuestions().filter((q) => q.isActive).sort((a, b) => a.order - b.order);
  }
  try {
    const supabase = getSupabaseBrowserClient();
    let { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("test_questions")
          .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
          .eq("is_active", true)
          .order("order_index", { ascending: true }),
      7000,
      1,
      "fetch_questions_timeout",
    );
    if (error && isMissingColumnError(error.message)) {
      const legacyRes = await withTimeoutAndRetry(
        () =>
          supabase
            .from("test_questions")
            .select("id,type,text,options,correct_index,order_index,active,created_at")
            .eq("active", true)
            .order("order_index", { ascending: true }),
        7000,
        1,
        "fetch_questions_legacy_timeout",
      );
      data = legacyRes.data as unknown;
      error = legacyRes.error as { message: string } | null;
    }
    if (error && isMissingColumnError(error.message)) {
      const minimalRes = await withTimeoutAndRetry(
        () => supabase.from("test_questions").select("id,type,text,options,correct_index,created_at").limit(2000),
        7000,
        1,
        "fetch_questions_minimal_timeout",
      );
      data = minimalRes.data as unknown;
      error = minimalRes.error as { message: string } | null;
      if (!error && Array.isArray(data)) {
        const mapped = (data as Array<Record<string, unknown>>).map((row, index) =>
          dedupeQuestionOptions({
            id: String(row.id),
            type: row.type === "final" ? "final" : "trial",
            text: String(row.text || ""),
            options: Array.isArray(row.options) ? (row.options as string[]) : [],
            correctIndex: Number(row.correct_index ?? 0),
            timeLimitSec: 10,
            order: index + 1,
            isActive: true,
            createdAt: String(row.created_at || new Date().toISOString()),
          }),
        );
        return mapped;
      }
    }
    if (error || !data) {
      return listTestQuestions().filter((q) => q.isActive).sort((a, b) => a.order - b.order);
    }
    return (data as TestQuestionRow[]).map(mapQuestion);
  } catch {
    return listTestQuestions().filter((q) => q.isActive).sort((a, b) => a.order - b.order);
  }
}

export async function fetchAdminQuestionBank() {
  if (!isSupabaseConfigured) {
    return listTestQuestions();
  }
  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase
    .from("test_questions")
    .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
    .order("type", { ascending: true })
    .order("order_index", { ascending: true });

  if (error && isMissingColumnError(error.message)) {
    const legacyRes = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index,order_index,active,created_at")
      .order("type", { ascending: true })
      .order("order_index", { ascending: true });
    data = legacyRes.data as typeof data;
    error = legacyRes.error as typeof error;
  }

  if (error && isMissingColumnError(error.message)) {
    const minimalRes = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index")
      .order("type", { ascending: true });
    data = minimalRes.data as typeof data;
    error = minimalRes.error as typeof error;
    if (!error && Array.isArray(data)) {
      return (data as Array<Record<string, unknown>>).map((row, index) =>
        dedupeQuestionOptions({
          id: String(row.id),
          type: row.type === "trial" ? "trial" : "final",
          text: String(row.text || ""),
          options: Array.isArray(row.options) ? (row.options as string[]) : [],
          correctIndex: Number(row.correct_index ?? 0),
          timeLimitSec: 20,
          order: index + 1,
          isActive: true,
          createdAt: new Date().toISOString(),
        }),
      );
    }
  }
  if (error) {
    const wildcardRes = await supabase.from("test_questions").select("*").limit(2000);
    data = wildcardRes.data as typeof data;
    error = wildcardRes.error as typeof error;
    if (!error && Array.isArray(data)) {
      return (data as Array<Record<string, unknown>>).map(mapUnknownQuestionRow);
    }
  }

  if (error || !data) {
    return listTestQuestions();
  }
  return (data as TestQuestionRow[]).map(mapQuestion);
}

export async function saveAdminQuestion(question: {
  id?: string;
  type: TestType;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
  order: number;
  isActive: boolean;
}) {
  if (!isSupabaseConfigured) {
    upsertTestQuestion({ ...question });
    return { ok: true as const };
  }
  const supabase = getSupabaseBrowserClient();
  const fullPayload: Record<string, unknown> = {
    type: question.type,
    text: question.text,
    options: question.options,
    correct_index: question.correctIndex,
    time_limit_sec: question.timeLimitSec,
    order_index: question.order,
    is_active: question.isActive,
  };
  const fullPayloadWithId = question.id ? { ...fullPayload, id: question.id } : fullPayload;
  let writeRes = question.id
    ? await supabase.from("test_questions").update(fullPayload).eq("id", question.id)
    : await supabase.from("test_questions").insert(fullPayloadWithId);

  // Если схема БД старая и не знает какие‑то колонки (time_limit_sec / order_index / is_active),
  // пробуем более минимальный набор, который совместим с любой версией.
  if (writeRes.error && isMissingColumnError(writeRes.error.message)) {
    const minimalPayload: Record<string, unknown> = {
      type: question.type,
      text: question.text,
      options: question.options,
      correct_index: question.correctIndex,
    };
    const minimalPayloadWithId = question.id ? { ...minimalPayload, id: question.id } : minimalPayload;
    writeRes = question.id
      ? await supabase.from("test_questions").update(minimalPayload).eq("id", question.id)
      : await supabase.from("test_questions").insert(minimalPayloadWithId);
  }
  if (writeRes.error) {
    const fullByQuestionId = question.id
      ? await supabase.from("test_questions").update(fullPayload).eq("question_id", question.id)
      : null;
    if (fullByQuestionId && !fullByQuestionId.error) {
      return { ok: true as const };
    }
  }
  if (writeRes.error && isMissingColumnError(writeRes.error.message)) {
    const legacyPayload: Record<string, unknown> = {
      test_type: question.type,
      question: question.text,
      answers: question.options,
      correct_answer: question.correctIndex,
      active: question.isActive,
      order: question.order,
    };
    const legacyPayloadWithId = question.id ? { ...legacyPayload, question_id: question.id } : legacyPayload;
    writeRes = question.id
      ? await supabase.from("test_questions").update(legacyPayload).eq("question_id", question.id)
      : await supabase.from("test_questions").insert(legacyPayloadWithId);
  }

  if (writeRes.error) {
    upsertTestQuestion({ ...question });
    return { ok: false as const, error: writeRes.error.message };
  }
  return { ok: true as const };
}

export async function deleteAdminQuestion(questionId: string) {
  if (!questionId || questionId === "undefined") {
    return false;
  }
  if (!isSupabaseConfigured) {
    removeTestQuestion(questionId);
    return true;
  }
  const supabase = getSupabaseBrowserClient();
  let removeRes = await supabase.from("test_questions").delete().eq("id", questionId);
  if (removeRes.error && isMissingColumnError(removeRes.error.message)) {
    removeRes = await supabase.from("test_questions").delete().eq("question_id", questionId);
  }
  if (removeRes.error) {
    removeTestQuestion(questionId);
    return false;
  }
  return true;
}

export async function setAdminQuestionActive(questionId: string, isActive: boolean) {
  if (!questionId || questionId === "undefined") return false;
  if (!isSupabaseConfigured) {
    const existing = listTestQuestions().find((q) => q.id === questionId);
    if (!existing) return false;
    upsertTestQuestion({ ...existing, isActive });
    return true;
  }
  const supabase = getSupabaseBrowserClient();
  let updateRes = await supabase.from("test_questions").update({ is_active: isActive }).eq("id", questionId);
  if (updateRes.error && isMissingColumnError(updateRes.error.message)) {
    updateRes = await supabase.from("test_questions").update({ active: isActive }).eq("id", questionId);
  }
  if (updateRes.error) {
    let legacyRes = await supabase.from("test_questions").update({ active: isActive }).eq("question_id", questionId);
    if (legacyRes.error && isMissingColumnError(legacyRes.error.message)) {
      legacyRes = await supabase.from("test_questions").update({ enabled: isActive }).eq("id", questionId);
    }
    if (!legacyRes.error) return true;
    const existing = listTestQuestions().find((q) => q.id === questionId);
    if (!existing) return false;
    upsertTestQuestion({ ...existing, isActive });
    return false;
  }
  return true;
}

export async function seedDefaultQuestionsIfEmpty() {
  const localDefault = createDefaultQuestionBank();
  if (!isSupabaseConfigured) {
    if (listTestQuestions().length > 0) return;
    localDefault.forEach((question) => {
      upsertTestQuestion(question);
    });
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("test_questions")
    .select("id", { count: "exact", head: true });

  if (error || (count ?? 0) > 0) return;

  await supabase.from("test_questions").insert(
    localDefault.map((q) => ({
      type: q.type,
      text: q.text,
      options: q.options,
      correct_index: q.correctIndex,
      time_limit_sec: q.timeLimitSec,
      order_index: q.order,
      is_active: q.isActive,
    })),
  );
}

export async function fetchTestConfig() {
  if (!isSupabaseConfigured) {
    return getTestConfig();
  }
  try {
    const supabase = getSupabaseBrowserClient();
    let { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("test_settings")
          .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
          .eq("id", 1)
          .maybeSingle(),
      6000,
      1,
      "fetch_test_config_timeout",
    );
    if (error && isMissingColumnError(error.message)) {
      const partialTimeRes = await withTimeoutAndRetry(
        () =>
          supabase
            .from("test_settings")
            .select("trial_question_count,final_question_count,time_per_question_sec")
            .eq("id", 1)
            .maybeSingle(),
        6000,
        1,
        "fetch_test_config_partial_time_timeout",
      );
      data = partialTimeRes.data as unknown;
      error = partialTimeRes.error as { message: string } | null;
      if (error && isMissingColumnError(error.message)) {
        const partialUavRes = await withTimeoutAndRetry(
          () =>
            supabase
              .from("test_settings")
              .select("trial_question_count,final_question_count,uav_auto_generation")
              .eq("id", 1)
              .maybeSingle(),
          6000,
          1,
          "fetch_test_config_partial_uav_timeout",
        );
        data = partialUavRes.data as unknown;
        error = partialUavRes.error as { message: string } | null;
      }
      if (error && isMissingColumnError(error.message)) {
        const legacyRes = await withTimeoutAndRetry(
          () =>
            supabase
              .from("test_settings")
              .select("trial_question_count,final_question_count")
              .eq("id", 1)
              .maybeSingle(),
          6000,
          1,
          "fetch_test_config_legacy_timeout",
        );
        data = legacyRes.data as unknown;
        error = legacyRes.error as { message: string } | null;
      }
    }
    if (error || !data) {
      return getTestConfig();
    }
    return mapConfig(data as TestConfigRow);
  } catch {
    return getTestConfig();
  }
}

export async function saveTestConfig(config: TestConfig) {
  if (!isSupabaseConfigured) {
    updateTestConfig(config);
    return getTestConfig();
  }
  const supabase = getSupabaseBrowserClient();
  const normalized = normalizeTestConfig(config);
  const payload = {
    id: 1,
    trial_question_count: normalized.trialQuestionCount,
    final_question_count: normalized.finalQuestionCount,
    time_per_question_sec: normalized.timePerQuestionSec,
    uav_auto_generation: normalized.uavAutoGeneration,
    updated_at: new Date().toISOString(),
  };
  let saveRes = await supabase
    .from("test_settings")
    .upsert(payload, { onConflict: "id" })
    .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
    .single();

  if (saveRes.error && isMissingColumnError(saveRes.error.message)) {
    // Legacy schemas may not have updated_at.
    const payloadWithoutUpdatedAt = {
      id: 1,
      trial_question_count: normalized.trialQuestionCount,
      final_question_count: normalized.finalQuestionCount,
      time_per_question_sec: normalized.timePerQuestionSec,
      uav_auto_generation: normalized.uavAutoGeneration,
    };
    saveRes = await supabase
      .from("test_settings")
      .upsert(payloadWithoutUpdatedAt, { onConflict: "id" })
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .single();
  }

  if (saveRes.error && isMissingColumnError(saveRes.error.message)) {
    const payloadWithoutUav = {
      id: 1,
      trial_question_count: normalized.trialQuestionCount,
      final_question_count: normalized.finalQuestionCount,
      time_per_question_sec: normalized.timePerQuestionSec,
    };
    saveRes = await supabase
      .from("test_settings")
      .upsert(payloadWithoutUav, { onConflict: "id" })
      .select("trial_question_count,final_question_count,time_per_question_sec")
      .single();
  }

  if (saveRes.error && isMissingColumnError(saveRes.error.message)) {
    // Very old schema: keep question counts persistent at minimum.
    const legacyPayload = {
      id: 1,
      trial_question_count: normalized.trialQuestionCount,
      final_question_count: normalized.finalQuestionCount,
    };
    const legacyRes = await supabase
      .from("test_settings")
      .upsert(legacyPayload, { onConflict: "id" })
      .select("trial_question_count,final_question_count")
      .single();
    if (!legacyRes.error && legacyRes.data) {
      return normalizeTestConfig({
        trialQuestionCount: Number((legacyRes.data as { trial_question_count?: unknown }).trial_question_count ?? 10),
        finalQuestionCount: Number((legacyRes.data as { final_question_count?: unknown }).final_question_count ?? 15),
        timePerQuestionSec: normalized.timePerQuestionSec,
        uavAutoGeneration: normalized.uavAutoGeneration,
      });
    }
  }

  if (saveRes.error || !saveRes.data) {
    updateTestConfig(config);
    return getTestConfig();
  }
  return mapConfig(saveRes.data as TestConfigRow);
}
