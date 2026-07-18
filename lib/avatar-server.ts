import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { normalizeAvatarStoragePath } from "@/lib/avatar-display";

export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const AVATAR_TARGET_MAX_BYTES = 80 * 1024;

export async function processAvatarImage(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("invalid_image");
  }

  let quality = 84;
  let output = await sharp(buffer)
    .rotate()
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover", position: "centre" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.length > AVATAR_TARGET_MAX_BYTES && quality > 56) {
    quality -= 6;
    output = await sharp(buffer)
      .rotate()
      .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  return output;
}

export async function saveUserAvatarFile(userId: string, buffer: Buffer) {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
  const absolutePath = path.join(uploadDir, fileName);
  await writeFile(absolutePath, buffer);
  return {
    storagePath: `uploads/avatars/${fileName}`,
    absolutePath,
  };
}

export async function deleteAvatarFile(stored: string | null | undefined) {
  const relative = normalizeAvatarStoragePath(stored);
  if (!relative) return;
  const absolutePath = path.join(process.cwd(), "public", ...relative.split("/"));
  try {
    await unlink(absolutePath);
  } catch {
    // ignore missing files
  }
}
