import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";

/** Пользователь онлайн только при is_online и свежем last_seen. */
export function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown, nowMs = Date.now()): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= ONLINE_LAST_SEEN_MAX_MS;
}

export function onlineStaleBeforeIso(nowMs = Date.now()) {
  return new Date(nowMs - ONLINE_LAST_SEEN_MAX_MS).toISOString();
}
