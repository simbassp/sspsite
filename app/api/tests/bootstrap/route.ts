import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { generateUavTtxQuestionBank } from "@/lib/uav-test-generator";

export const runtime = "nodejs";

type ConfigRow = {
  trial_question_count: number;
  final_question_count: number;
  time_per_question_sec: number | null;
  uav_auto_generation: boolean | null;
};

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const t0 = Date.now();
    const configQ = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .eq("id", 1)
      .maybeSingle();
    const t1 = Date.now();

    const orphanQ = await supabase.from("final_attempts").select("user_id").eq("user_id", session.id).maybeSingle();
    const t2 = Date.now();
    const profileHeavy = new URL(request.url).searchParams.get("profile") === "1";

    let t3 = t2;
    let t4 = t2;
    let t5 = t2;
    let t6 = t2;
    let t7 = t2;
    if (profileHeavy) {
      const questionsQ = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .limit(2000);
      t3 = Date.now();
      const uavQ = await supabase
        .from("catalog_items")
        .select("id,title,category,summary,image,specs,details")
        .eq("kind", "uav")
        .order("created_at", { ascending: false })
        .limit(200);
      t4 = Date.now();
      if (!questionsQ.error && !uavQ.error) {
        const cfgLocal = (configQ.data || {}) as Partial<ConfigRow>;
        if (Boolean(cfgLocal.uav_auto_generation ?? true)) {
          generateUavTtxQuestionBank((uavQ.data || []) as never[], Number(cfgLocal.time_per_question_sec ?? 10));
        }
      }
      t5 = Date.now();
      await supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20);
      t6 = Date.now();
      await supabase.from("final_attempts").select("user_id").eq("user_id", session.id).maybeSingle();
      t7 = Date.now();
    }

    if (configQ.error) {
      return Response.json(
        {
          ok: false,
          error: configQ.error?.message || "bootstrap_failed",
        },
        { status: 500 },
      );
    }

    const cfg = (configQ.data || {}) as Partial<ConfigRow>;

    return Response.json({
      ok: true,
      config: {
        trialQuestionCount: Number(cfg.trial_question_count ?? 10),
        finalQuestionCount: Number(cfg.final_question_count ?? 15),
        timePerQuestionSec: Number(cfg.time_per_question_sec ?? 10),
        uavAutoGeneration: Boolean(cfg.uav_auto_generation ?? true),
      },
      hasOrphanAttempt: Boolean(orphanQ.data?.user_id),
      timingsMs: {
        testSettings: t1 - t0,
        orphanAttempt: t2 - t1,
        manualQuestions: profileHeavy ? t3 - t2 : 0,
        uavCards: profileHeavy ? t4 - t3 : 0,
        generation: profileHeavy ? t5 - t4 : 0,
        history: profileHeavy ? t6 - t5 : 0,
        finalStatus: profileHeavy ? t7 - t6 : 0,
        profileMode: profileHeavy,
        total: t2 - t0,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "bootstrap_exception" },
      { status: 500 },
    );
  }
}
