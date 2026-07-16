import { canManageUsers } from "@/lib/permissions";
import {
  buildPersonnelExportFilename,
  loadPersonnelProfileExportBundle,
} from "@/lib/personnel-profile-export-server";
import { buildPersonnelProfileExcelBuffer } from "@/lib/personnel-profile-excel";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  try {
    const bundle = await loadPersonnelProfileExportBundle(userId);
    if (!bundle) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const buffer = await buildPersonnelProfileExcelBuffer(bundle);
    const filename = buildPersonnelExportFilename(bundle);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export-excel]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "export_excel_exception" },
      { status: 500 },
    );
  }
}
