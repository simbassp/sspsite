import { syncUserAchievementsByUserId } from "@/lib/achievements-server";
import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { resetTestResultsForUser } from "@/lib/test-results-reset-server";
import type { TestResultsResetScope } from "@/lib/types";

export const runtime = "nodejs";

const SCOPES = new Set<TestResultsResetScope>(["trial", "final", "all"]);

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { targetUserId?: string; scope?: string };
  try {
    body = (await req.json()) as { targetUserId?: string; scope?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const targetUserId = String(body.targetUserId || session.id).trim();
  const scope = String(body.scope || "").trim() as TestResultsResetScope;
  if (!targetUserId || !SCOPES.has(scope)) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    await resetTestResultsForUser(supabase, targetUserId, scope, session.id);
    void syncUserAchievementsByUserId(targetUserId).catch(() => undefined);
    return Response.json({ ok: true, scope, targetUserId });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reset_test_stats_exception" },
      { status: 500 },
    );
  }
}
