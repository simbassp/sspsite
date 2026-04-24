import { Position, SessionUser } from "@/lib/types";

const contentEditorPositions: Position[] = ["Ведущий специалист", "Главный специалист", "Командир взвода"];

type SessionLike = Pick<SessionUser, "role" | "position"> | null | undefined;
type SessionWithContentFlag = Pick<SessionUser, "role" | "position" | "canManageContent"> | null | undefined;

export function canManageUsers(session: SessionLike) {
  return session?.role === "admin";
}

export function canManageContent(session: SessionWithContentFlag) {
  return Boolean(
    session &&
      (session.role === "admin" || session.canManageContent === true || contentEditorPositions.includes(session.position)),
  );
}

export function isContentEditorPosition(position: Position) {
  return contentEditorPositions.includes(position);
}
