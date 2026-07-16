import { canViewPersonnelUser, getPersonnelContext } from "@/lib/personnel-api-guard";
import { loadPersonnelProfile } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ userId: string }> }) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const { userId } = await context.params;
  const allowed = await canViewPersonnelUser(ctx.session, userId);
  if (!allowed) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const profile = await loadPersonnelProfile(userId);
  if (!profile) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    isPreview: ctx.access.isPreview,
    canEditOwn: ctx.access.canEditOwn && ctx.session.id === userId,
    canModerate: ctx.access.canModerate,
    profile,
  });
}
