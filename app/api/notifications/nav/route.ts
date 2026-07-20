import { getServerSession } from "@/lib/server-auth";
import { countUnreadNotifications } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const unread = await countUnreadNotifications(session.id);

  return Response.json({
    ok: true,
    unreadNotifications: unread,
    canSendNotifications: session.role === "admin",
  });
}
