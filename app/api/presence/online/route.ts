import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { canViewOnline } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin" && !canViewOnline(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const staleBefore = new Date(Date.now() - ONLINE_LAST_SEEN_MAX_MS).toISOString();

  try {
    const supabase = getServerSupabaseServiceClient();
    const [q, countQ] = await Promise.all([
      supabase
        .from("app_users")
        .select("name,callsign,is_online,status")
        .eq("is_online", true)
        .eq("status", "active")
        .gte("last_seen_at", staleBefore)
        .order("name", { ascending: true })
        .limit(200),
      supabase.from("app_users").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    if (q.error) return Response.json({ ok: false, error: q.error.message || "presence_online_failed" }, { status: 500 });

    const names = (q.data || [])
      .map((row) => `${String(row.name || "").trim()} ${String(row.callsign || "").trim()}`.trim())
      .filter(Boolean);
    const totalUsers =
      countQ.error || countQ.count === null || countQ.count === undefined ? null : Number(countQ.count);
    return Response.json({ ok: true, names, total_users: totalUsers });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "presence_online_exception" },
      { status: 500 },
    );
  }
}
