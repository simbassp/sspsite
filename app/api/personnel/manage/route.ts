import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import {
  deletePersonnelRecord,
  type PersonnelManageEntity,
  createPersonnelRecord,
  updatePersonnelRecord,
} from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const REMOVED_ENTITIES = new Set(["deployment", "premium", "medal", "exam"]);

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: "delete" | "update" | "create";
    entity?: PersonnelManageEntity | string;
    userId?: string;
    id?: string;
    examType?: string;
    data?: Record<string, unknown>;
  };

  const { action, entity, userId, data } = body;
  if (!action || !entity || !userId) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (REMOVED_ENTITIES.has(entity)) {
    return Response.json({ ok: false, error: "feature_removed" }, { status: 410 });
  }

  const view = await resolvePersonnelProfileViewAccess(session, userId);
  if (!view.canModerate) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (entity !== "licenses") {
    return Response.json({ ok: false, error: "invalid_entity" }, { status: 400 });
  }

  const result =
    action === "delete"
      ? await deletePersonnelRecord({ userId, entity: "licenses" })
      : action === "create"
        ? await createPersonnelRecord({ userId, entity: "licenses", data: data ?? {} })
        : await updatePersonnelRecord({ userId, entity: "licenses", data: data ?? {} });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
