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
  return m.includes("column") && m.includes("does not exist");
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

function mapResult(row: TestResultRow): TestResult {
  return {
    id: row.id,
    userId: row.user_id,
    type: (row.type ?? row.test_type) === "final" ? "final" : "trial",
    status: row.status,
    score: row.score,
    createdAt: row.created_at,
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
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    options: row.options,
    correctIndex: row.correct_index,
    timeLimitSec: Number(row.time_limit_sec ?? 10),
    order: row.order_index,
    isActive: Boolean(row.is_active ?? row.active ?? true),
    createdAt: row.created_at,
  };
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
          .select("id,user_id,type,status,score,created_at")
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
            .select("id,user_id,test_type,status,score,created_at")
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
    const { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("test_results")
          .select("id,user_id,type,status,score,created_at")
          .order("created_at", { ascending: false }),
      7000,
      1,
      "fetch_all_results_timeout",
    );
    if (error || !data) {
      return listTestResults();
    }
    return (data as TestResultRow[]).map(mapResult);
  } catch {
    return listTestResults();
  }
}

export async function createTrialResult(userId: string, score: number) {
  if (!isSupabaseConfigured) {
    addTrialResult(userId, score);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("test_results").insert({
    user_id: userId,
    type: "trial",
    status: score >= 60 ? "passed" : "failed",
    score,
  });
  if (error) {
    addTrialResult(userId, score);
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

export async function finishFinalAttempt(userId: string, score: number, passed: boolean) {
  if (!isSupabaseConfigured) {
    completeFinalAttempt(userId, score, passed);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const insert = await supabase.from("test_results").insert({
    user_id: userId,
    type: "final",
    status: passed ? "passed" : "failed",
    score,
  });

  if (insert.error) {
    completeFinalAttempt(userId, score, passed);
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
  const { data: existing } = await supabase
    .from("final_attempts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) return;

  const insert = await supabase.from("test_results").insert({
    user_id: userId,
    type: "final",
    status: "failed",
    score: 0,
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
        const mapped = (data as Array<Record<string, unknown>>).map((row, index) => ({
          id: String(row.id),
          type: row.type === "final" ? "final" : "trial",
          text: String(row.text || ""),
          options: Array.isArray(row.options) ? (row.options as string[]) : [],
          correctIndex: Number(row.correct_index ?? 0),
          timeLimitSec: 10,
          order: index + 1,
          isActive: true,
          createdAt: String(row.created_at || new Date().toISOString()),
        })) as TestQuestion[];
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
  const { data, error } = await supabase
    .from("test_questions")
    .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
    .order("type", { ascending: true })
    .order("order_index", { ascending: true });

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
    return upsertTestQuestion({ ...question });
  }
  const supabase = getSupabaseBrowserClient();
  const payload = {
    type: question.type,
    text: question.text,
    options: question.options,
    correct_index: question.correctIndex,
    time_limit_sec: question.timeLimitSec,
    order_index: question.order,
    is_active: question.isActive,
  };
  const payloadWithId = question.id ? { ...payload, id: question.id } : payload;
  const { data, error } = await supabase
    .from("test_questions")
    .upsert(payloadWithId, { onConflict: "id" })
    .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
    .single();

  if (error || !data) {
    return upsertTestQuestion({ ...question });
  }
  return mapQuestion(data as TestQuestionRow);
}

export async function deleteAdminQuestion(questionId: string) {
  if (!isSupabaseConfigured) {
    removeTestQuestion(questionId);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("test_questions").delete().eq("id", questionId);
  if (error) {
    removeTestQuestion(questionId);
  }
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
  const { data, error } = await supabase
    .from("test_settings")
    .upsert(payload, { onConflict: "id" })
    .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
    .single();

  if (error || !data) {
    updateTestConfig(config);
    return getTestConfig();
  }
  return mapConfig(data as TestConfigRow);
}
