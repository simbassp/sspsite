import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Устаревший маршрут — используйте POST /api/admin/results/reset-stats */
export async function POST() {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return Response.json(
    { ok: false, error: "use_admin_reset_stats_endpoint", scopeRequired: true },
    { status: 410 },
  );
}
