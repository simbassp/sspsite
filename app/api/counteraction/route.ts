import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const withSort = await supabase
      .from("catalog_items")
      .select("id,title,category,summary,image,specs,details,sort_order")
      .eq("kind", "counteraction")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200);

    if (!withSort.error) {
      const items = (withSort.data || []).map((row) => ({
        ...row,
        sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
      }));
      return Response.json({ ok: true, items });
    }

    if (isMissingColumnError(withSort.error.message)) {
      const fallback = await supabase
        .from("catalog_items")
        .select("id,title,category,summary,image,specs,details")
        .eq("kind", "counteraction")
        .order("created_at", { ascending: false })
        .limit(200);
      if (fallback.error) return Response.json({ ok: false, error: fallback.error.message }, { status: 500 });
      return Response.json({ ok: true, items: fallback.data || [] });
    }

    return Response.json({ ok: false, error: withSort.error.message }, { status: 500 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "counteraction_exception" },
      { status: 500 },
    );
  }
}
