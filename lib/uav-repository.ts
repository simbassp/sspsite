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

type CatalogRow = {
  id: string;
  slug: string;
  kind: "counteraction" | "uav";
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
  kind: "counteraction" | "uav",
  fallback: () => CatalogItem[],
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback();
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  const response = await Promise.race([
    supabase
      .from("catalog_items")
      .select("id,slug,kind,title,category,summary,image,specs,details")
      .eq("kind", kind)
      .order("created_at", { ascending: false }),
    timeoutResult(7000),
  ]);

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
  kind: "counteraction" | "uav",
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
  kind: "counteraction" | "uav",
  input: Omit<CatalogItem, "id"> & { id?: string },
  fallback: (row: Omit<CatalogItem, "id"> & { id?: string }) => CatalogItem,
  allowLocalFallback = true,
) {
  if (!isSupabaseConfigured) return fallback(input);
  const useFallback = shouldUseLocalFallback(allowLocalFallback);
  const supabase = getSupabaseBrowserClient();
  const baseSlug = slugify(input.title) || `${kind}-item`;
  const payload = {
    kind,
    slug: input.id ? `${baseSlug}-${input.id.slice(0, 6)}` : `${baseSlug}-${Date.now().toString(36)}`,
    title: input.title,
    category: input.category,
    summary: input.summary,
    image: input.image,
    specs: input.specs,
    details: input.details,
  };
  const payloadWithId = input.id ? { ...payload, id: input.id } : payload;

  const { data, error } = await supabase
    .from("catalog_items")
    .upsert(payloadWithId, { onConflict: "id" })
    .select("id,slug,kind,title,category,summary,image,specs,details")
    .single();

  if (error || !data) {
    if (useFallback) return fallback(input);
    throw new Error(error?.message || "remote_save_failed");
  }
  return toCatalogItem(data as CatalogRow);
}

async function deleteCatalogItem(
  kind: "counteraction" | "uav",
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

export async function fetchUavItems() {
  try {
    const response = await withTimeoutAndRetry(
      () =>
        fetch("/api/uav", {
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        }),
      7000,
      1,
      "fetch_uav_items_timeout",
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { ok?: boolean; items?: CatalogItem[] };
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

export async function fetchUavById(itemId: string) {
  return fetchCatalogById("uav", itemId, getUavById, false);
}

export async function saveUavItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  return saveCatalogItem("uav", input, upsertUavItem, false);
}

export async function deleteUavItem(itemId: string) {
  return deleteCatalogItem("uav", itemId, removeUavItem, false);
}

export async function fetchCounteractionItems() {
  try {
    const response = await withTimeoutAndRetry(
      () =>
        fetch("/api/counteraction", {
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        }),
      7000,
      1,
      "fetch_counteraction_items_timeout",
    );
    if (!response.ok) return fetchCatalogItems("counteraction", listCounteraction);
    const payload = (await response.json()) as { ok?: boolean; items?: CatalogItem[] };
    if (!payload.ok || !Array.isArray(payload.items)) return fetchCatalogItems("counteraction", listCounteraction);
    return payload.items;
  } catch {
    return fetchCatalogItems("counteraction", listCounteraction);
  }
}

export async function fetchCounteractionById(itemId: string) {
  return fetchCatalogById("counteraction", itemId, getCounteractionById);
}

export async function saveCounteractionItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  return saveCatalogItem("counteraction", input, upsertCounteractionItem);
}

export async function deleteCounteractionItem(itemId: string) {
  return deleteCatalogItem("counteraction", itemId, removeCounteractionItem);
}
