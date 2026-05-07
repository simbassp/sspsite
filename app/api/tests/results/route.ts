import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type ResultMeta = {
  questionsTotal?: number;
  questionsCorrect?: number;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
};

type ResultsRequestBody = {
  kind?: "trial" | "final" | "force-fail-final";
  score?: number;
  passed?: boolean;
  meta?: ResultMeta;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("column") && m.includes("could not find") && m.includes("schema cache"))
  );
}

function extractMissingColumn(message: string | undefined): string | null {
  const m = message || "";
  const schemaCacheMatch = m.match(/Could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const sqlMatch = m.match(/column ["`]?([^"'`\s]+)["`]? does not exist/i);
  if (sqlMatch?.[1]) return sqlMatch[1];
  return null;
}

function deleteKeyInsensitive(payload: Record<string, unknown>, key: string): boolean {
  const exact = Object.keys(payload).find((k) => k.toLowerCase() === key.toLowerCase());
  if (!exact) return false;
  delete payload[exact];
  return true;
}

async function insertTestResultCompat(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  payload: {
    user_id: string;
    type: "trial" | "final";
    status: "passed" | "failed";
    score: number;
    started_at?: string;
    finished_at?: string;
    duration_seconds?: number;
    is_completed?: boolean;
    questions_total?: number;
    questions_correct?: number;
  },
) {
  const base: Record<string, unknown> = {
    user_id: payload.user_id,
    type: payload.type,
    status: payload.status,
    score: payload.score,
  };
  if (payload.started_at) base.started_at = payload.started_at;
  if (payload.finished_at) base.finished_at = payload.finished_at;
  if (payload.duration_seconds != null) base.duration_seconds = payload.duration_seconds;
  if (payload.is_completed != null) base.is_completed = payload.is_completed;
  if (payload.questions_total != null) base.questions_total = payload.questions_total;
  if (payload.questions_correct != null) base.questions_correct = payload.questions_correct;

  let primary = await supabase.from("test_results").insert(base);
  for (let i = 0; i < 10; i += 1) {
    if (!primary.error || !isMissingColumnError(primary.error.message)) break;
    const missing = extractMissingColumn(primary.error.message);
    if (!missing) break;
    if (!deleteKeyInsensitive(base, missing)) break;
    primary = await supabase.from("test_results").insert(base);
  }
  if (!primary.error) return { error: null as string | null };
  if (!isMissingColumnError(primary.error.message)) return { error: primary.error.message };

  const legacy = await supabase.from("test_results").insert({
    user_id: payload.user_id,
    test_type: payload.type,
    status: payload.status,
    score: payload.score,
  });
  if (!legacy.error) return { error: null as string | null };
  return { error: legacy.error.message };
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as ResultsRequestBody;
  const kind = body.kind || "trial";
  const supabase = getServerSupabaseServiceClient();

  if (kind === "force-fail-final") {
    const existing = await supabase.from("final_attempts").select("user_id").eq("user_id", session.id).maybeSingle();
    if (!existing.data) return Response.json({ ok: true, skipped: true });

    const cfgQ = await supabase.from("test_settings").select("final_question_count").eq("id", 1).maybeSingle();
    const questionsTotal = Math.max(
      1,
      Number(((cfgQ.data || null) as { final_question_count?: number } | null)?.final_question_count ?? 15),
    );

    const inserted = await insertTestResultCompat(supabase, {
      user_id: session.id,
      type: "final",
      status: "failed",
      score: 0,
      questions_total: questionsTotal,
      questions_correct: 0,
    });
    if (inserted.error) {
      return Response.json({ ok: false, error: inserted.error }, { status: 500 });
    }

    await supabase.from("final_attempts").delete().eq("user_id", session.id);
    return Response.json({ ok: true });
  }

  if (kind === "final") {
    const score = Number(body.score ?? 0);
    const passed = body.passed === true;
    const meta = (body.meta || {}) as ResultMeta;
    const inserted = await insertTestResultCompat(supabase, {
      user_id: session.id,
      type: "final",
      status: passed ? "passed" : "failed",
      score,
      started_at: meta.startedAt,
      finished_at: meta.finishedAt,
      duration_seconds: meta.durationSeconds,
      is_completed: true,
      questions_total: meta.questionsTotal,
      questions_correct: meta.questionsCorrect,
    });
    if (inserted.error) {
      return Response.json({ ok: false, error: inserted.error }, { status: 500 });
    }
    await supabase.from("final_attempts").delete().eq("user_id", session.id);
    return Response.json({ ok: true });
  }

  const score = Number(body.score ?? 0);
  const meta = (body.meta || {}) as ResultMeta;
  const inserted = await insertTestResultCompat(supabase, {
    user_id: session.id,
    type: "trial",
    status: score >= 60 ? "passed" : "failed",
    score,
    started_at: meta.startedAt,
    finished_at: meta.finishedAt,
    duration_seconds: meta.durationSeconds,
    is_completed: true,
    questions_total: meta.questionsTotal,
    questions_correct: meta.questionsCorrect,
  });
  if (inserted.error) {
    return Response.json({ ok: false, error: inserted.error }, { status: 500 });
  }
  return Response.json({ ok: true });
}
