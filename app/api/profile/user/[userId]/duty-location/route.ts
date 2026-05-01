import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

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
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  if (userId === session.id) {
    return Response.json({ ok: false, error: "use_own_profile" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = typeof body === "object" && body !== null ? (body as { dutyLocation?: unknown }).dutyLocation : undefined;
  const loc = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (loc !== "base" && loc !== "deployment") {
    return Response.json({ ok: false, error: "invalid_duty_location" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const upd = await supabase
      .from("app_users")
      .update({ duty_location: loc })
      .eq("id", userId)
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

    return Response.json({ ok: true, dutyLocation: loc });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "duty_location_patch_exception" },
      { status: 500 },
    );
  }
}
