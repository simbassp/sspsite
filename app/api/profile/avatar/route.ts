import { unlink } from "node:fs/promises";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  deleteAvatarFile,
  processAvatarImage,
  saveUserAvatarFile,
} from "@/lib/avatar-server";
import { normalizeAvatarStoragePath } from "@/lib/avatar-display";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumn(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return Response.json({ ok: false, error: "Файл не передан." }, { status: 400 });
    }
    if (!uploaded.type.startsWith("image/")) {
      return Response.json({ ok: false, error: "Можно загружать только изображения." }, { status: 400 });
    }
    if (uploaded.size <= 0) {
      return Response.json({ ok: false, error: "Пустой файл." }, { status: 400 });
    }
    if (uploaded.size > AVATAR_MAX_UPLOAD_BYTES) {
      return Response.json({ ok: false, error: "Файл слишком большой (максимум 4 МБ)." }, { status: 400 });
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    let processed: Buffer;
    try {
      processed = await processAvatarImage(bytes);
    } catch {
      return Response.json(
        {
          ok: false,
          error: "Не удалось обработать фото. Выберите JPEG или PNG и попробуйте снова.",
        },
        { status: 400 },
      );
    }

    const supabase = getServerSupabaseServiceClient();
    const current = await supabase.from("app_users").select("avatar_url").eq("id", session.id).maybeSingle();
    if (current.error && !isMissingColumn(current.error.message)) {
      return Response.json({ ok: false, error: current.error.message || "avatar_lookup_failed" }, { status: 500 });
    }
    if (current.error && isMissingColumn(current.error.message)) {
      return Response.json(
        {
          ok: false,
          error: "Колонка avatar_url ещё не создана в базе. Примените миграцию Supabase.",
        },
        { status: 500 },
      );
    }

    const previousPath =
      current.data && typeof current.data === "object"
        ? normalizeAvatarStoragePath((current.data as { avatar_url?: unknown }).avatar_url as string | null)
        : null;

    const saved = await saveUserAvatarFile(session.id, processed);
    const update = await supabase
      .from("app_users")
      .update({ avatar_url: saved.storagePath })
      .eq("id", session.id)
      .select("avatar_url")
      .maybeSingle();

    if (update.error) {
      await unlink(saved.absolutePath).catch(() => undefined);
      return Response.json({ ok: false, error: update.error.message || "avatar_save_failed" }, { status: 500 });
    }

    if (previousPath && previousPath !== saved.storagePath) {
      await deleteAvatarFile(previousPath);
    }

    const avatarUrl =
      update.data && typeof update.data === "object" && typeof (update.data as { avatar_url?: unknown }).avatar_url === "string"
        ? String((update.data as { avatar_url: string }).avatar_url)
        : saved.storagePath;

    return Response.json({ ok: true, avatarUrl });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "avatar_upload_exception" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const current = await supabase.from("app_users").select("avatar_url").eq("id", session.id).maybeSingle();
    if (current.error && !isMissingColumn(current.error.message)) {
      return Response.json({ ok: false, error: current.error.message || "avatar_lookup_failed" }, { status: 500 });
    }

    const previousPath =
      current.data && typeof current.data === "object"
        ? normalizeAvatarStoragePath((current.data as { avatar_url?: unknown }).avatar_url as string | null)
        : null;

    const update = await supabase.from("app_users").update({ avatar_url: null }).eq("id", session.id);
    if (update.error && !isMissingColumn(update.error.message)) {
      return Response.json({ ok: false, error: update.error.message || "avatar_delete_failed" }, { status: 500 });
    }

    if (previousPath) {
      await deleteAvatarFile(previousPath);
    }

    return Response.json({ ok: true, avatarUrl: null });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "avatar_delete_exception" },
      { status: 500 },
    );
  }
}
