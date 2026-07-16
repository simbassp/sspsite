import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import {
  deletePersonnelRecord,
  type PersonnelManageEntity,
  createPersonnelRecord,
  updatePersonnelRecord,
} from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: "delete" | "update" | "create";
    entity?: PersonnelManageEntity;
    userId?: string;
    id?: string;
    examType?: string;
    data?: Record<string, unknown>;
  };

  const { action, entity, userId, id, examType, data } = body;
  if (!action || !entity || !userId) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const view = await resolvePersonnelProfileViewAccess(session, userId);
  if (!view.canModerate) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result =
    action === "delete"
      ? await deletePersonnelRecord({ userId, entity, id, examType })
      : action === "create"
        ? await createPersonnelRecord({ userId, entity, data: data ?? {} })
        : await updatePersonnelRecord({ userId, entity, id, examType, data: data ?? {} });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
