import { canManageUsers, canModeratePersonnel } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeRotaPlatoon, normalizeRotaSection } from "@/lib/rota-unit";

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

  const raw = (body ?? {}) as { rotaPlatoon?: unknown; rotaSection?: unknown };
  const rotaPlatoon = normalizeRotaPlatoon(raw.rotaPlatoon);
  const rotaSection = normalizeRotaSection(raw.rotaSection);

  if (raw.rotaPlatoon !== undefined && raw.rotaPlatoon !== null && raw.rotaPlatoon !== "" && rotaPlatoon === null) {
    return Response.json({ ok: false, error: "invalid_rota_platoon" }, { status: 400 });
  }
  if (raw.rotaSection !== undefined && raw.rotaSection !== null && raw.rotaSection !== "" && rotaSection === null) {
    return Response.json({ ok: false, error: "invalid_rota_section" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const userRes = await supabase.from("app_users").select("unit_assignment").eq("id", userId).maybeSingle();
    if (userRes.error) {
      return Response.json({ ok: false, error: userRes.error.message }, { status: 500 });
    }
    if (!userRes.data) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (userRes.data.unit_assignment !== "company_4") {
      return Response.json({ ok: false, error: "rota_only_for_company_4" }, { status: 400 });
    }

    const upd = await supabase
      .from("app_users")
      .update({
        rota_platoon: rotaPlatoon,
        rota_section: rotaSection,
      })
      .eq("id", userId)
      .select("rota_platoon,rota_section")
      .maybeSingle();

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "Колонки rota_platoon/rota_section отсутствуют. Примените миграции Supabase." },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      rotaPlatoon: upd.data?.rota_platoon != null ? Number(upd.data.rota_platoon) : null,
      rotaSection: upd.data?.rota_section != null ? Number(upd.data.rota_section) : null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "rota_unit_patch_exception" },
      { status: 500 },
    );
  }
}
