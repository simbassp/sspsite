import { canManageTacticalMedicine } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import {
  isBuiltinTacticalMedicineCategory,
  normalizeTacticalMedicineCategoryLabel,
} from "@/lib/tactical-medicine-categories";

export const runtime = "nodejs";

function isMissingRelationError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("relation")
  );
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase
      .from("tactical_medicine_category_presets")
      .select("id,label,created_at")
      .order("created_at", { ascending: true });

    if (q.error) {
      if (isMissingRelationError(q.error.message)) {
        return Response.json({ ok: true, custom: [], migrationRequired: true });
      }
      return Response.json({ ok: false, error: q.error.message }, { status: 500 });
    }

    const custom = (q.data || [])
      .map((row) => String(row.label || "").trim())
      .filter((label) => label && !isBuiltinTacticalMedicineCategory(label));

    return Response.json({ ok: true, custom });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "categories_exception" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTacticalMedicine(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { label?: unknown };
  try {
    body = (await request.json()) as { label?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const label = String(body.label ?? "").trim();
  if (!label) return Response.json({ ok: false, error: "label_required" }, { status: 400 });
  if (label.length > 80) return Response.json({ ok: false, error: "label_too_long" }, { status: 400 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const existing = await supabase.from("tactical_medicine_category_presets").select("id,label");
    if (existing.error) {
      if (isMissingRelationError(existing.error.message)) {
        return Response.json({ ok: false, error: "migration_required_tactical_medicine_category_presets" }, { status: 500 });
      }
      return Response.json({ ok: false, error: existing.error.message }, { status: 500 });
    }

    const dup = (existing.data || []).find(
      (row) =>
        normalizeTacticalMedicineCategoryLabel(String(row.label || "")) ===
        normalizeTacticalMedicineCategoryLabel(label),
    );
    if (dup) return Response.json({ ok: true, label: String(dup.label), alreadyExists: true });

    const ins = await supabase.from("tactical_medicine_category_presets").insert({ label }).select("label").single();
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
    return Response.json({ ok: true, label: String(ins.data?.label || label) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "categories_post_exception" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTacticalMedicine(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const label = String(url.searchParams.get("label") || "").trim();
  if (!label) return Response.json({ ok: false, error: "label_required" }, { status: 400 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const rows = await supabase.from("tactical_medicine_category_presets").select("id,label");
    if (rows.error) return Response.json({ ok: false, error: rows.error.message }, { status: 500 });

    const target = (rows.data || []).find(
      (row) =>
        normalizeTacticalMedicineCategoryLabel(String(row.label || "")) ===
        normalizeTacticalMedicineCategoryLabel(label),
    );
    if (!target) return Response.json({ ok: true, deleted: false });

    const del = await supabase.from("tactical_medicine_category_presets").delete().eq("id", target.id);
    if (del.error) return Response.json({ ok: false, error: del.error.message }, { status: 500 });
    return Response.json({ ok: true, deleted: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "categories_delete_exception" },
      { status: 500 },
    );
  }
}
