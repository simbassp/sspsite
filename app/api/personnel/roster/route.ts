import { getPersonnelContext } from "@/lib/personnel-api-guard";
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

  const platoon = platoonRaw && platoonRaw !== "all" ? Number(platoonRaw) : ("all" as const);
  const section = sectionRaw && sectionRaw !== "all" ? Number(sectionRaw) : ("all" as const);

  const roster = await loadPersonnelRoster({ platoon, section, search });
  if (!roster.ok) {
    return Response.json({ ok: false, error: roster.error, users: [] }, { status: 500 });
  }

  const users = roster.users;
  const totals = users.reduce(
    (acc, u) => {
      acc.totalEmployees += 1;
      if (u.dutyLocation === "deployment") acc.deployedNow += 1;
      acc.totalDays += u.deploymentDays;
      acc.totalHits += u.uavHitsTotal;
      acc.totalPremiums += u.premiumsTotal;
      return acc;
    },
    { totalEmployees: 0, deployedNow: 0, totalDays: 0, totalHits: 0, totalPremiums: 0 },
  );
  const avgDays = totals.totalEmployees ? Math.round(totals.totalDays / totals.totalEmployees) : 0;

  const topHits = [...users].sort((a, b) => b.uavHitsTotal - a.uavHitsTotal).slice(0, 5);
  const topPremiums = [...users].sort((a, b) => b.premiumsTotal - a.premiumsTotal).slice(0, 5);
  const topDays = [...users].sort((a, b) => b.deploymentDays - a.deploymentDays).slice(0, 5);

  return Response.json({
    ok: true,
    isPreview: ctx.access.isPreview,
    users,
    stats: { ...totals, avgDays },
    tops: { hits: topHits, premiums: topPremiums, days: topDays },
  });
}
