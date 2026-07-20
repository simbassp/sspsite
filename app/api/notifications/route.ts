import { getServerSession } from "@/lib/server-auth";
import { countUnreadNotifications, loadNotifications } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const items = await loadNotifications(session.id);
  return Response.json({ ok: true, items });
}
