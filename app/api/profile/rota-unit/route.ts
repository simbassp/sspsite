import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeRotaModule, normalizeRotaPlatoon, normalizeRotaSection } from "@/lib/rota-unit";

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

  const raw = (body ?? {}) as { rotaPlatoon?: unknown; rotaSection?: unknown; rotaModule?: unknown };
  const rotaPlatoon = normalizeRotaPlatoon(raw.rotaPlatoon);
  const rotaSection = normalizeRotaSection(raw.rotaSection);
  const rotaModule = normalizeRotaModule(raw.rotaModule);

  if (raw.rotaPlatoon !== undefined && raw.rotaPlatoon !== null && raw.rotaPlatoon !== "" && rotaPlatoon === null) {
    return Response.json({ ok: false, error: "invalid_rota_platoon" }, { status: 400 });
  }
  if (raw.rotaSection !== undefined && raw.rotaSection !== null && raw.rotaSection !== "" && rotaSection === null) {
    return Response.json({ ok: false, error: "invalid_rota_section" }, { status: 400 });
  }
  if (raw.rotaModule !== undefined && raw.rotaModule !== null && raw.rotaModule !== "" && rotaModule === null) {
    return Response.json({ ok: false, error: "invalid_rota_module" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const userRes = await supabase.from("app_users").select("unit_assignment").eq("id", session.id).maybeSingle();
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
        rota_module: rotaModule,
      })
      .eq("id", session.id)
      .select("rota_platoon,rota_section,rota_module")
      .maybeSingle();

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "Колонки rota_platoon/rota_section/rota_module отсутствуют. Примените миграции Supabase." },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      rotaPlatoon: upd.data?.rota_platoon != null ? Number(upd.data.rota_platoon) : null,
      rotaSection: upd.data?.rota_section != null ? Number(upd.data.rota_section) : null,
      rotaModule: upd.data?.rota_module != null ? Number(upd.data.rota_module) : null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "rota_unit_patch_exception" },
      { status: 500 },
    );
  }
}
