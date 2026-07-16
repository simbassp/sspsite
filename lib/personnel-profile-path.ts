import { canManageUsers, canModeratePersonnel, canViewUserList } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";

export function canUseFullPersonnelProfileInspect(session: SessionUser | null) {
  if (!session) return false;
  return canManageUsers(session) || canViewUserList(session) || canModeratePersonnel(session);
}

/** Куда вести ссылку на профиль из раздела «Сотрудники». */
export function resolvePersonnelProfilePath(session: SessionUser | null, targetUserId: string) {
  if (!session) return `/personnel/${targetUserId}`;
  if (session.id === targetUserId) return "/profile";
  if (canUseFullPersonnelProfileInspect(session)) return `/profile/${targetUserId}`;
  return `/personnel/${targetUserId}`;
}
