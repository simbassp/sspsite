import type { DutyLocation } from "@/lib/types";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

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
    typeof body === "object" && body !== null ? (body as { dutyLocation?: unknown }).dutyLocation : undefined;
  const loc = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (loc !== "base" && loc !== "deployment") {
    return Response.json({ ok: false, error: "invalid_duty_location" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const upd = await supabase
      .from("app_users")
      .update({ duty_location: loc })
      .eq("id", session.id)
      .select("id")
      .maybeSingle();

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "Колонка duty_location отсутствует. Примените миграции Supabase." },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    if (!upd.data) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, dutyLocation: loc as DutyLocation });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "duty_location_patch_exception" },
      { status: 500 },
    );
  }
}
