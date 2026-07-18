import { canInspectOtherUserProfile, canModeratePersonnel } from "@/lib/permissions";
import { resolvePersonnelAccess } from "@/lib/personnel-access";
import { loadPersonnelModuleSettings, loadPersonnelUserBasics } from "@/lib/personnel-server";
import type { SessionUser } from "@/lib/types";

export type PersonnelProfileViewAccess = {
  show: boolean;
  isPreview: boolean;
  canEditOwn: boolean;
  canModerate: boolean;
};

export async function resolvePersonnelProfileViewAccess(
  session: SessionUser,
  targetUserId: string,
): Promise<PersonnelProfileViewAccess> {
  const target = await loadPersonnelUserBasics(targetUserId);
  if (!target || target.unitAssignment !== "company_4") {
    return { show: false, isPreview: false, canEditOwn: false, canModerate: false };
  }

  const settings = await loadPersonnelModuleSettings();
  let viewerUnit = session.unitAssignment ?? null;
  if (!viewerUnit) {
    const viewer = await loadPersonnelUserBasics(session.id);
    viewerUnit = viewer?.unitAssignment ?? null;
  }

  const access = resolvePersonnelAccess({ session, unitAssignment: viewerUnit, settings });
  const isAdminOrMod = session.role === "admin" || canModeratePersonnel(session);
  const canInspectOthers = canInspectOtherUserProfile(session);

  if (isAdminOrMod) {
    return {
      show: true,
      isPreview: !settings.moduleEnabled,
      canEditOwn: session.id === targetUserId,
      canModerate: true,
    };
  }

  if (canInspectOthers) {
    return {
      show: true,
      isPreview: !settings.moduleEnabled,
      canEditOwn: session.id === targetUserId,
      canModerate: false,
    };
  }

  if (!settings.moduleEnabled) {
    return { show: false, isPreview: false, canEditOwn: false, canModerate: false };
  }

  if (session.id === targetUserId && access.isCompany4) {
    return { show: true, isPreview: false, canEditOwn: true, canModerate: false };
  }

  if (access.isCompany4 && viewerUnit === "company_4") {
    return { show: true, isPreview: false, canEditOwn: false, canModerate: false };
  }

  return { show: false, isPreview: false, canEditOwn: false, canModerate: false };
}
