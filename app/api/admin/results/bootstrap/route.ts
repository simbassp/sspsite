import { loadResultsBootstrapContext, loadResultsBootstrapFast } from "@/lib/admin-results-bootstrap-server";
import { canManageResults, canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageResults(session) && !canResetTestResults(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const viewerIsAdmin = session.role === "admin";
  const viewerCanResetAttempts = canResetTestResults(session);

  try {
    const ctx = await loadResultsBootstrapContext(url, { viewerCanResetAttempts, viewerIsAdmin });
    const data = await loadResultsBootstrapFast(ctx);
    return Response.json({
      ok: true,
      viewerIsAdmin,
      viewerCanResetAttempts,
      period: ctx.period,
      ...data,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_results_exception" },
      { status: 500 },
    );
  }
}
