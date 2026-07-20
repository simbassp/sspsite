import type { NewsTextStyle } from "@/lib/types";

export type NewsKind = "news" | "update";
export type NewsPriority = "high" | "normal";

export function normalizeNewsKindValue(input: unknown): NewsKind {
  return input === "update" ? "update" : "news";
}

export function normalizeNewsPriorityValue(input: unknown): NewsPriority {
  return input === "high" ? "high" : "normal";
}

export function readNewsKindFromRow(row: { kind?: unknown; format?: unknown }): NewsKind {
  if (row.kind === "update") return "update";
  if (!row.format || typeof row.format !== "object") return "news";
  return normalizeNewsKindValue((row.format as { kind?: unknown }).kind);
}

export function readNewsPriorityFromRow(row: { priority?: unknown; format?: unknown }): NewsPriority {
  if (row.priority === "high") return "high";
  if (!row.format || typeof row.format !== "object") return "normal";
  return normalizeNewsPriorityValue((row.format as { priority?: unknown }).priority);
}

export function buildNewsFormatPayload(textStyle: NewsTextStyle, kind: NewsKind, priority: NewsPriority) {
  return { ...textStyle, kind, priority };
}
