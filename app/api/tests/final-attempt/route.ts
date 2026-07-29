import { computeFinalTestSummary } from "@/lib/server-final-test-summary";
import { mapFinalAttemptRow, type FinalAttemptDbRow } from "@/lib/final-attempt-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

type FinalAttemptBody = {
  startedAt?: string;
  questionIndex?: number;
  answers?: Record<string, string>;
  questionIds?: string[];
  clearInterrupted?: boolean;
};

const FULL_SELECT =
  "user_id,started_at,question_index,answers,question_ids,recovery_used,interrupted_at,updated_at";
const LEGACY_SELECT = "user_id,started_at,question_index,answers";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const supabase = getServerSupabaseServiceClient();

  let res = await supabase.from("final_attempts").select(FULL_SELECT).eq("user_id", session.id).maybeSingle();
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await supabase.from("final_attempts").select(LEGACY_SELECT).eq("user_id", session.id).maybeSingle();
  }
  if (res.error) return Response.json({ ok: false, error: res.error.message }, { status: 500 });

  const row = res.data as FinalAttemptDbRow | null;
  return Response.json({
    ok: true,
    attempt: row ? mapFinalAttemptRow(row) : null,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as FinalAttemptBody;
  const supabase = getServerSupabaseServiceClient();
  const now = new Date().toISOString();

  const inProgress = await supabase.from("final_attempts").select("user_id").eq("user_id", session.id).maybeSingle();
  if (!inProgress.data) {
    const summary = await computeFinalTestSummary(supabase, session.id);
    if (!summary.canStartFinal) {
      return Response.json({ ok: false, error: "final_attempts_exhausted" }, { status: 403 });
    }
  }

  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String).filter(Boolean) : [];
  const payload: Record<string, unknown> = {
    user_id: session.id,
    started_at: String(body.startedAt || now),
    question_index: Math.max(0, Number(body.questionIndex ?? 0)),
    answers: body.answers && typeof body.answers === "object" ? body.answers : {},
    question_ids: questionIds,
    updated_at: now,
  };
  if (body.clearInterrupted !== false) {
    payload.interrupted_at = null;
  }

  let upsert = await supabase.from("final_attempts").upsert(payload, { onConflict: "user_id" }).select(FULL_SELECT).maybeSingle();
  if (upsert.error && isMissingColumnError(upsert.error.message)) {
    const legacyPayload = {
      user_id: session.id,
      started_at: String(body.startedAt || now),
      question_index: Math.max(0, Number(body.questionIndex ?? 0)),
      answers: body.answers && typeof body.answers === "object" ? body.answers : {},
    };
    upsert = await supabase
      .from("final_attempts")
      .upsert(legacyPayload, { onConflict: "user_id" })
      .select(LEGACY_SELECT)
      .maybeSingle();
  }
  if (upsert.error) return Response.json({ ok: false, error: upsert.error.message }, { status: 500 });

  const row = upsert.data as FinalAttemptDbRow;
  return Response.json({ ok: true, attempt: mapFinalAttemptRow(row) });
}

/** Пометить попытку как прерванную (закрытие вкладки / обновление). */
export async function PATCH() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const supabase = getServerSupabaseServiceClient();
  const now = new Date().toISOString();

  let upd = await supabase
    .from("final_attempts")
    .update({ interrupted_at: now, updated_at: now })
    .eq("user_id", session.id)
    .select("user_id")
    .maybeSingle();

  if (upd.error && isMissingColumnError(upd.error.message)) {
    return Response.json({ ok: true, legacy: true });
  }
  if (upd.error) return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
  if (!upd.data) return Response.json({ ok: true, skipped: true });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const supabase = getServerSupabaseServiceClient();
  const { error } = await supabase.from("final_attempts").delete().eq("user_id", session.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
