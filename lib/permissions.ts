import { SessionUser, UserPermissions } from "@/lib/types";

type SessionLike = Pick<SessionUser, "role" | "canManageContent" | "permissions"> | null | undefined;

const emptyPermissions: UserPermissions = {
  news: false,
  tests: false,
  results: false,
  uav: false,
  counteraction: false,
  users: false,
  online: false,
};

function allPermissions(): UserPermissions {
  return {
    news: true,
    tests: true,
    results: true,
    uav: true,
    counteraction: true,
    users: true,
    online: true,
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
    };
  }
  return next;
}

export function canManageUsers(session: SessionLike) {
  const permissions = resolvePermissions(session);
  return permissions.users;
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

export function canManageUav(session: SessionLike) {
  return resolvePermissions(session).uav;
}

export function canManageCounteraction(session: SessionLike) {
  return resolvePermissions(session).counteraction;
}

export function canManageContent(session: SessionLike) {
  const permissions = resolvePermissions(session);
  return permissions.news || permissions.tests || permissions.uav || permissions.counteraction;
}

export function canViewOnline(session: SessionLike) {
  return resolvePermissions(session).online;
}

export function canAccessAdminPanel(session: SessionLike) {
  return canManageContent(session) || canManageUsers(session) || canManageResults(session);
}
