import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type QuestionRow = {
  id: string;
  type: "trial" | "final";
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: number;
  order_index: number;
  is_active: boolean;
  created_at: string;
};

type ConfigRow = {
  trial_question_count: number;
  final_question_count: number;
  time_per_question_sec: number | null;
  uav_auto_generation: boolean | null;
};

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();

    const [configQ, questionsQ, uavQ, resultsQ, orphanQ] = await Promise.all([
      supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .eq("is_active", true)
        .order("order_index", { ascending: true }),
      supabase
        .from("catalog_items")
        .select("id,title,category,summary,image,specs,details")
        .eq("kind", "uav")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("final_attempts").select("user_id").eq("user_id", session.id).maybeSingle(),
    ]);

    if (configQ.error || questionsQ.error || uavQ.error || resultsQ.error) {
      return Response.json(
        {
          ok: false,
          error:
            configQ.error?.message ||
            questionsQ.error?.message ||
            uavQ.error?.message ||
            resultsQ.error?.message ||
            "bootstrap_failed",
        },
        { status: 500 },
      );
    }

    const cfg = (configQ.data || {}) as Partial<ConfigRow>;
    const mappedQuestions = ((questionsQ.data || []) as QuestionRow[]).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options,
      correctIndex: q.correct_index,
      timeLimitSec: q.time_limit_sec,
      order: q.order_index,
      isActive: q.is_active,
      createdAt: q.created_at,
    }));

    const mappedResults = ((resultsQ.data || []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      type: r.type === "final" ? "final" : "trial",
      status: r.status === "passed" ? "passed" : "failed",
      score: Number(r.score || 0),
      createdAt: String(r.created_at),
    }));

    return Response.json({
      ok: true,
      config: {
        trialQuestionCount: Number(cfg.trial_question_count ?? 10),
        finalQuestionCount: Number(cfg.final_question_count ?? 15),
        timePerQuestionSec: Number(cfg.time_per_question_sec ?? 10),
        uavAutoGeneration: Boolean(cfg.uav_auto_generation ?? true),
      },
      questionPool: mappedQuestions,
      uavItems: uavQ.data || [],
      results: mappedResults,
      hasOrphanAttempt: Boolean(orphanQ.data?.user_id),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "bootstrap_exception" },
      { status: 500 },
    );
  }
}
