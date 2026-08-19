import { canManageTacticalMedicine } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTacticalMedicine(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { orderedIds?: unknown };
  try {
    body = (await request.json()) as { orderedIds?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderedIds = Array.isArray(body.orderedIds)
    ? body.orderedIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!orderedIds.length) {
    return Response.json({ ok: false, error: "orderedIds_required" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const existingQ = await supabase
      .from("catalog_items")
      .select("id")
      .eq("kind", "tactical_medicine")
      .in("id", orderedIds);
    if (existingQ.error) {
      return Response.json({ ok: false, error: existingQ.error.message }, { status: 500 });
    }

    const existingIds = new Set((existingQ.data || []).map((row) => String(row.id)));
    if (existingIds.size !== orderedIds.length) {
      return Response.json({ ok: false, error: "orderedIds_mismatch" }, { status: 400 });
    }

    const updates = orderedIds.map((id, index) =>
      supabase.from("catalog_items").update({ sort_order: index }).eq("id", id).eq("kind", "tactical_medicine"),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      if (isMissingColumnError(failed.error.message)) {
        return Response.json({ ok: false, error: "migration_required_sort_order" }, { status: 500 });
      }
      return Response.json({ ok: false, error: failed.error.message }, { status: 500 });
    }

    return Response.json({ ok: true, count: orderedIds.length });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reorder_exception" },
      { status: 500 },
    );
  }
}
