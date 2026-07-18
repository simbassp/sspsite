import { isUpdateNews } from "@/lib/news-text";
import type { NewsItem } from "@/lib/types";

export type NewsFilter = "all" | "high" | "update" | "news";

export type NewsCategory = "high" | "update" | "news";

export function getNewsCategory(item: NewsItem): NewsCategory {
  if (item.priority === "high") return "high";
  if (isUpdateNews(item)) return "update";
  return "news";
}

export function matchesNewsFilter(item: NewsItem, filter: NewsFilter) {
  if (filter === "all") return true;
  return getNewsCategory(item) === filter;
}

export function countNewsByFilter(items: NewsItem[]) {
  return {
    all: items.length,
    high: items.filter((item) => getNewsCategory(item) === "high").length,
    update: items.filter((item) => getNewsCategory(item) === "update").length,
    news: items.filter((item) => getNewsCategory(item) === "news").length,
  };
}

export function getNewsCategoryLabel(category: NewsCategory) {
  if (category === "high") return "Важное";
  if (category === "update") return "Update";
  return "Новость";
}

export function isLongNewsBody(body: string) {
  const normalized = body.trim();
  if (normalized.length > 240) return true;
  return normalized.split("\n").length > 4;
}

export function formatNewsDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "—", time: "—" };
  }
  return {
    date: date.toLocaleDateString("ru-RU"),
    time: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function getAuthorDisplayName(item: NewsItem) {
  const profile = item.authorProfile ?? item.authorInfo;
  const name = profile?.name?.trim() || "";
  const callsign = profile?.callsign?.trim() || "";
  const combined = [name, callsign].filter(Boolean).join(" ").trim();
  return combined || item.author?.trim() || "Автор не указан";
}

export function getAuthorInitials(item: NewsItem) {
  const source = getAuthorDisplayName(item);
  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}
