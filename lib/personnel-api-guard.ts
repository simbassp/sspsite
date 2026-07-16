import { canModeratePersonnel } from "@/lib/permissions";
import { resolvePersonnelAccess } from "@/lib/personnel-access";
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
  const ctx = await getPersonnelContext();
  if (!ctx.ok) return false;
  if (ctx.session.role === "admin" || canModeratePersonnel(ctx.session)) return true;
  if (ctx.session.id === targetUserId && ctx.access.isCompany4) return true;
  const target = await loadPersonnelUserBasics(targetUserId);
  return target?.unitAssignment === "company_4";
}

export function normalizeSessionUnit(raw: unknown): UnitAssignment | null {
  return normalizeUnitAssignment(raw);
}
