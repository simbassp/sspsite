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
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const t0 = Date.now();
    const uavQ = supabase
      .from("catalog_items")
      .select("id,title,category,summary,image,specs,details")
      .eq("kind", "uav")
      .order("created_at", { ascending: false })
      .limit(200);

    const questionsPrimaryQ = await supabase
      .from("test_questions")
      .select("id,type,text,options,correct_index,time_limit_sec,order_index,is_active,created_at")
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .limit(2000);
    let questionsData: unknown[] = (questionsPrimaryQ.data as unknown[]) || [];
    let questionsError: string | null = questionsPrimaryQ.error?.message || null;
    if (questionsPrimaryQ.error && isMissingColumnError(questionsPrimaryQ.error.message)) {
      const questionsLegacyQ = await supabase
        .from("test_questions")
        .select("id,type,text,options,correct_index,order_index,active,created_at")
        .eq("active", true)
        .order("order_index", { ascending: true })
        .limit(2000);
      questionsData = (questionsLegacyQ.data as unknown[]) || [];
      questionsError = questionsLegacyQ.error?.message || null;
    }
    const uavRes = await uavQ;
    const t1 = Date.now();

    if (questionsError || uavRes.error) {
      return Response.json(
        { ok: false, error: questionsError || uavRes.error?.message || "tests_pool_failed" },
        { status: 500 },
      );
    }

    const mappedQuestions = (questionsData as QuestionRow[]).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options,
      correctIndex: q.correct_index,
      timeLimitSec: Number(q.time_limit_sec ?? 10),
      order: q.order_index,
      isActive: Boolean(q.is_active ?? q.active ?? true),
      createdAt: q.created_at,
    }));

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
