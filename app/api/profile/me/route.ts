import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function formatProfileSaveError(message: string | undefined) {
  const raw = message || "";
  const low = raw.toLowerCase();
  if (low.includes("duplicate") || low.includes("unique constraint")) {
    return "Такой позывной уже занят. Укажите другой.";
  }
  return raw || "Не удалось сохранить профиль. Попробуйте позже.";
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

  const name = String(
    typeof body === "object" && body !== null ? (body as { name?: unknown }).name : "",
  ).trim();
  const callsign = String(
    typeof body === "object" && body !== null ? (body as { callsign?: unknown }).callsign : "",
  ).trim();

  if (name.length < 2) {
    return Response.json({ ok: false, error: "Имя должно содержать минимум 2 символа." }, { status: 400 });
  }
  if (callsign.length < 2) {
    return Response.json({ ok: false, error: "Позывной должен содержать минимум 2 символа." }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const upd = await supabase
      .from("app_users")
      .update({ name, callsign })
      .eq("id", session.id)
      .select("id")
      .maybeSingle();

    if (upd.error) {
      return Response.json({ ok: false, error: formatProfileSaveError(upd.error.message) }, { status: 500 });
    }

    if (!upd.data) {
      return Response.json(
        {
          ok: false,
          error:
            "Профиль не сохранён: запись пользователя не найдена. Выйдите из аккаунта и войдите снова; если не поможет — напишите администратору.",
        },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, name, callsign });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_me_patch_exception" },
      { status: 500 },
    );
  }
}
