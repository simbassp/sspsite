"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  getCounteractionById,
  getUavById,
  listCounteraction,
  listUav,
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

async function fetchCatalogItems(kind: "counteraction" | "uav", fallback: () => CatalogItem[]) {
  if (!isSupabaseConfigured) return fallback();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id,slug,kind,title,category,summary,image,specs,details")
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return fallback();
  }
  const mapped = (data as CatalogRow[]).map(toCatalogItem);
  if (mapped.length === 0) {
    return fallback();
  }
  return mapped;
}

async function fetchCatalogById(
  kind: "counteraction" | "uav",
  itemId: string,
  fallback: (id: string) => CatalogItem | null,
) {
  if (!isSupabaseConfigured) return fallback(itemId);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id,slug,kind,title,category,summary,image,specs,details")
    .eq("kind", kind)
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data) {
    return fallback(itemId);
  }
  return toCatalogItem(data as CatalogRow);
}

async function saveCatalogItem(
  kind: "counteraction" | "uav",
  input: Omit<CatalogItem, "id"> & { id?: string },
  fallback: (row: Omit<CatalogItem, "id"> & { id?: string }) => CatalogItem,
) {
  if (!isSupabaseConfigured) return fallback(input);
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
    return fallback(input);
  }
  return toCatalogItem(data as CatalogRow);
}

async function deleteCatalogItem(
  kind: "counteraction" | "uav",
  itemId: string,
  fallback: (id: string) => void,
) {
  if (!isSupabaseConfigured) return fallback(itemId);
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("catalog_items").delete().eq("id", itemId).eq("kind", kind);
  if (error) {
    fallback(itemId);
  }
}

export async function fetchUavItems() {
  return fetchCatalogItems("uav", listUav);
}

export async function fetchUavById(itemId: string) {
  return fetchCatalogById("uav", itemId, getUavById);
}

export async function saveUavItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  return saveCatalogItem("uav", input, upsertUavItem);
}

export async function deleteUavItem(itemId: string) {
  return deleteCatalogItem("uav", itemId, removeUavItem);
}

export async function fetchCounteractionItems() {
  return fetchCatalogItems("counteraction", listCounteraction);
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
