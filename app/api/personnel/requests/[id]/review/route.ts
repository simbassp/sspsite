import { getPersonnelContext } from "@/lib/personnel-api-guard";
import { reviewPersonnelRequest } from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  if (!ctx.access.canModerate) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await req.json()) as { approve?: boolean; note?: string };
  const result = await reviewPersonnelRequest({
    requestId: id,
    reviewerId: ctx.session.id,
    approve: body.approve === true,
    note: body.note,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
