import { canManageUsers, canModeratePersonnel } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment, formatUnitAssignmentSaveError, type UnitAssignment } from "@/lib/unit-assignment";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || (!canManageUsers(session) && !canModeratePersonnel(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw =
    typeof body === "object" && body !== null ? (body as { unitAssignment?: unknown }).unitAssignment : undefined;
  const unit: UnitAssignment | null = raw === null || raw === "" ? null : normalizeUnitAssignment(raw);
  if (raw !== null && raw !== "" && unit === null) {
    return Response.json({ ok: false, error: "invalid_unit_assignment" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const updatePayload: Record<string, unknown> = { unit_assignment: unit };
    if (unit !== "company_4") {
      updatePayload.rota_platoon = null;
      updatePayload.rota_section = null;
    }

    const upd = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("id", userId)
      .select("id,unit_assignment")
      .maybeSingle();

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "Колонка unit_assignment отсутствует. Примените миграции Supabase." },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, error: formatUnitAssignmentSaveError(upd.error.message) }, { status: 500 });
    }

    if (!upd.data) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      unitAssignment: normalizeUnitAssignment(upd.data.unit_assignment),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unit_assignment_patch_exception" },
      { status: 500 },
    );
  }
}
