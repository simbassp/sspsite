import { buildAdminUsersExcelBuffer, buildAdminUsersExportFilename } from "@/lib/admin-users-excel";
import {
  buildAdminUsersExportFilterLines,
  mapAdminUsersExportRow,
  parseAdminUsersExportFilterConfig,
} from "@/lib/admin-users-export";
import { canManageUsers, canViewUserList } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";

export const runtime = "nodejs";
export const maxDuration = 60;

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function applyExportFilters<T extends { eq: (col: string, val: string) => T; or: (expr: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  config: ReturnType<typeof parseAdminUsersExportFilterConfig>,
) {
  let next = query;
  if (config.position !== "all") next = next.eq("position", config.position);
  if (config.duty === "base") next = next.eq("duty_location", "base");
  if (config.duty === "deployment") next = next.eq("duty_location", "deployment");
  if (config.unit === "unset") next = next.is("unit_assignment", null);
  else if (config.unit !== "all") next = next.eq("unit_assignment", config.unit);
  if (config.search) {
    const q = escapeIlike(config.search);
    next = next.or(`name.ilike.%${q}%,callsign.ilike.%${q}%,login.ilike.%${q}%,position.ilike.%${q}%`);
  }
  return next;
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageUsers(session) && !canViewUserList(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const config = parseAdminUsersExportFilterConfig((body ?? {}) as Record<string, unknown>);
  const filterLines = buildAdminUsersExportFilterLines(config);

  try {
    const supabase = getServerSupabaseServiceClient();
    const pageSize = 500;
    let from = 0;
    const rows: ReturnType<typeof mapAdminUsersExportRow>[] = [];

    while (true) {
      let query = supabase
        .from("app_users")
        .select("name,callsign,position,unit_assignment")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      query = applyExportFilters(query, config);
      const response = await query;
      if (response.error) {
        return Response.json({ ok: false, error: response.error.message }, { status: 500 });
      }

      const chunk = response.data ?? [];
      for (const item of chunk) {
        rows.push(
          mapAdminUsersExportRow({
            name: typeof item.name === "string" ? item.name : "",
            callsign: typeof item.callsign === "string" ? item.callsign : "",
            position: typeof item.position === "string" ? item.position : "",
            unitAssignment: normalizeUnitAssignment(item.unit_assignment),
          }),
        );
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    if (rows.length === 0) {
      return Response.json({ ok: false, error: "empty_export" }, { status: 400 });
    }

    const buffer = await buildAdminUsersExcelBuffer({ rows, filterLines });
    const filename = buildAdminUsersExportFilename();
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
