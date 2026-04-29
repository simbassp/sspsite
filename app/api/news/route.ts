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

function normalizeNewsKind(input: unknown): "news" | "update" {
  if (!input || typeof input !== "object") return "news";
  const candidate = input as { kind?: unknown };
  return candidate.kind === "update" ? "update" : "news";
}

function normalizeNewsRows(rows: Array<Record<string, unknown>>) {
  const resolveAuthorText = (row: Record<string, unknown>) => {
    if (typeof row.author === "string" && row.author.trim()) return row.author.trim();
    if (typeof row.author_name === "string" && row.author_name.trim()) return row.author_name.trim();
    if (typeof row.publisher_name === "string" && row.publisher_name.trim()) return row.publisher_name.trim();
    return "";
  };
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body ?? row.text ?? row.content ?? "",
    text: row.text ?? row.body ?? row.content ?? "",
    content: row.content ?? row.body ?? row.text ?? "",
    priority: row.priority === "high" ? "high" : "normal",
    kind: normalizeNewsKind(row.format),
    author: resolveAuthorText(row),
    author_position: typeof row.author_position === "string" ? row.author_position : null,
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
    kind: item.kind ?? "news",
    author: item.author,
    created_at: item.createdAt,
    format: normalizeNewsTextStyle(item.textStyle),
  }));
}

function isMissingColumn(message: string, column: string) {
  const lower = message.toLowerCase();
  return (
    (lower.includes("column") && lower.includes(column.toLowerCase()) && lower.includes("does not exist")) ||
    (lower.includes("could not find") && lower.includes(column.toLowerCase()) && lower.includes("column"))
  );
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
    const rows: Array<Record<string, unknown>> = ((q.data as unknown[]) || []) as Array<Record<string, unknown>>;
    if (!rows.length) return Response.json({ ok: true, rows: fallbackSeedRows(limit), degraded: true });
    const mapped = normalizeNewsRows(rows);

    const missingAuthorRows = rows.filter((row, idx) => !mapped[idx]?.author);
    const candidateUserIds = Array.from(
      new Set(
        missingAuthorRows
          .map((row) => row.created_by ?? row.author_id ?? row.user_id ?? row.created_by_user_id)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );

    if (!candidateUserIds.length) {
      return Response.json({ ok: true, rows: mapped });
    }

    const usersQ = await supabase.from("app_users").select("id,auth_user_id,name,callsign,position");
    if (usersQ.error || !Array.isArray(usersQ.data)) {
      return Response.json({ ok: true, rows: mapped });
    }

    const usersMap = new Map<string, { name: string; callsign: string; position: string }>();
    for (const user of usersQ.data as Array<Record<string, unknown>>) {
      const id = typeof user.id === "string" ? user.id : "";
      const authUserId = typeof user.auth_user_id === "string" ? user.auth_user_id : "";
      const person = {
        name: typeof user.name === "string" ? user.name.trim() : "",
        callsign: typeof user.callsign === "string" ? user.callsign.trim() : "",
        position: typeof user.position === "string" ? user.position.trim() : "",
      };
      if (id) usersMap.set(id, person);
      if (authUserId) usersMap.set(authUserId, person);
    }

    const withAuthorFallback = mapped.map((item, idx) => {
      if (item.author) return item;
      const row = rows[idx];
      const candidateId =
        (typeof row.created_by === "string" && row.created_by) ||
        (typeof row.author_id === "string" && row.author_id) ||
        (typeof row.user_id === "string" && row.user_id) ||
        (typeof row.created_by_user_id === "string" && row.created_by_user_id) ||
        "";
      if (!candidateId) return item;
      const user = usersMap.get(candidateId);
      if (!user) return item;
      const authorText = `${user.name}${user.callsign ? ` ${user.callsign}` : ""}`.trim();
      return { ...item, author: authorText, author_position: user.position || item.author_position || null };
    });

    return Response.json({ ok: true, rows: withAuthorFallback });
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
      kind?: unknown;
      author?: unknown;
      textStyle?: unknown;
    };

    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const priority = body.priority === "high" ? "high" : "normal";
    const kind = body.kind === "update" ? "update" : "news";
    const author = String(body.author || session.name || session.callsign || "Редактор").trim();
    const textStyle = normalizeNewsTextStyle(body.textStyle);
    const formatPayload = { ...textStyle, kind } as const;

    if (!title || !text) {
      return Response.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    let insertQ = await supabase.from("news").insert({
      title,
      body: text,
      priority,
      author,
      format: formatPayload,
    });
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        author,
        format: formatPayload,
      });
    }

    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        author,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          author,
        });
      }
    }
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "body")) {
      insertQ = await supabase.from("news").insert({
        title,
        text,
        priority,
        author,
        format: formatPayload,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          author,
          format: formatPayload,
        });
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          priority,
          author,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            text,
            author,
          });
        }
      }
    }
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "author")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        format: formatPayload,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          format: formatPayload,
        });
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          priority,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            body: text,
          });
        }
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "body")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          priority,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            text,
          });
        }
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
