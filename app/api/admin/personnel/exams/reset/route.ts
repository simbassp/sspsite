import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return Response.json({ ok: false, error: "feature_removed" }, { status: 410 });
}
