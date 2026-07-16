import { canManageUsers } from "@/lib/permissions";
import { loadActiveCompany4UserIds } from "@/lib/personnel-server";
import {
  buildPersonnelBulkExportContentDisposition,
  loadPersonnelProfileExportBundles,
} from "@/lib/personnel-profile-export-server";
import { buildPersonnelBulkExcelBuffer } from "@/lib/personnel-profile-excel";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    scope?: unknown;
    platoon?: unknown;
    section?: unknown;
    search?: unknown;
  };

  const scope = raw.scope === "all" || raw.scope === "filter" ? raw.scope : null;
  if (!scope) {
    return Response.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  const platoonRaw = raw.platoon;
  const sectionRaw = raw.section;
  const platoon =
    platoonRaw === "all" || platoonRaw === null || platoonRaw === undefined || platoonRaw === ""
      ? ("all" as const)
      : Number(platoonRaw) === 1 || Number(platoonRaw) === 2
        ? (Number(platoonRaw) as 1 | 2)
        : null;
  const section =
    sectionRaw === "all" || sectionRaw === null || sectionRaw === undefined || sectionRaw === ""
      ? ("all" as const)
      : [1, 2, 3, 4].includes(Number(sectionRaw))
        ? (Number(sectionRaw) as 1 | 2 | 3 | 4)
        : null;

  if (scope === "filter" && (platoon === null || section === null)) {
    return Response.json({ ok: false, error: "invalid_filter" }, { status: 400 });
  }

  try {
    const idsResult =
      scope === "all"
        ? await loadActiveCompany4UserIds()
        : await loadActiveCompany4UserIds({
            platoon: platoon ?? "all",
            section: section ?? "all",
            search: typeof raw.search === "string" ? raw.search : "",
          });

    if (!idsResult.ok) {
      return Response.json({ ok: false, error: idsResult.error }, { status: 400 });
    }

    if (idsResult.userIds.length === 0) {
      return Response.json({ ok: false, error: "no_users" }, { status: 400 });
    }

    const bundles = await loadPersonnelProfileExportBundles(idsResult.userIds);
    if (!bundles.length) {
      return Response.json({ ok: false, error: "no_data" }, { status: 404 });
    }

    const buffer = await buildPersonnelBulkExcelBuffer(bundles);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": buildPersonnelBulkExportContentDisposition(scope),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[personnel-export-excel]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "export_excel_exception" },
      { status: 500 },
    );
  }
}
