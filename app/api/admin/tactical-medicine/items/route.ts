import { canManageTacticalMedicine } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type ItemBody = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  summary?: unknown;
  image?: unknown;
  sortOrder?: unknown;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

function isMissingEnumError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("invalid input value for enum") || (m.includes("tactical_medicine") && m.includes("enum"));
}

function isMissingRelationError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("relation")
  );
}

function mapRow(row: Record<string, unknown>) {
  const rawSpecs = Array.isArray(row.specs) ? row.specs : [];
  const specs = rawSpecs
    .map((item, index) => {
      const rec = item as { key?: string; value?: string };
      const key = typeof rec?.key === "string" && rec.key.trim() ? rec.key.trim() : `Параметр ${index + 1}`;
      const value = typeof rec?.value === "string" ? rec.value.trim() : "";
      return { key, value };
    })
    .filter((item) => item.value.length > 0);

  const details = (row.details ?? {}) as {
    overview?: string;
    tth?: string;
    usage?: string;
    materials?: string;
  };

  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    category: String(row.category || ""),
    summary: String(row.summary || ""),
    image: String(row.image || ""),
    specs,
    details: {
      overview: details.overview ?? "",
      tth: details.tth ?? "",
      usage: details.usage ?? "",
      materials: details.materials ?? "",
    },
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
  };
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTacticalMedicine(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: ItemBody;
  try {
    body = (await request.json()) as ItemBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "").trim() || "Без категории";
  const summary = String(body.summary ?? "").trim();
  const image = String(body.image ?? "").trim();
  const id = String(body.id ?? "").trim();

  if (!title) return Response.json({ ok: false, error: "title_required" }, { status: 400 });
  if (!image) return Response.json({ ok: false, error: "image_required" }, { status: 400 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const baseSlug = slugify(title) || "tactical-medicine-item";
    const payload: Record<string, unknown> = {
      kind: "tactical_medicine",
      slug: id ? `${baseSlug}-${id.slice(0, 6)}` : `${baseSlug}-${Date.now().toString(36)}`,
      title,
      category,
      summary,
      image,
      specs: [],
      details: { overview: summary, tth: "", usage: "", materials: "" },
    };

    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      payload.sort_order = Math.max(0, Math.floor(body.sortOrder));
    } else if (!id) {
      const maxQ = await supabase
        .from("catalog_items")
        .select("sort_order")
        .eq("kind", "tactical_medicine")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxQ.error && !isMissingColumnError(maxQ.error.message)) {
        if (isMissingEnumError(maxQ.error.message)) {
          return Response.json(
            { ok: false, error: "migration_required_tactical_medicine_kind", message: "Выполните миграцию тактической медицины в Supabase." },
            { status: 500 },
          );
        }
        return Response.json({ ok: false, error: maxQ.error.message }, { status: 500 });
      }
      const maxOrder = Number((maxQ.data as { sort_order?: number } | null)?.sort_order);
      payload.sort_order = Number.isFinite(maxOrder) ? maxOrder + 1 : 0;
    }

    const payloadWithId = id ? { ...payload, id } : payload;

    let upsert = await supabase
      .from("catalog_items")
      .upsert(payloadWithId, { onConflict: "id" })
      .select("id,slug,kind,title,category,summary,image,specs,details,sort_order")
      .single();

    if (upsert.error) {
      if (isMissingColumnError(upsert.error.message)) {
        const { sort_order: _ignored, ...withoutSort } = payloadWithId as Record<string, unknown> & {
          sort_order?: unknown;
        };
        upsert = await supabase
          .from("catalog_items")
          .upsert(withoutSort, { onConflict: "id" })
          .select("id,slug,kind,title,category,summary,image,specs,details")
          .single();
      }
      if (upsert.error) {
        if (isMissingEnumError(upsert.error.message)) {
          return Response.json(
            {
              ok: false,
              error: "migration_required_tactical_medicine_kind",
              message: "В Supabase не применена миграция catalog_kind «tactical_medicine».",
            },
            { status: 500 },
          );
        }
        return Response.json({ ok: false, error: upsert.error.message }, { status: 500 });
      }
    }

    return Response.json({ ok: true, item: mapRow((upsert.data || {}) as Record<string, unknown>) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "items_post_exception" },
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
  const itemId = String(url.searchParams.get("id") || "").trim();
  if (!itemId) return Response.json({ ok: false, error: "id_required" }, { status: 400 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const del = await supabase.from("catalog_items").delete().eq("id", itemId).eq("kind", "tactical_medicine");
    if (del.error) {
      if (isMissingRelationError(del.error.message)) {
        return Response.json({ ok: false, error: del.error.message }, { status: 500 });
      }
      return Response.json({ ok: false, error: del.error.message }, { status: 500 });
    }
    return Response.json({ ok: true, deleted: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "items_delete_exception" },
      { status: 500 },
    );
  }
}
