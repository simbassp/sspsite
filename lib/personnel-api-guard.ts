import { resolvePersonnelAccess } from "@/lib/personnel-access";
import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import { loadPersonnelModuleSettings, loadPersonnelUserBasics } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import type { SessionUser, UnitAssignment } from "@/lib/types";

export async function getPersonnelContext() {
  const session = await getServerSession();
  if (!session) return { ok: false as const, status: 401, error: "unauthorized" };

  const settings = await loadPersonnelModuleSettings();
  let unitAssignment: UnitAssignment | null = session.unitAssignment ?? null;
  if (!unitAssignment) {
    const basic = await loadPersonnelUserBasics(session.id);
    unitAssignment = basic?.unitAssignment ?? null;
  }

  const access = resolvePersonnelAccess({ session, unitAssignment, settings });
  if (!access.canView) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  return {
    ok: true as const,
    session,
    settings,
    access,
    unitAssignment,
  };
}

export async function canViewPersonnelUser(session: SessionUser, targetUserId: string) {
  const view = await resolvePersonnelProfileViewAccess(session, targetUserId);
  return view.show;
}

export function normalizeSessionUnit(raw: unknown): UnitAssignment | null {
  return normalizeUnitAssignment(raw);
}
