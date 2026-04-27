import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type CatalogRow = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  category: string;
  summary: string;
  image: string;
  specs: Array<{ key?: string; value?: string }> | unknown;
  details: {
    overview?: string;
    tth?: string;
    usage?: string;
    materials?: string;
  } | unknown;
};

const FETCH_TIMEOUT_MS = 12000;

function toCatalogItem(row: CatalogRow) {
  const rawSpecs = Array.isArray(row.specs) ? row.specs : [];
  const specs = rawSpecs
    .map((item, index) => {
      const key = typeof item?.key === "string" && item.key.trim() ? item.key.trim() : `Параметр ${index + 1}`;
      const value = typeof item?.value === "string" ? item.value.trim() : "";
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
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    image: row.image,
    specs,
    details: {
      overview: details.overview ?? "",
      tth: details.tth ?? "",
      usage: details.usage ?? "",
      materials: details.materials ?? "",
    },
  };
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
  const url = new URL(`${baseUrl}/rest/v1/catalog_items`);
  url.searchParams.set("select", "id,slug,kind,title,category,summary,image,specs,details");
  url.searchParams.set("kind", "eq.uav");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "200");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url.toString(), {
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Response.json({ ok: false, error: "Supabase error" }, { status: 502 });
    }

    const rows = (await response.json()) as CatalogRow[];
    const items = Array.isArray(rows) ? rows.map(toCatalogItem) : [];
    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, error: "Fetch failed" }, { status: 502 });
  }
}
