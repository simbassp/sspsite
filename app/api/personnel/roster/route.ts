import { getPersonnelContext } from "@/lib/personnel-api-guard";
import { parseRosterFilterParams } from "@/lib/personnel-roster-filters";
import { loadPersonnelRoster } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const platoonRaw = url.searchParams.get("platoon");
  const sectionRaw = url.searchParams.get("section");
  const search = url.searchParams.get("search") ?? "";
  const testDateRaw = url.searchParams.get("testDate") ?? "";
  const testDate = /^\d{4}-\d{2}-\d{2}$/.test(testDateRaw.trim()) ? testDateRaw.trim() : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 10) || 10));

  const platoon = platoonRaw && platoonRaw !== "all" ? Number(platoonRaw) : ("all" as const);
  const section = sectionRaw && sectionRaw !== "all" ? Number(sectionRaw) : ("all" as const);

  const roster = await loadPersonnelRoster({
    platoon,
    section,
    search,
    testDate,
    page,
    pageSize,
    rosterFilters: parseRosterFilterParams(url.searchParams),
  });
  if (!roster.ok) {
    return Response.json({ ok: false, error: roster.error, users: [], total: 0 }, { status: 500 });
  }

  return Response.json({
    ok: true,
    isPreview: ctx.access.isPreview,
    users: roster.users,
    total: roster.total,
    page,
    pageSize,
    stats: roster.stats,
    tops: roster.tops,
  });
}
