"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { getUavById, listUav, removeUavItem, upsertUavItem } from "@/lib/storage";
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

export async function fetchUavItems() {
  if (!isSupabaseConfigured) {
    return listUav();
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id,slug,kind,title,category,summary,image,specs,details")
    .eq("kind", "uav")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listUav();
  }
  return (data as CatalogRow[]).map(toCatalogItem);
}

export async function fetchUavById(itemId: string) {
  if (!isSupabaseConfigured) {
    return getUavById(itemId);
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id,slug,kind,title,category,summary,image,specs,details")
    .eq("kind", "uav")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data) {
    return getUavById(itemId);
  }
  return toCatalogItem(data as CatalogRow);
}

export async function saveUavItem(input: Omit<CatalogItem, "id"> & { id?: string }) {
  if (!isSupabaseConfigured) {
    return upsertUavItem(input);
  }
  const supabase = getSupabaseBrowserClient();
  const baseSlug = slugify(input.title) || "uav-item";
  const payload = {
    kind: "uav" as const,
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
    return upsertUavItem(input);
  }
  return toCatalogItem(data as CatalogRow);
}

export async function deleteUavItem(itemId: string) {
  if (!isSupabaseConfigured) {
    removeUavItem(itemId);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("catalog_items").delete().eq("id", itemId).eq("kind", "uav");
  if (error) {
    removeUavItem(itemId);
  }
}
