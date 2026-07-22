import { canManageResults, canResetTestResults } from "@/lib/permissions";
import { buildResultsExcelBuffer, buildResultsExportFilename } from "@/lib/admin-results-excel";
import { loadResultsExportData } from "@/lib/admin-results-export-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageResults(session) && !canResetTestResults(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data = await loadResultsExportData(body);
    const rowCount = data.config.statusFilter === "not_started" ? data.notStartedRows.length : data.attemptRows.length;
    if (rowCount === 0) {
      return Response.json({ ok: false, error: "empty_export" }, { status: 400 });
    }

    const buffer = await buildResultsExcelBuffer(data);
    const filename = buildResultsExportFilename(data.config);
    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "export_failed" },
      { status: 500 },
    );
  }
}
