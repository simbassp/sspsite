import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { canManageUav } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const maxUploadBytes = 8 * 1024 * 1024;

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

    const bytes = Buffer.from(await uploaded.arrayBuffer());

    let jpeg: Buffer;
    try {
      jpeg = await sharp(bytes)
        .rotate()
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Не удалось обработать файл. Сохраните фото как JPEG или PNG и загрузите снова (iPhone: «Совместимый формат» в настройках камеры).",
        },
        { status: 400 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "uav");
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${randomUUID()}.jpg`;
    await writeFile(path.join(uploadDir, fileName), jpeg);

    return Response.json({
      ok: true,
      url: `/uploads/uav/${fileName}`,
    });
  } catch {
    return Response.json({ ok: false, error: "Не удалось загрузить изображение." }, { status: 500 });
  }
}
