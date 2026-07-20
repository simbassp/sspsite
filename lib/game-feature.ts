import type { SessionUser } from "@/lib/types";

/** Выключите false, чтобы полностью скрыть раздел «Игра» без удаления файлов. */
export const GAME_SECTION_ENABLED = false;

export function canAccessGameSection(session: Pick<SessionUser, "role"> | null | undefined) {
  if (!GAME_SECTION_ENABLED) return false;
  return session?.role === "admin";
}
