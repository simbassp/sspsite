import { syncUserAchievementsByUserId } from "@/lib/achievements-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { isBankPassed } from "@/lib/test-pass-rules";

export const runtime = "nodejs";

type BankCompletionBody = {
  score?: number;
  meta?: {
    questionsTotal?: number;
    questionsCorrect?: number;
    durationSeconds?: number;
  };
};

function isMissingTableError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("does not exist") || (m.includes("could not find") && m.includes("schema cache"));
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: BankCompletionBody;
  try {
    body = (await request.json()) as BankCompletionBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const questionsTotal = Math.max(1, Number(body.meta?.questionsTotal ?? 0) || 1);
  const questionsCorrect = Math.max(0, Math.min(Number(body.meta?.questionsCorrect ?? 0), questionsTotal));
  const score = Math.max(0, Math.min(100, Number(body.score ?? 0)));
  const durationSeconds =
    body.meta?.durationSeconds != null && Number.isFinite(Number(body.meta.durationSeconds))
      ? Math.max(1, Math.round(Number(body.meta.durationSeconds)))
      : null;

  if (!isBankPassed(questionsCorrect, questionsTotal)) {
    return Response.json({ ok: false, error: "below_pass_threshold" }, { status: 422 });
  }

  const supabase = getServerSupabaseServiceClient();
  const insert = await supabase.from("bank_test_completions").insert({
    user_id: session.id,
    questions_total: questionsTotal,
    questions_correct: questionsCorrect,
    score,
    duration_seconds: durationSeconds,
  });

  if (insert.error) {
    if (isMissingTableError(insert.error.message)) {
      return Response.json({ ok: false, error: "migration_required_bank_completions" }, { status: 503 });
    }
    return Response.json({ ok: false, error: insert.error.message }, { status: 500 });
  }

  void syncUserAchievementsByUserId(session.id).catch(() => undefined);

  return Response.json({ ok: true });
}
