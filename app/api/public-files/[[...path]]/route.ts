import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const PUBLIC_ROOT = resolve(process.cwd(), "public");
const UPLOADS_UAV_ROOT = resolve(PUBLIC_ROOT, "uploads", "uav");
const UPLOADS_AVATARS_ROOT = resolve(PUBLIC_ROOT, "uploads", "avatars");

function contentType(fileName: string): string {
  const low = fileName.toLowerCase();
  if (low.endsWith(".png")) return "image/png";
  if (low.endsWith(".webp")) return "image/webp";
  if (low.endsWith(".gif")) return "image/gif";
  if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return "image/jpeg";
  if (low.endsWith(".avif")) return "image/avif";
  if (low.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path: segments } = await context.params;
  if (!segments?.length) {
    return new Response("Not found", { status: 404 });
  }
  if (segments.some((part) => part.includes("..") || part.includes("/") || part.includes("\\"))) {
    return new Response("Not found", { status: 404 });
  }

  let filePath: string | null = null;
  if (segments[0] === "uploads" && segments[1] === "uav" && segments.length >= 3) {
    filePath = resolve(PUBLIC_ROOT, ...segments);
    const rootWithSep = UPLOADS_UAV_ROOT + sep;
    if (!filePath.startsWith(rootWithSep)) {
      return new Response("Not found", { status: 404 });
    }
  } else if (segments[0] === "uploads" && segments[1] === "avatars" && segments.length >= 3) {
    filePath = resolve(PUBLIC_ROOT, ...segments);
    const rootWithSep = UPLOADS_AVATARS_ROOT + sep;
    if (!filePath.startsWith(rootWithSep)) {
      return new Response("Not found", { status: 404 });
    }
  } else {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    const fileName = segments[segments.length - 1] ?? "";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType(fileName),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
