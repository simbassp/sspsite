import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 40), 200));

  try {
    const supabase = getServerSupabaseServiceClient();
    const { data, error } = await supabase
      .from("news")
      .select("id,title,body,text,content,priority,author,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, rows: data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_exception" },
      { status: 500 },
    );
  }
}
