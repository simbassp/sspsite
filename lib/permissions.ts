import { SessionUser, UserPermissions } from "@/lib/types";

type SessionLike = Pick<SessionUser, "role" | "canManageContent" | "permissions"> | null | undefined;

const emptyPermissions: UserPermissions = {
  news: false,
  tests: false,
  results: false,
  resetResults: false,
  uav: false,
  counteraction: false,
  tacticalMedicine: false,
  userList: false,
  users: false,
  online: false,
  personnelModeration: false,
};

function allPermissions(): UserPermissions {
  return {
    news: true,
    tests: true,
    results: true,
    resetResults: true,
    uav: true,
    counteraction: true,
    tacticalMedicine: true,
    userList: true,
    users: true,
    online: true,
    personnelModeration: true,
  };
}

export function resolvePermissions(session: SessionLike): UserPermissions {
  if (!session) return emptyPermissions;
  if (session.role === "admin") return allPermissions();
  const next = { ...emptyPermissions, ...(session.permissions ?? {}) };
  const hasGranularPermissions = Boolean(session.permissions);
  if (!hasGranularPermissions && session.canManageContent) {
    return {
      ...next,
      news: true,
      tests: true,
      results: true,
      uav: true,
      counteraction: true,
      tacticalMedicine: true,
    };
  }
  return next;
}

export function canManageUsers(session: SessionLike) {
  const permissions = resolvePermissions(session);
  return permissions.users;
}

/** Список пользователей и просмотр чужих профилей (в т.ч. только просмотр). Полное управление — через canManageUsers. */
export function canViewUserList(session: SessionLike) {
  const p = resolvePermissions(session);
  return p.userList || p.users;
}

/** Просмотр чужого профиля (read-only): из списка пользователей, результатов, кадров. */
export function canInspectOtherUserProfile(session: SessionLike) {
  return (
    canManageUsers(session) ||
    canViewUserList(session) ||
    canModeratePersonnel(session) ||
    canManageResults(session) ||
    canResetTestResults(session)
  );
}

export function canManageNews(session: SessionLike) {
  return resolvePermissions(session).news;
}

export function canManageTests(session: SessionLike) {
  return resolvePermissions(session).tests;
}

export function canManageResults(session: SessionLike) {
  return resolvePermissions(session).results;
}

/** Сброс попыток итогового теста (окно final_test_counting_from). */
export function canResetTestResults(session: SessionLike) {
  return resolvePermissions(session).resetResults;
}

export function canManageUav(session: SessionLike) {
  return resolvePermissions(session).uav;
}

export function canManageCounteraction(session: SessionLike) {
  return resolvePermissions(session).counteraction;
}

export function canManageTacticalMedicine(session: SessionLike) {
  return resolvePermissions(session).tacticalMedicine;
}

export function canManageContent(session: SessionLike) {
  const permissions = resolvePermissions(session);
  return (
    permissions.news ||
    permissions.tests ||
    permissions.uav ||
    permissions.counteraction ||
    permissions.tacticalMedicine
  );
}

export function canModeratePersonnel(session: SessionLike) {
  return resolvePermissions(session).personnelModeration;
}

export function canAccessAdminPanel(session: SessionLike) {
  const p = resolvePermissions(session);
  return (
    canManageContent(session) ||
    canManageUsers(session) ||
    p.userList ||
    canManageResults(session) ||
    canResetTestResults(session) ||
    p.personnelModeration
  );
}
