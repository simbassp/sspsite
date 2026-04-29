import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("column") && m.includes("could not find") && m.includes("schema cache"))
  );
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const [resultsQ, baseQuestionsQ] = await Promise.all([
      supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .order("type", { ascending: true })
        .order("order_index", { ascending: true })
        .limit(2000),
    ]);
    let questionsData = baseQuestionsQ.data as Array<Record<string, unknown>> | null;
    let questionsError = baseQuestionsQ.error;
    if (questionsError && isMissingColumnError(questionsError.message)) {
      const legacyQuestionsQ = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,order_index,active,created_at")
        .order("type", { ascending: true })
        .order("order_index", { ascending: true })
        .limit(2000);
      questionsData = legacyQuestionsQ.data as Array<Record<string, unknown>> | null;
      questionsError = legacyQuestionsQ.error;
    }
    if (questionsError && isMissingColumnError(questionsError.message)) {
      const minimalQuestionsQ = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index")
        .limit(2000);
      questionsData = minimalQuestionsQ.data as Array<Record<string, unknown>> | null;
      questionsError = minimalQuestionsQ.error;
    }
    if (questionsError) {
      const wildcardQuestionsQ = await supabase.from("test_questions").select("*").limit(2000);
      questionsData = wildcardQuestionsQ.data as Array<Record<string, unknown>> | null;
      questionsError = wildcardQuestionsQ.error;
    }

    let configQ = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((configQ.error || !configQ.data) && isMissingColumnError(configQ.error?.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error || !configQ.data) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .eq("id", 1)
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec")
        .eq("id", 1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,uav_auto_generation")
        .eq("id", 1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count")
        .eq("id", 1)
        .maybeSingle();
    }
    if (!configQ.error && !configQ.data) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    if (resultsQ.error || configQ.error) {
      return Response.json(
        { ok: false, error: resultsQ.error?.message || configQ.error?.message },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      results: resultsQ.data || [],
      questions:
        (questionsData || []).map((q: Record<string, unknown>, index: number) => ({
          id: q.id ?? q.question_id ?? `legacy-${index + 1}`,
          type: (q.type ?? q.test_type) === "trial" ? "trial" : "final",
          text: q.text ?? q.question_text ?? q.question ?? "",
          options: q.options ?? q.answers ?? q.variants ?? [],
          correct_index: q.correct_index ?? q.correct_answer_index ?? q.correct_option ?? q.correct_answer ?? 0,
          time_limit_sec: q.time_limit_sec ?? q.time_sec ?? q.time_limit ?? 20,
          order_index: q.order_index ?? q.sort_order ?? q.order ?? index + 1,
          is_active: q.is_active ?? q.active ?? q.enabled ?? true,
          created_at: q.created_at ?? q.created ?? null,
        })) || [],
      config: configQ.data || null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_tests_bootstrap_exception" },
      { status: 500 },
    );
  }
}
