import type { SupabaseClient } from "@supabase/supabase-js";
import { onlineStaleBeforeIso } from "@/lib/presence-online";

const CLEANUP_MIN_INTERVAL_MS = 120_000;
let lastCleanupAt = 0;

/** Сбрасывает «зависших» онлайн — не чаще раза в 2 мин на процесс сервера. */
export function scheduleStaleOnlineCleanup(supabase: SupabaseClient) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) return;
  lastCleanupAt = now;

  const staleBefore = onlineStaleBeforeIso();
  void supabase
    .from("app_users")
    .update({ is_online: false })
    .eq("is_online", true)
    .or(`last_seen_at.is.null,last_seen_at.lt.${staleBefore}`)
    .then(() => undefined);
}
