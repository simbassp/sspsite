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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canManageNews(session)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!id) return Response.json({ ok: false, error: "id_required" }, { status: 400 });

  try {
    const body = (await request.json()) as { title?: unknown; body?: unknown; priority?: unknown; textStyle?: unknown };
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const priority = body.priority === "high" ? "high" : "normal";
    const textStyle = normalizeNewsTextStyle(body.textStyle);
    if (!title || !text) {
      return Response.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    let updateQ = await supabase.from("news").update({ title, body: text, priority, format: textStyle }).eq("id", id);
    if (updateQ.error && updateQ.error.message.toLowerCase().includes("format")) {
      updateQ = await supabase.from("news").update({ title, body: text, priority }).eq("id", id);
    }
    if (updateQ.error && updateQ.error.message.toLowerCase().includes("body")) {
      updateQ = await supabase.from("news").update({ title, text, priority, format: textStyle }).eq("id", id);
      if (updateQ.error && updateQ.error.message.toLowerCase().includes("format")) {
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
