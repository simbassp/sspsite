import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment, formatUnitAssignmentSaveError, type UnitAssignment } from "@/lib/unit-assignment";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
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

  const raw =
    typeof body === "object" && body !== null ? (body as { unitAssignment?: unknown }).unitAssignment : undefined;
  const unit: UnitAssignment | null =
    raw === null || raw === "" ? null : normalizeUnitAssignment(raw);
  if (raw !== null && raw !== "" && unit === null) {
    return Response.json({ ok: false, error: "invalid_unit_assignment" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const updatePayload: Record<string, unknown> = { unit_assignment: unit };
    if (unit !== "company_4") {
      updatePayload.rota_platoon = null;
      updatePayload.rota_section = null;
      updatePayload.rota_module = null;
    }
    const upd = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("id", session.id)
      .select("id")
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

    return Response.json({ ok: true, unitAssignment: unit });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unit_assignment_patch_exception" },
      { status: 500 },
    );
  }
}
