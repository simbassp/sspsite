"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  addTrialResult,
  completeFinalAttempt,
  getFinalAttempt,
  listTestResults,
  markFinalAttemptAsFailed,
  saveFinalAttempt,
  startFinalAttempt,
} from "@/lib/storage";
import { FinalAttemptState, TestResult } from "@/lib/types";

type TestResultRow = {
  id: string;
  user_id: string;
  type: "trial" | "final";
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

function mapResult(row: TestResultRow): TestResult {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
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

export async function fetchUserResults(userId: string) {
  if (!isSupabaseConfigured) {
    return listTestResults().filter((r) => r.userId === userId);
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("test_results")
    .select("id,user_id,type,status,score,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listTestResults().filter((r) => r.userId === userId);
  }
  return (data as TestResultRow[]).map(mapResult);
}

export async function fetchAllResults() {
  if (!isSupabaseConfigured) {
    return listTestResults();
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("test_results")
    .select("id,user_id,type,status,score,created_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listTestResults();
  }
  return (data as TestResultRow[]).map(mapResult);
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
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("final_attempts")
    .select("user_id,started_at,question_index,answers")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return getFinalAttempt(userId);
  }
  return mapAttempt(data as FinalAttemptRow);
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
