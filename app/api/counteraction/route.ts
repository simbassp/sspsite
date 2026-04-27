import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const { data, error } = await supabase
      .from("catalog_items")
      .select("id,title,category,summary,image,specs,details")
      .eq("kind", "counteraction")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, items: data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "counteraction_exception" },
      { status: 500 },
    );
  }
}
