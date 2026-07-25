import { getPersonnelContext } from "@/lib/personnel-api-guard";
import {
  loadNotifications,
} from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const items = await loadNotifications(ctx.session.id);
  return Response.json({ ok: true, items });
}

export async function POST(req: Request) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  if (!ctx.access.canEditOwn && ctx.session.role !== "admin") {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    requestType?: "medal" | "premium" | "deployment" | "exam";
    payload?: Record<string, unknown>;
    userId?: string;
  };

  const requestType = body.requestType;
  if (!requestType) {
    return Response.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const targetUserId =
    body.userId && (ctx.session.role === "admin" || ctx.access.canModerate)
      ? body.userId
      : ctx.session.id;

  if (!ctx.settings.moderationEnabled && ctx.session.role !== "admin") {
    return Response.json({ ok: false, error: "moderation_disabled" }, { status: 503 });
  }

  return Response.json({ ok: false, error: "feature_removed" }, { status: 410 });
}
