import { getPersonnelContext } from "@/lib/personnel-api-guard";
import { markNotificationsRead } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  await markNotificationsRead(ctx.session.id, body.ids?.length ? body.ids : undefined);

  return Response.json({ ok: true });
}
