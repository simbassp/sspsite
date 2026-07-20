import { getServerSession } from "@/lib/server-auth";
import { markNotificationsRead } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  await markNotificationsRead(session.id, body.ids?.length ? body.ids : undefined);

  return Response.json({ ok: true });
}
