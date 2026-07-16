import { getPersonnelContext } from "@/lib/personnel-api-guard";
import { countUnreadNotifications } from "@/lib/personnel-server";
import { canModeratePersonnel } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const unread = await countUnreadNotifications(ctx.session.id);

  return Response.json({
    ok: true,
    showPersonnel: ctx.access.canView,
    isPreview: ctx.access.isPreview,
    moduleEnabled: ctx.settings.moduleEnabled,
    canModerate: canModeratePersonnel(ctx.session) || ctx.session.role === "admin",
    unreadNotifications: unread,
    unitAssignment: ctx.unitAssignment,
  });
}
