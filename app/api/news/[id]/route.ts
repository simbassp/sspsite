import { canManageNews } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { NewsTextStyle } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_NEWS_TEXT_STYLE: NewsTextStyle = {
  fontSize: 16,
  bold: false,
  italic: false,
  underline: false,
};

function normalizeNewsTextStyle(input: unknown): NewsTextStyle {
  if (!input || typeof input !== "object") return DEFAULT_NEWS_TEXT_STYLE;
  const candidate = input as Partial<NewsTextStyle>;
  const fontSizeRaw = Number(candidate.fontSize);
  return {
    fontSize: Number.isFinite(fontSizeRaw) ? Math.min(32, Math.max(12, Math.round(fontSizeRaw))) : 16,
    bold: candidate.bold === true,
    italic: candidate.italic === true,
    underline: candidate.underline === true,
  };
}

function normalizeNewsKind(input: unknown): "news" | "update" {
  if (input === "update") return "update";
  return "news";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingColumn(message: string, column: string) {
  const lower = message.toLowerCase();
  return (
    (lower.includes("column") && lower.includes(column.toLowerCase()) && lower.includes("does not exist")) ||
    (lower.includes("could not find") && lower.includes(column.toLowerCase()) && lower.includes("column"))
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canManageNews(session)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!id) return Response.json({ ok: false, error: "id_required" }, { status: 400 });
  if (!isUuidLike(id)) return Response.json({ ok: false, error: "invalid_news_id" }, { status: 400 });

  try {
    const body = (await request.json()) as {
      title?: unknown;
      body?: unknown;
      priority?: unknown;
      kind?: unknown;
      textStyle?: unknown;
    };
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const priority = body.priority === "high" ? "high" : "normal";
    const kind = normalizeNewsKind(body.kind);
    const textStyle = normalizeNewsTextStyle(body.textStyle);
    const formatPayload = { ...textStyle, kind } as const;
    if (!title || !text) {
      return Response.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    let updateQ = await supabase.from("news").update({ title, body: text, priority, format: formatPayload }).eq("id", id);
    if (updateQ.error && isMissingColumn(updateQ.error.message || "", "format")) {
      updateQ = await supabase.from("news").update({ title, body: text, priority }).eq("id", id);
    }
    if (updateQ.error && isMissingColumn(updateQ.error.message || "", "body")) {
      updateQ = await supabase.from("news").update({ title, text, priority, format: formatPayload }).eq("id", id);
      if (updateQ.error && isMissingColumn(updateQ.error.message || "", "format")) {
        updateQ = await supabase.from("news").update({ title, text, priority }).eq("id", id);
      }
    }
    if (updateQ.error) return Response.json({ ok: false, error: updateQ.error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_update_exception" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canManageNews(session)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!id) return Response.json({ ok: false, error: "id_required" }, { status: 400 });
  if (!isUuidLike(id)) return Response.json({ ok: false, error: "invalid_news_id" }, { status: 400 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase.from("news").delete().eq("id", id);
    if (q.error) return Response.json({ ok: false, error: q.error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_delete_exception" },
      { status: 500 },
    );
  }
}
