import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 40), 200));

  try {
    const supabase = getServerSupabaseServiceClient();
    let query = await supabase
      .from("news")
      .select("id,title,body,text,content,priority,author,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (query.error && isMissingColumnError(query.error.message)) {
      query = await supabase
        .from("news")
        .select("id,title,body,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
    }
    if (query.error && isMissingColumnError(query.error.message)) {
      query = await supabase
        .from("news")
        .select("id,title,text,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
    }
    if (query.error && isMissingColumnError(query.error.message)) {
      query = await supabase
        .from("news")
        .select("id,title,content,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
    }
    if (query.error) return Response.json({ ok: false, error: query.error.message }, { status: 500 });
    return Response.json({ ok: true, rows: query.data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_exception" },
      { status: 500 },
    );
  }
}
