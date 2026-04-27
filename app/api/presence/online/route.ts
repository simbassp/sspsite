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

  try {
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase
      .from("app_users")
      .select("name,callsign,is_online,status")
      .eq("is_online", true)
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(200);
    if (q.error) return Response.json({ ok: false, error: q.error.message || "presence_online_failed" }, { status: 500 });

    const names = (q.data || [])
      .map((row) => `${String(row.name || "").trim()} ${String(row.callsign || "").trim()}`.trim())
      .filter(Boolean);
    return Response.json({ ok: true, names });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "presence_online_exception" },
      { status: 500 },
    );
  }
}
