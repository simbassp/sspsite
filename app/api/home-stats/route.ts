import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    let usersQ = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("status", "active");
    if (usersQ.error && isMissingColumnError(usersQ.error.message)) {
      usersQ = await supabase.from("app_users").select("id", { count: "exact", head: true });
    }
    const newsQ = await supabase.from("news").select("id", { count: "exact", head: true });
    if (usersQ.error || newsQ.error) {
      return Response.json(
        { ok: false, error: usersQ.error?.message || newsQ.error?.message || "home_stats_failed" },
        { status: 500 },
      );
    }
    return Response.json({ ok: true, active_users: usersQ.count ?? 0, news_count: newsQ.count ?? 0 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "home_stats_exception" },
      { status: 500 },
    );
  }
}
