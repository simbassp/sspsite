"use client";

import { listNews, addNews } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeoutAndRetry } from "@/lib/async-utils";
import { NewsItem } from "@/lib/types";

type NewsRow = {
  id: string;
  title: string;
  body?: string;
  text?: string;
  content?: string;
  priority: "high" | "normal";
  author: string;
  created_at: string;
};

const NEWS_CACHE_TTL_MS = 60_000;
const NEWS_CACHE_KEY = "ssp_news_cache_v1";
let newsMemoryCache: { ts: number; rows: NewsItem[] } | null = null;

function mapNewsRow(row: NewsRow): NewsItem {
  const body = row.body ?? row.text ?? row.content ?? "";
  return {
    id: row.id,
    title: row.title,
    body,
    priority: row.priority,
    author: row.author,
    createdAt: row.created_at,
  };
}

function readNewsCache(limit: number) {
  const now = Date.now();
  if (newsMemoryCache && now - newsMemoryCache.ts < NEWS_CACHE_TTL_MS) {
    return newsMemoryCache.rows.slice(0, limit);
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; rows?: NewsItem[] };
    if (!parsed.ts || !Array.isArray(parsed.rows)) return null;
    if (now - parsed.ts >= NEWS_CACHE_TTL_MS) return null;
    newsMemoryCache = { ts: parsed.ts, rows: parsed.rows };
    return parsed.rows.slice(0, limit);
  } catch {
    return null;
  }
}

function writeNewsCache(rows: NewsItem[]) {
  const payload = { ts: Date.now(), rows };
  newsMemoryCache = payload;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

export async function fetchNews(limit = 40, forceRefresh = false): Promise<NewsItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  if (!forceRefresh) {
    const cached = readNewsCache(safeLimit);
    if (cached) return cached;
  }
  if (!isSupabaseConfigured) {
    const local = listNews().slice(0, safeLimit);
    writeNewsCache(local);
    return local;
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await withTimeoutAndRetry(
      () =>
        supabase
          .from("news")
          .select("id,title,body,text,content,priority,author,created_at")
          .order("created_at", { ascending: false })
          .limit(safeLimit),
      7000,
      1,
      "fetch_news_timeout",
    );
    if (error || !data) {
      return listNews().slice(0, safeLimit);
    }
    const mapped = (data as NewsRow[]).map(mapNewsRow);
    writeNewsCache(mapped);
    return mapped;
  } catch {
    return listNews().slice(0, safeLimit);
  }
}

export async function createNews(payload: { title: string; body: string; priority: "high" | "normal"; author: string }) {
  if (!isSupabaseConfigured) {
    addNews(payload);
    return { ok: true as const };
  }

  const supabase = getSupabaseBrowserClient();
  let { error } = await supabase.from("news").insert({
    title: payload.title,
    body: payload.body,
    priority: payload.priority,
    author: payload.author,
  });
  if (error && error.message.toLowerCase().includes("body")) {
    // Compatibility fallback for environments where news text column is named differently.
    const retry = await supabase.from("news").insert({
      title: payload.title,
      text: payload.body,
      priority: payload.priority,
      author: payload.author,
    });
    error = retry.error;
  }

  if (error) {
    addNews(payload);
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}
