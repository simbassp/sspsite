"use client";

import { listNews, addNews } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
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

export async function fetchNews(): Promise<NewsItem[]> {
  if (!isSupabaseConfigured) {
    return listNews();
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listNews();
  }

  return (data as NewsRow[]).map(mapNewsRow);
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
