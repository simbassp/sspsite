import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { deleteTestResultAttempt } from "@/lib/test-results-reset-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { resultId?: string };
  try {
    body = (await req.json()) as { resultId?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const resultId = String(body.resultId || "").trim();
  if (!resultId) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    await deleteTestResultAttempt(supabase, resultId);
    return Response.json({ ok: true, resultId });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "delete_attempt_exception" },
      { status: 500 },
    );
  }
}
