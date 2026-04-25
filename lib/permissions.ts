import { SessionUser, UserPermissions } from "@/lib/types";

type SessionLike = Pick<SessionUser, "role" | "canManageContent" | "permissions"> | null | undefined;

const emptyPermissions: UserPermissions = {
  news: false,
  tests: false,
  uav: false,
  counteraction: false,
  users: false,
};

function allPermissions(): UserPermissions {
  return {
    news: true,
    tests: true,
    uav: true,
    counteraction: true,
    users: true,
  };
}

export function resolvePermissions(session: SessionLike): UserPermissions {
  if (!session) return emptyPermissions;
  if (session.role === "admin") return allPermissions();
  const next = session.permissions ?? emptyPermissions;
  if (session.canManageContent) {
    return {
      ...next,
      news: true,
      tests: true,
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

export function canAccessAdminPanel(session: SessionLike) {
  return canManageContent(session) || canManageUsers(session);
}
