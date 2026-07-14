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
    // При уходе в офлайн не трогаем last_seen — иначе после logout человек ещё «свежий» по времени.
    const patch = online
      ? { is_online: true, last_seen_at: new Date().toISOString() }
      : { is_online: false };
    const q = await supabase.from("app_users").update(patch).eq("id", session.id);
    if (q.error) return Response.json({ ok: false, error: q.error.message || "presence_update_failed" }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "presence_exception" },
      { status: 500 },
    );
  }
}
