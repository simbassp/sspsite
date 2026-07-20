import { sendAdminBroadcast, sendAdminMessage } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const body = (await req.json()) as {
      target?: unknown;
      userId?: unknown;
      title?: unknown;
      body?: unknown;
      href?: unknown;
    };

    const title = String(body.title ?? "").trim();
    const text = String(body.body ?? "").trim();
    const hrefRaw = String(body.href ?? "").trim();
    const href = hrefRaw || null;

    if (!title) {
      return Response.json({ ok: false, error: "title_required" }, { status: 400 });
    }

    const target = String(body.target ?? body.userId ?? "").trim();
    if (target === "all") {
      const result = await sendAdminBroadcast(title, text, href);
      if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 500 });
      return Response.json({ ok: true, sent: result.sent });
    }

    if (!isUuidLike(target)) {
      return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
    }

    const result = await sendAdminMessage(target, title, text, href);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 500 });
    return Response.json({ ok: true, sent: 1 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "notification_send_exception" },
      { status: 500 },
    );
  }
}
