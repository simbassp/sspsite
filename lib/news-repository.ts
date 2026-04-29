"use client";

import { addNews, listNews, removeNewsItem, updateNewsItem } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { withTimeoutAndRetry } from "@/lib/async-utils";
import { NewsItem, NewsTextStyle, Position } from "@/lib/types";

const AUTHOR_POSITIONS: readonly Position[] = [
  "Младший специалист",
  "Специалист",
  "Ведущий специалист",
  "Главный специалист",
  "Командир взвода",
];

function normalizeAuthorPosition(value: string | null | undefined): Position | null {
  if (value == null || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  const matched = AUTHOR_POSITIONS.find((item) => item.toLowerCase() === normalized);
  return matched ?? null;
}

type NewsRow = {
  id: string;
  title: string;
  body?: string;
  text?: string;
  content?: string;
  priority: "high" | "normal";
  author: string;
  author_position?: string | null;
  created_at: string;
  format?: unknown;
};

const NEWS_CACHE_TTL_MS = 60_000;
const NEWS_CACHE_KEY = "ssp_news_cache_v1";
let newsMemoryCache: { ts: number; rows: NewsItem[] } | null = null;
const DEFAULT_NEWS_TEXT_STYLE: NewsTextStyle = {
  fontSize: 16,
  bold: false,
  italic: false,
  underline: false,
};

function normalizeNewsTextStyle(input: unknown): NewsTextStyle {
  if (!input || typeof input !== "object") return DEFAULT_NEWS_TEXT_STYLE;
  const candidate = input as Partial<NewsTextStyle>;
  const fontSizeRaw = Number(candidate.fontSize);
  return {
    fontSize: Number.isFinite(fontSizeRaw) ? Math.min(32, Math.max(12, Math.round(fontSizeRaw))) : 16,
    bold: candidate.bold === true,
    italic: candidate.italic === true,
    underline: candidate.underline === true,
  };
}

function normalizeNewsKind(input: unknown): "news" | "update" {
  if (!input || typeof input !== "object") return "news";
  const candidate = input as { kind?: unknown };
  return candidate.kind === "update" ? "update" : "news";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapNewsRow(row: NewsRow): NewsItem {
  const body = row.body ?? row.text ?? row.content ?? "";
  return {
    id: row.id,
    title: row.title,
    body,
    priority: row.priority === "high" ? "high" : "normal",
    kind: normalizeNewsKind(row.format),
    author: row.author,
    authorPosition: normalizeAuthorPosition(row.author_position),
    createdAt: row.created_at,
    textStyle: normalizeNewsTextStyle(row.format),
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
    const api = await withTimeoutAndRetry(
      () =>
        fetch(`/api/news?limit=${safeLimit}`, {
          method: "GET",
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        }),
      7000,
      1,
      "fetch_news_timeout",
    );
    if (!api.ok) {
      return listNews().slice(0, safeLimit);
    }
    const payload = (await api.json()) as { ok?: boolean; rows?: NewsRow[] };
    if (!payload.ok || !Array.isArray(payload.rows)) {
      return listNews().slice(0, safeLimit);
    }
    const mapped = payload.rows.map(mapNewsRow);
    writeNewsCache(mapped);
    return mapped;
  } catch {
    return listNews().slice(0, safeLimit);
  }
}

export async function createNews(payload: {
  title: string;
  body: string;
  priority: "high" | "normal" | "update";
  author: string;
  textStyle?: NewsTextStyle;
}) {
  const normalizedStyle = normalizeNewsTextStyle(payload.textStyle);
  const normalizedKind = payload.priority === "update" ? "update" : "news";
  const normalizedPriority = payload.priority === "high" ? "high" : "normal";
  const formatPayload = { ...normalizedStyle, kind: normalizedKind } as const;
  if (!isSupabaseConfigured) {
    addNews({ ...payload, priority: normalizedPriority, textStyle: normalizedStyle, kind: normalizedKind });
    return { ok: true as const };
  }

  try {
    const response = await fetch("/api/news", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, priority: normalizedPriority, kind: normalizedKind, textStyle: formatPayload }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      addNews({ ...payload, priority: normalizedPriority, textStyle: normalizedStyle, kind: normalizedKind });
      return { ok: false as const, error: data.error || `request_failed_${response.status}` };
    }
    return { ok: true as const };
  } catch {
    addNews({ ...payload, priority: normalizedPriority, textStyle: normalizedStyle, kind: normalizedKind });
    return { ok: false as const, error: "network_error" };
  }
}

export async function updateNews(input: {
  id: string;
  title: string;
  body: string;
  priority: "high" | "normal" | "update";
  textStyle: NewsTextStyle;
}) {
  const normalizedStyle = normalizeNewsTextStyle(input.textStyle);
  const normalizedKind = input.priority === "update" ? "update" : "news";
  const normalizedPriority = input.priority === "high" ? "high" : "normal";
  const formatPayload = { ...normalizedStyle, kind: normalizedKind } as const;
  if (!isSupabaseConfigured || !isUuidLike(input.id)) {
    updateNewsItem(input.id, {
      title: input.title,
      body: input.body,
      priority: normalizedPriority,
      kind: normalizedKind,
      textStyle: normalizedStyle,
    });
    return { ok: true as const, localOnly: !isSupabaseConfigured || !isUuidLike(input.id) };
  }

  try {
    const response = await fetch(`/api/news/${input.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        priority: normalizedPriority,
        kind: normalizedKind,
        textStyle: formatPayload,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: data.error || `request_failed_${response.status}` };
    }
    return { ok: true as const, localOnly: false };
  } catch {
    return { ok: false as const, error: "network_error" };
  }
}

export async function deleteNews(id: string) {
  if (!isSupabaseConfigured || !isUuidLike(id)) {
    removeNewsItem(id);
    return { ok: true as const, localOnly: !isSupabaseConfigured || !isUuidLike(id) };
  }

  try {
    const response = await fetch(`/api/news/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: data.error || `request_failed_${response.status}` };
    }
    return { ok: true as const, localOnly: false };
  } catch {
    return { ok: false as const, error: "network_error" };
  }
}

export { DEFAULT_NEWS_TEXT_STYLE, normalizeNewsTextStyle };

