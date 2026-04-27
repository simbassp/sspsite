import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const [resultsQ, questionsQ] = await Promise.all([
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

    let configQ = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .eq("id", 1)
      .maybeSingle();
    if (!configQ.error && !configQ.data) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .order("updated_at", { ascending: false })
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

    if (resultsQ.error || questionsQ.error || configQ.error) {
      return Response.json(
        { ok: false, error: resultsQ.error?.message || questionsQ.error?.message || configQ.error?.message },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      results: resultsQ.data || [],
      questions: questionsQ.data || [],
      config: configQ.data || null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_tests_bootstrap_exception" },
      { status: 500 },
    );
  }
}
