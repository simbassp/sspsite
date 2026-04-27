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
    const primaryQ = await supabase
      .from("news")
      .select("id,title,body,text,content,priority,author,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    let rows: unknown[] = (primaryQ.data as unknown[]) || [];
    let queryError: string | null = primaryQ.error?.message || null;
    if (primaryQ.error && isMissingColumnError(primaryQ.error.message)) {
      const bodyQ = await supabase
        .from("news")
        .select("id,title,body,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      rows = (bodyQ.data as unknown[]) || [];
      queryError = bodyQ.error?.message || null;
    }
    if (queryError && isMissingColumnError(queryError)) {
      const textQ = await supabase
        .from("news")
        .select("id,title,text,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      rows = (textQ.data as unknown[]) || [];
      queryError = textQ.error?.message || null;
    }
    if (queryError && isMissingColumnError(queryError)) {
      const contentQ = await supabase
        .from("news")
        .select("id,title,content,priority,author,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      rows = (contentQ.data as unknown[]) || [];
      queryError = contentQ.error?.message || null;
    }
    if (queryError) return Response.json({ ok: false, error: queryError }, { status: 500 });
    return Response.json({ ok: true, rows });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_exception" },
      { status: 500 },
    );
  }
}
