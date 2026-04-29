import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { canManageNews } from "@/lib/permissions";
import { seedData } from "@/lib/seed";
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

function normalizeNewsRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body ?? row.text ?? row.content ?? "",
    text: row.text ?? row.body ?? row.content ?? "",
    content: row.content ?? row.body ?? row.text ?? "",
    priority: row.priority === "high" ? "high" : "normal",
    author: typeof row.author === "string" ? row.author : "",
    created_at: row.created_at,
    format: normalizeNewsTextStyle(row.format),
  }));
}

function fallbackSeedRows(limit: number) {
  return seedData.news.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    text: item.body,
    content: item.body,
    priority: item.priority,
    author: item.author,
    created_at: item.createdAt,
    format: normalizeNewsTextStyle(item.textStyle),
  }));
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 40), 200));

  try {
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase.from("news").select("*").order("created_at", { ascending: false }).limit(limit);
    if (q.error) {
      const message = (q.error.message || "").toLowerCase();
      if (message.includes("relation") && message.includes("news")) {
        return Response.json({ ok: true, rows: fallbackSeedRows(limit), degraded: true });
      }
      return Response.json({ ok: false, error: q.error.message || "news_query_failed" }, { status: 500 });
    }
    const rows: unknown[] = (q.data as unknown[]) || [];
    return Response.json({ ok: true, rows: normalizeNewsRows(rows as Array<Record<string, unknown>>) });
  } catch (error) {
    return Response.json({ ok: true, rows: fallbackSeedRows(limit), degraded: true });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canManageNews(session)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as {
      title?: unknown;
      body?: unknown;
      priority?: unknown;
      author?: unknown;
      textStyle?: unknown;
    };

    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const priority = body.priority === "high" ? "high" : "normal";
    const author = String(body.author || session.name || session.callsign || "Редактор").trim();
    const textStyle = normalizeNewsTextStyle(body.textStyle);

    if (!title || !text) {
      return Response.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    let insertQ = await supabase.from("news").insert({
      title,
      body: text,
      priority,
      author,
      format: textStyle,
    });

    if (insertQ.error && insertQ.error.message.toLowerCase().includes("format")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        author,
      });
    }
    if (insertQ.error && insertQ.error.message.toLowerCase().includes("body")) {
      insertQ = await supabase.from("news").insert({
        title,
        text,
        priority,
        author,
        format: textStyle,
      });
      if (insertQ.error && insertQ.error.message.toLowerCase().includes("format")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          priority,
          author,
        });
      }
    }
    if (insertQ.error) return Response.json({ ok: false, error: insertQ.error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_create_exception" },
      { status: 500 },
    );
  }
}
