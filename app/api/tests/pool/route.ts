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

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const t0 = Date.now();
    const [questionsQ, uavQ] = await Promise.all([
      supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .limit(2000),
      supabase
        .from("catalog_items")
        .select("id,title,category,summary,image,specs,details")
        .eq("kind", "uav")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const t1 = Date.now();

    if (questionsQ.error || uavQ.error) {
      return Response.json(
        { ok: false, error: questionsQ.error?.message || uavQ.error?.message || "tests_pool_failed" },
        { status: 500 },
      );
    }

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

    return Response.json({
      ok: true,
      questionPool: mappedQuestions,
      uavItems: uavQ.data || [],
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
