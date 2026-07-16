import type { SessionUser, UnitAssignment } from "@/lib/types";
import { canModeratePersonnel, resolvePermissions } from "@/lib/permissions";

export type PersonnelModuleSettings = {
  moduleEnabled: boolean;
  moderationEnabled: boolean;
};

export type PersonnelAccess = {
  canView: boolean;
  canEditOwn: boolean;
  canModerate: boolean;
  isPreview: boolean;
  isCompany4: boolean;
};

export function isCompany4Unit(unit: UnitAssignment | null | undefined) {
  return unit === "company_4";
}

export function resolvePersonnelAccess(input: {
  session: SessionUser | null;
  unitAssignment: UnitAssignment | null | undefined;
  settings: PersonnelModuleSettings;
}): PersonnelAccess {
  const { session, unitAssignment, settings } = input;
  const isAdmin = session?.role === "admin";
  const isModerator = session ? canModeratePersonnel(session) : false;
  const isCompany4 = isCompany4Unit(unitAssignment);
  const moduleLive = settings.moduleEnabled;

  if (!session) {
    return { canView: false, canEditOwn: false, canModerate: false, isPreview: false, isCompany4 };
  }

  if (isAdmin || isModerator) {
    return {
      canView: true,
      canEditOwn: isCompany4 || isAdmin,
      canModerate: isModerator || isAdmin,
      isPreview: !moduleLive,
      isCompany4,
    };
  }

  if (moduleLive && isCompany4) {
    return {
      canView: true,
      canEditOwn: true,
      canModerate: false,
      isPreview: false,
      isCompany4: true,
    };
  }

  return { canView: false, canEditOwn: false, canModerate: false, isPreview: false, isCompany4 };
}

export function canAccessPersonnelNav(
  session: SessionUser | null,
  ownUnit: UnitAssignment | null | undefined,
  settings: PersonnelModuleSettings,
) {
  return resolvePersonnelAccess({ session, unitAssignment: ownUnit, settings }).canView;
}

export function personnelAdminGrantHint(session: SessionUser | null) {
  const p = resolvePermissions(session);
  return p.personnelModeration;
}
