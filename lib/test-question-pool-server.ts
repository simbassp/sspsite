import { dedupeQuestionOptions } from "@/lib/answer-equivalence";
import { filterDbPoolByManualTopicSettings, normalizeManualTopic } from "@/lib/manual-topic";
import { normalizeTestConfig } from "@/lib/test-config";
import { buildTestQuestionPool } from "@/lib/test-question-pool-merge";
import { generateUavTtxQuestionBank } from "@/lib/uav-test-generator";
import type { TestQuestion } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

/** Полный банк вопросов для серверной логики (как на клиенте при старте теста). */
export async function loadServerTestQuestionPool(supabase: SupabaseClient): Promise<TestQuestion[]> {
  let configQ = await supabase
    .from("test_settings")
    .select(
      "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
    )
    .eq("id", 1)
    .maybeSingle();
  if (configQ.error && isMissingColumnError(configQ.error.message)) {
    configQ = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .eq("id", 1)
      .maybeSingle();
  }
  const cfgRow = (configQ.data || {}) as Record<string, unknown>;
  const testConfig = normalizeTestConfig({
    trialQuestionCount: Number(cfgRow.trial_question_count ?? 10),
    finalQuestionCount: Number(cfgRow.final_question_count ?? 15),
    timePerQuestionSec: Number(cfgRow.time_per_question_sec ?? 10),
    uavAutoGeneration: cfgRow.uav_auto_generation !== false,
    manualBankUavTtxEnabled: cfgRow.manual_bank_uav_ttx_enabled !== false,
    manualBankCounteractionEnabled: cfgRow.manual_bank_counteraction_enabled !== false,
  });

  const questionsWithTopic = await supabase
    .from("test_questions")
    .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at,manual_topic")
    .eq("is_active", true)
    .order("order_index", { ascending: true })
    .limit(2000);

  let questionRows: Array<Record<string, unknown>> = [];
  if (questionsWithTopic.error && isMissingColumnError(questionsWithTopic.error.message)) {
    const fallback = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .limit(2000);
    questionRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  } else {
    questionRows = (questionsWithTopic.data ?? []) as Array<Record<string, unknown>>;
  }

  const dbPool: TestQuestion[] = questionRows.map((q, index) =>
    dedupeQuestionOptions({
      id: String(q.id),
      type: q.type === "final" ? "final" : "trial",
      text: String(q.text ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctIndex: Number(q.correct_index ?? 0),
      timeLimitSec: Number(q.time_limit_sec ?? 10),
      order: Number(q.order_index ?? index + 1),
      isActive: Boolean(q.is_active ?? true),
      createdAt: String(q.created_at ?? new Date().toISOString()),
      manualTopic: normalizeManualTopic(q.manual_topic),
    }),
  );
  const dbFiltered = filterDbPoolByManualTopicSettings(dbPool, testConfig);

  if (!testConfig.uavAutoGeneration) return buildTestQuestionPool(dbFiltered, [], false);

  const uavWithSort = await supabase
    .from("catalog_items")
    .select("id,title,category,summary,image,specs,details,sort_order")
    .eq("kind", "uav")
    .order("sort_order", { ascending: true })
    .limit(200);

  let uavRows: Array<Record<string, unknown>> = [];
  if (uavWithSort.error && isMissingColumnError(uavWithSort.error.message)) {
    const fallback = await supabase
      .from("catalog_items")
      .select("id,title,category,summary,image,specs,details")
      .eq("kind", "uav")
      .limit(200);
    uavRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  } else {
    uavRows = (uavWithSort.data ?? []) as Array<Record<string, unknown>>;
  }

  const fromUav =
    !uavRows.length
      ? []
      : generateUavTtxQuestionBank(uavRows as never[], testConfig.timePerQuestionSec);

  if (!fromUav.length) return buildTestQuestionPool(dbFiltered, [], false);

  return buildTestQuestionPool(dbFiltered, fromUav, true);
}

function mapQuestionRow(q: Record<string, unknown>, index: number): TestQuestion {
  return dedupeQuestionOptions({
    id: String(q.id),
    type: q.type === "final" ? "final" : "trial",
    text: String(q.text ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctIndex: Number(q.correct_index ?? 0),
    timeLimitSec: Number(q.time_limit_sec ?? 10),
    order: Number(q.order_index ?? index + 1),
    isActive: Boolean(q.is_active ?? true),
    createdAt: String(q.created_at ?? new Date().toISOString()),
    manualTopic: normalizeManualTopic(q.manual_topic),
  });
}

/** Собрать вопросы попытки по id (из пула + прямой догрузки из БД). */
export async function resolveQuestionsForAttempt(
  supabase: SupabaseClient,
  questionIds: readonly string[],
): Promise<TestQuestion[] | null> {
  if (!questionIds.length) return null;

  const pool = await loadServerTestQuestionPool(supabase);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const missing = questionIds.filter((id) => !byId.has(id));

  if (missing.length) {
    const withTopic = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at,manual_topic")
      .in("id", missing);
    let extraRows: Array<Record<string, unknown>> = [];
    if (withTopic.error && isMissingColumnError(withTopic.error.message)) {
      const fallback = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .in("id", missing);
      extraRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
    } else {
      extraRows = (withTopic.data ?? []) as Array<Record<string, unknown>>;
    }
    for (const [index, row] of extraRows.entries()) {
      const mapped = mapQuestionRow(row, index);
      byId.set(mapped.id, mapped);
    }
  }

  const questions = questionIds.map((id) => byId.get(id)).filter((q): q is TestQuestion => Boolean(q));
  return questions.length === questionIds.length ? questions : null;
}
