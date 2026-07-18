import { canManageUsers, canModeratePersonnel } from "@/lib/permissions";
import { saveProfileLicenseCategories } from "@/lib/profile-personnel-meta";
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

  const raw = (body ?? {}) as { categories?: unknown; userId?: unknown };
  const targetUserId = typeof raw.userId === "string" && looksLikeUuid(raw.userId) ? raw.userId : session.id;

  if (!canEditProfilePersonnelMeta(session, targetUserId)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!Array.isArray(raw.categories)) {
    return Response.json({ ok: false, error: "invalid_categories" }, { status: 400 });
  }

  try {
    const result = await saveProfileLicenseCategories(targetUserId, raw.categories);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 500 });
    }
    return Response.json({ ok: true, licenseCategories: result.licenseCategories });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_licenses_patch_exception" },
      { status: 500 },
    );
  }
}
