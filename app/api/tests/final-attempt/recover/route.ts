import { recoverFinalAttempt } from "@/lib/final-attempt-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const result = await recoverFinalAttempt(supabase, session.id);
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "recovery_window_expired" || result.error === "recovery_already_used"
            ? 403
            : 400;
      return Response.json({ ok: false, error: result.error }, { status });
    }

    return Response.json({
      ok: true,
      attempt: result.attempt,
      replacedQuestion: result.replacedQuestion,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "recover_exception" },
      { status: 500 },
    );
  }
}
