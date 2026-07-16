import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import { loadPersonnelProfile } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;
  const view = await resolvePersonnelProfileViewAccess(session, userId);
  if (!view.show) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const profile = await loadPersonnelProfile(userId);
  if (!profile) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    isPreview: view.isPreview,
    canEditOwn: view.canEditOwn,
    canModerate: view.canModerate,
    profile,
  });
}
