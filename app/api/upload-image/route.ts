import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canManageUav } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const maxUploadBytes = 8 * 1024 * 1024;
const allowedMimeToExt: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function getExtension(file: File) {
  const byMime = allowedMimeToExt[file.type.toLowerCase()];
  if (byMime) return byMime;
  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return file.name.slice(dotIndex).toLowerCase();
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!canManageUav(session)) {
    return Response.json({ ok: false, error: "Недостаточно прав." }, { status: 403 });
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
    if (uploaded.size > maxUploadBytes) {
      return Response.json({ ok: false, error: "Файл слишком большой (максимум 8 МБ)." }, { status: 400 });
    }

    const extension = getExtension(uploaded);
    if (!extension) {
      return Response.json({ ok: false, error: "Неподдерживаемый формат файла." }, { status: 400 });
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const uploadDir = path.join(process.cwd(), "public", "uploads", "uav");
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(path.join(uploadDir, fileName), bytes);

    return Response.json({
      ok: true,
      url: `/uploads/uav/${fileName}`,
    });
  } catch {
    return Response.json({ ok: false, error: "Не удалось загрузить изображение." }, { status: 500 });
  }
}
