"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeoutAndRetry } from "@/lib/async-utils";
import {
  getCounteractionById,
  getUavById,
  listCounteraction,
  removeCounteractionItem,
  removeUavItem,
  upsertCounteractionItem,
  upsertUavItem,
} from "@/lib/storage";
import { CatalogItem } from "@/lib/types";

type CatalogKind = "uav" | "counteraction" | "tactical_medicine";

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE_KEYS: Record<CatalogKind, string> = {
  uav: "ssp_catalog_cache_uav_v1",
  counteraction: "ssp_catalog_cache_counteraction_v1",
  tactical_medicine: "ssp_catalog_cache_tactical_medicine_v1",
};
const catalogMemoryCache: Partial<Record<CatalogKind, { ts: number; items: CatalogItem[] }>> = {};

function readCatalogCache(kind: CatalogKind, options?: { ignoreExpiry?: boolean }) {
  const now = Date.now();
  const ignoreExpiry = options?.ignoreExpiry === true;

  const pickItems = (ts: number, items: CatalogItem[]) => {
    if (!ignoreExpiry && now - ts >= CATALOG_CACHE_TTL_MS) return null;
    return items;
  };

  const memory = catalogMemoryCache[kind];
  if (memory) {
    const items = pickItems(memory.ts, memory.items);
    if (items) return items;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEYS[kind]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; items?: CatalogItem[] };
    if (!parsed.ts || !Array.isArray(parsed.items)) return null;
    const items = pickItems(parsed.ts, parsed.items);
    if (!items) return null;
    catalogMemoryCache[kind] = { ts: parsed.ts, items: parsed.items };
    return items;
  } catch {
    return null;
  }
}

export function peekCatalogCache(kind: CatalogKind) {
  const items = readCatalogCache(kind, { ignoreExpiry: true });
  const memory = catalogMemoryCache[kind];
  if (!items || !memory) return null;
  return {
    items,
    ts: memory.ts,
    fresh: Date.now() - memory.ts < CATALOG_CACHE_TTL_MS,
  };
}

function isCatalogCacheFresh(kind: CatalogKind) {
  const memory = catalogMemoryCache[kind];
  if (!memory) return false;
  return Date.now() - memory.ts < CATALOG_CACHE_TTL_MS;
}

function writeCatalogCache(kind: CatalogKind, items: CatalogItem[]) {
  const payload = { ts: Date.now(), items };
  catalogMemoryCache[kind] = payload;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEYS[kind], JSON.stringify(payload));
  } catch {}
}

export function invalidateCatalogCache(kind: CatalogKind) {
  delete catalogMemoryCache[kind];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CATALOG_CACHE_KEYS[kind]);
  } catch {}
}

async function fetchCatalogItemsFromApi(kind: CatalogKind): Promise<CatalogItem[]> {
  const path =
    kind === "uav"
      ? "/api/uav"
      : kind === "counteraction"
        ? "/api/counteraction"
        : "/api/tactical-medicine";
  const response = await withTimeoutAndRetry(
    () =>
      fetch(path, {
        cache: "no-store",
        headers: { "cache-control": "no-store" },
      }),
    20_000,
    1,
    kind === "uav"
      ? "fetch_uav_items_timeout"
      : kind === "counteraction"
        ? "fetch_counteraction_items_timeout"
        : "fetch_tactical_medicine_items_timeout",
  );
  if (!response.ok) {
    throw new Error(`catalog_fetch_failed_${response.status}`);
  }
  const payload = (await response.json()) as { ok?: boolean; items?: CatalogItem[] };
  if (kind !== "uav" && (!payload.ok || !Array.isArray(payload.items))) {
    throw new Error("catalog_fetch_invalid_response");
  }
  if (!Array.isArray(payload.items)) {
    return [];
  }
  return payload.items;
}

async function fetchCachedCatalogItems(
  kind: CatalogKind,
  forceRefresh = false,
  localFallback?: () => CatalogItem[],
): Promise<CatalogItem[]> {
  if (!forceRefresh && isCatalogCacheFresh(kind)) {
    const cached = readCatalogCache(kind);
    if (cached) return cached;
  }

  try {
    const items = await fetchCatalogItemsFromApi(kind);
    writeCatalogCache(kind, items);
    return items;
  } catch (error) {
    const stale = readCatalogCache(kind, { ignoreExpiry: true });
    if (stale?.length) return stale;
    if (localFallback && shouldUseLocalFallback(kind === "counteraction")) {
      const local = localFallback();
      writeCatalogCache(kind, local);
      return local;
    }
    if (kind === "uav") return [];
    throw error instanceof Error ? error : new Error("catalog_fetch_failed");
  }
}

type CatalogRow = {
  id: string;
  slug: string;
  kind: "counteraction" | "uav" | "tactical_medicine";
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
  sort_order?: number | null;
};

type TimedOut = { __timeout: true };

function timeoutResult(ms: number) {
  return new Promise<TimedOut>((resolve) => {
    setTimeout(() => resolve({ __timeout: true }), ms);
  });
}

function toCatalogItem(row: CatalogRow): CatalogItem {
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
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function shouldUseLocalFallback(allowLocalFallback: boolean) {
  if (!allowLocalFallback) return false;
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function fetchCatalogItems(
  kind: CatalogKind,
  fallback: () => CatalogItem[],
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback();
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  type CatalogFetchResult =
    | TimedOut
    | { data: CatalogRow[] | null; error: { message?: string } | null };

  let response: CatalogFetchResult = await Promise.race([
    supabase
      .from("catalog_items")
      .select("id,slug,kind,title,category,summary,image,specs,details,sort_order")
      .eq("kind", kind)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    timeoutResult(7000),
  ]);

  if (!("__timeout" in response) && response.error) {
    const msg = (response.error.message || "").toLowerCase();
    if (msg.includes("sort_order") || (msg.includes("column") && msg.includes("does not exist"))) {
      response = await Promise.race([
        supabase
          .from("catalog_items")
          .select("id,slug,kind,title,category,summary,image,specs,details")
          .eq("kind", kind)
          .order("created_at", { ascending: false }),
        timeoutResult(7000),
      ]);
    }
  }

  if ("__timeout" in response) {
    return useFallback ? fallback() : [];
  }
  const { data, error } = response;

  if (error || !data) {
    return useFallback ? fallback() : [];
  }
  const mapped = (data as CatalogRow[]).map(toCatalogItem);
  if (mapped.length === 0) {
    return useFallback ? fallback() : [];
  }
  return mapped;
}

async function fetchCatalogById(
  kind: CatalogKind,
  itemId: string,
  fallback: (id: string) => CatalogItem | null,
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback(itemId);
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  const response = await Promise.race([
    supabase
      .from("catalog_items")
      .select("id,slug,kind,title,category,summary,image,specs,details")
      .eq("kind", kind)
      .eq("id", itemId)
      .maybeSingle(),
    timeoutResult(7000),
  ]);

  if ("__timeout" in response) {
    return useFallback ? fallback(itemId) : null;
  }
  const { data, error } = response;

  if (error || !data) {
    return useFallback ? fallback(itemId) : null;
  }
  return toCatalogItem(data as CatalogRow);
}

async function saveCatalogItem(
  kind: CatalogKind,
  input: Omit<CatalogItem, "id"> & { id?: string },
  fallback: (row: Omit<CatalogItem, "id"> & { id?: string }) => CatalogItem,
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback(input);
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  const baseSlug = slugify(input.title) || `${kind}-item`;
  const payload: Record<string, unknown> = {
    kind,
    slug: input.id ? `${baseSlug}-${input.id.slice(0, 6)}` : `${baseSlug}-${Date.now().toString(36)}`,
    title: input.title,
    category: input.category,
    summary: input.summary,
    image: input.image,
    specs: input.specs,
    details: input.details,
  };
  if (typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)) {
    payload.sort_order = Math.max(0, Math.floor(input.sortOrder));
  } else if (!input.id) {
    // Новая карточка — в конец списка текущего kind.
    const maxQ = await supabase
      .from("catalog_items")
      .select("sort_order")
      .eq("kind", kind)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxOrder = Number((maxQ.data as { sort_order?: number } | null)?.sort_order);
    payload.sort_order = Number.isFinite(maxOrder) ? maxOrder + 1 : 0;
  }
  const payloadWithId = input.id ? { ...payload, id: input.id } : payload;

  let { data, error } = await supabase
    .from("catalog_items")
    .upsert(payloadWithId, { onConflict: "id" })
    .select("id,slug,kind,title,category,summary,image,specs,details,sort_order")
    .single();

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("sort_order") || (msg.includes("column") && msg.includes("does not exist"))) {
      const { sort_order: _ignored, ...withoutSort } = payloadWithId as Record<string, unknown> & {
        sort_order?: unknown;
      };
      const legacy = await supabase
        .from("catalog_items")
        .upsert(withoutSort, { onConflict: "id" })
        .select("id,slug,kind,title,category,summary,image,specs,details")
        .single();
      data = legacy.data as typeof data;
      error = legacy.error;
    }
  }

  if (error || !data) {
    if (useFallback) return fallback(input);
    throw new Error(error?.message || "remote_save_failed");
  }
  return toCatalogItem(data as CatalogRow);
}

export async function reorderUavItems(orderedIds: string[]) {
  const response = await fetch("/api/admin/uav/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || "reorder_failed");
  }
  invalidateCatalogCache("uav");
}

export async function reorderCounteractionItems(orderedIds: string[]) {
  const response = await fetch("/api/admin/counteraction/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || "reorder_failed");
  }
  invalidateCatalogCache("counteraction");
}

async function deleteCatalogItem(
  kind: CatalogKind,
  itemId: string,
  fallback: (id: string) => void,
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback(itemId);
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("catalog_items").delete().eq("id", itemId).eq("kind", kind);
  if (error) {
    if (useFallback) {
      fallback(itemId);
      return;
    }
    throw new Error(error.message || "remote_delete_failed");
  }
}

export async function fetchUavItems(forceRefresh = false) {
  return fetchCachedCatalogItems("uav", forceRefresh);
}

export async function fetchUavById(itemId: string) {
  return fetchCatalogById("uav", itemId, getUavById, false);
}

export async function saveUavItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  const saved = await saveCatalogItem("uav", input, upsertUavItem, false);
  invalidateCatalogCache("uav");
  return saved;
}

export async function deleteUavItem(itemId: string) {
  await deleteCatalogItem("uav", itemId, removeUavItem, false);
  invalidateCatalogCache("uav");
}

export async function fetchCounteractionItems(forceRefresh = false) {
  return fetchCachedCatalogItems("counteraction", forceRefresh, listCounteraction);
}

export async function fetchCounteractionById(itemId: string) {
  return fetchCatalogById("counteraction", itemId, getCounteractionById);
}

export async function saveCounteractionItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  const saved = await saveCatalogItem("counteraction", input, upsertCounteractionItem);
  invalidateCatalogCache("counteraction");
  return saved;
}

export async function deleteCounteractionItem(itemId: string) {
  await deleteCatalogItem("counteraction", itemId, removeCounteractionItem);
  invalidateCatalogCache("counteraction");
}

export async function fetchTacticalMedicineItems(forceRefresh = false) {
  return fetchCachedCatalogItems("tactical_medicine", forceRefresh);
}

export async function saveTacticalMedicineItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  const payload: Omit<CatalogItem, "id"> & { id?: string } = {
    ...input,
    specs: [],
    details: { overview: input.summary, tth: "", usage: "", materials: "" },
  };
  const saved = await saveCatalogItem("tactical_medicine", payload, (row) => ({
    id: row.id || `local-${Date.now()}`,
    title: row.title,
    category: row.category,
    summary: row.summary,
    image: row.image,
    specs: [],
    details: payload.details,
    sortOrder: row.sortOrder,
  }), false);
  invalidateCatalogCache("tactical_medicine");
  return saved;
}

export async function deleteTacticalMedicineItem(itemId: string) {
  await deleteCatalogItem("tactical_medicine", itemId, () => {}, false);
  invalidateCatalogCache("tactical_medicine");
}

export async function reorderTacticalMedicineItems(orderedIds: string[]) {
  const response = await fetch("/api/admin/tactical-medicine/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || "reorder_failed");
  }
  invalidateCatalogCache("tactical_medicine");
}
