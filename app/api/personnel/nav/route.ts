import { resolvePersonnelAccess } from "@/lib/personnel-access";
import { getServerSession } from "@/lib/server-auth";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import { countUnreadNotifications, loadPersonnelModuleSettings, loadPersonnelUserBasics } from "@/lib/personnel-server";
import { canModeratePersonnel } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await loadPersonnelModuleSettings();
  let unitAssignment: UnitAssignment | null = session.unitAssignment ?? null;
  if (!unitAssignment) {
    const basic = await loadPersonnelUserBasics(session.id);
    unitAssignment = basic?.unitAssignment ?? null;
  }

  const access = resolvePersonnelAccess({ session, unitAssignment, settings });
  if (!access.canView) {
    return Response.json({
      ok: true,
      showPersonnel: false,
      isPreview: false,
      moduleEnabled: settings.moduleEnabled,
      canModerate: false,
      unreadNotifications: 0,
      unitAssignment: normalizeUnitAssignment(unitAssignment),
    });
  }

  const unread = await countUnreadNotifications(session.id);

  return Response.json({
    ok: true,
    showPersonnel: true,
    isPreview: access.isPreview,
    moduleEnabled: settings.moduleEnabled,
    canModerate: canModeratePersonnel(session) || session.role === "admin",
    unreadNotifications: unread,
    unitAssignment,
  });
}
