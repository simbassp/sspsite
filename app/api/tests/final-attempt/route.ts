import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type FinalAttemptBody = {
  startedAt?: string;
  questionIndex?: number;
  answers?: Record<string, string>;
};

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const supabase = getServerSupabaseServiceClient();
  const { data, error } = await supabase
    .from("final_attempts")
    .select("user_id,started_at,question_index,answers")
    .eq("user_id", session.id)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, attempt: data || null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as FinalAttemptBody;
  const supabase = getServerSupabaseServiceClient();
  const payload = {
    user_id: session.id,
    started_at: String(body.startedAt || new Date().toISOString()),
    question_index: Math.max(0, Number(body.questionIndex ?? 0)),
    answers: body.answers && typeof body.answers === "object" ? body.answers : {},
  };
  const { error } = await supabase.from("final_attempts").upsert(payload, { onConflict: "user_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, attempt: payload });
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const supabase = getServerSupabaseServiceClient();
  const { error } = await supabase.from("final_attempts").delete().eq("user_id", session.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
