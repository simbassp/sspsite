import { canManageUsers, canModeratePersonnel } from "@/lib/permissions";
import { saveProfileBloodGroup } from "@/lib/profile-personnel-meta";
import type { SessionUser } from "@/lib/types";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function canEditProfilePersonnelMeta(session: SessionUser, targetUserId: string) {
  if (session.id === targetUserId) return true;
  return canManageUsers(session) || canModeratePersonnel(session);
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (body ?? {}) as { bloodGroup?: unknown; userId?: unknown };
  const targetUserId = typeof raw.userId === "string" && looksLikeUuid(raw.userId) ? raw.userId : session.id;

  if (!canEditProfilePersonnelMeta(session, targetUserId)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (raw.bloodGroup !== null && raw.bloodGroup !== undefined && raw.bloodGroup !== "" && typeof raw.bloodGroup !== "string") {
    return Response.json({ ok: false, error: "invalid_blood_group" }, { status: 400 });
  }

  try {
    const result = await saveProfileBloodGroup(targetUserId, raw.bloodGroup ?? null);
    if (!result.ok) {
      const status = result.error.includes("миграции") ? 503 : result.error === "company_4_only" ? 400 : 500;
      return Response.json({ ok: false, error: result.error }, { status });
    }
    return Response.json({ ok: true, bloodGroup: result.bloodGroup });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_blood_group_patch_exception" },
      { status: 500 },
    );
  }
}
