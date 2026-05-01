import { dedupeQuestionOptions } from "@/lib/answer-equivalence";
import { filterDbPoolByManualTopicSettings, normalizeManualTopic } from "@/lib/manual-topic";
import { normalizeTestConfig } from "@/lib/test-config";
import { TestQuestion } from "@/lib/types";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type QuestionRow = {
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
  manual_topic?: string | null;
};

type LegacyQuestionRow = {
  id: string;
  type?: "trial" | "final";
  text: string;
  options: string[];
  correct_index?: number;
  created_at: string;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

async function loadTestConfigForPool(supabase: ReturnType<typeof getServerSupabaseServiceClient>) {
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
  const row = (configQ.data || {}) as Record<string, unknown>;
  return normalizeTestConfig({
    trialQuestionCount: Number(row.trial_question_count ?? 10),
    finalQuestionCount: Number(row.final_question_count ?? 15),
    timePerQuestionSec: Number(row.time_per_question_sec ?? 10),
    uavAutoGeneration: row.uav_auto_generation !== false,
    manualBankUavTtxEnabled: row.manual_bank_uav_ttx_enabled !== false,
    manualBankCounteractionEnabled: row.manual_bank_counteraction_enabled !== false,
  });
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const t0 = Date.now();
    const testConfig = await loadTestConfigForPool(supabase);
    const uavQ = supabase
      .from("catalog_items")
      .select("id,title,category,summary,image,specs,details")
      .eq("kind", "uav")
      .order("created_at", { ascending: false })
      .limit(200);

    let questionsData: unknown[] = [];
    let questionsError: string | null = null;

    const questionsWithTopic = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at,manual_topic")
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .limit(2000);

    if (!questionsWithTopic.error) {
      questionsData = (questionsWithTopic.data as unknown[]) || [];
      questionsError = null;
    } else if (isMissingColumnError(questionsWithTopic.error.message)) {
      const questionsNoTopic = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .limit(2000);
      if (!questionsNoTopic.error) {
        questionsData = (questionsNoTopic.data as unknown[]) || [];
        questionsError = null;
      } else if (isMissingColumnError(questionsNoTopic.error.message)) {
        const questionsLegacyQ = await supabase
          .from("test_questions")
          .select("id,type,text,options,correct_index,order_index,active,created_at")
          .eq("active", true)
          .order("order_index", { ascending: true })
          .limit(2000);
        questionsData = (questionsLegacyQ.data as unknown[]) || [];
        questionsError = questionsLegacyQ.error?.message || null;
      } else {
        questionsError = questionsNoTopic.error.message;
      }
    } else {
      questionsError = questionsWithTopic.error.message;
    }

    if (questionsError && isMissingColumnError(questionsError)) {
      const questionsMinimalQ = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,created_at")
        .limit(2000);
      questionsData = (questionsMinimalQ.data as unknown[]) || [];
      questionsError = questionsMinimalQ.error?.message || null;
    }
    const uavRes = await uavQ;
    const t1 = Date.now();

    if (uavRes.error) {
      return Response.json(
        { ok: false, error: uavRes.error?.message || "tests_pool_failed" },
        { status: 500 },
      );
    }

    let mappedQuestions: TestQuestion[] = [];
    if (!questionsError) {
      mappedQuestions = (questionsData as QuestionRow[]).map((q, index) =>
        dedupeQuestionOptions({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          correctIndex: q.correct_index,
          timeLimitSec: Number(q.time_limit_sec ?? 10),
          order: Number(q.order_index ?? index + 1),
          isActive: Boolean(q.is_active ?? q.active ?? true),
          createdAt: q.created_at,
          manualTopic: normalizeManualTopic(q.manual_topic),
        } as TestQuestion),
      );
    } else if (isMissingColumnError(questionsError)) {
      mappedQuestions = (questionsData as LegacyQuestionRow[]).map((q, index) =>
        dedupeQuestionOptions({
          id: q.id,
          type: q.type === "final" ? "final" : "trial",
          text: q.text,
          options: q.options,
          correctIndex: Number(q.correct_index ?? 0),
          timeLimitSec: 10,
          order: index + 1,
          isActive: true,
          createdAt: q.created_at,
        } as TestQuestion),
      );
    }

    mappedQuestions = filterDbPoolByManualTopicSettings(mappedQuestions, testConfig);

    return Response.json({
      ok: true,
      questionPool: mappedQuestions,
      uavItems: uavRes.data || [],
      timingsMs: {
        poolQuery: t1 - t0,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_pool_exception" },
      { status: 500 },
    );
  }
}
