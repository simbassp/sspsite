import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { online?: unknown };
    const online = body.online === true;
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase
      .from("app_users")
      .update({ is_online: online, last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
    if (q.error) return Response.json({ ok: false, error: q.error.message || "presence_update_failed" }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "presence_exception" },
      { status: 500 },
    );
  }
}
