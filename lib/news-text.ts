import React from "react";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderNewsBodyHtml(raw: string) {
  const escaped = escapeHtml(raw);
  return escaped
    .replaceAll(/\[size=(\d{1,2})\]([\s\S]*?)\[\/size\]/gi, (_m, px, content) => {
      const safe = Math.min(32, Math.max(12, Number(px) || 16));
      return `<span style="font-size:${safe}px">${content}</span>`;
    })
    .replaceAll(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>")
    .replaceAll(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>")
    .replaceAll(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>")
    .replaceAll(/\n/g, "<br/>");
}

export function applyMarkupToSelection(input: {
  value: string;
  start: number;
  end: number;
  tag: "b" | "i" | "u" | "size";
  sizePx?: number;
}) {
  const normalizedPx = Math.min(32, Math.max(12, Math.round(input.sizePx || 16)));
  const open = input.tag === "size" ? `[size=${normalizedPx}]` : `[${input.tag}]`;
  const close = input.tag === "size" ? "[/size]" : `[/${input.tag}]`;
  const left = input.value.slice(0, input.start);
  const selected = input.value.slice(input.start, input.end);
  const right = input.value.slice(input.end);
  const wrapped = `${open}${selected || "текст"}${close}`;
  const nextValue = `${left}${wrapped}${right}`;
  const caretStart = input.start + open.length;
  const caretEnd = input.start + open.length + (selected || "текст").length;
  return { nextValue, caretStart, caretEnd };
}

export function isUpdateNews(item: { title: string; body: string; kind?: "news" | "update" }) {
  if (item.kind === "update") return true;
  const source = `${item.title} ${item.body}`.toLowerCase();
  return source.includes("update") || source.includes("обнов");
}

export const NewsBody = React.memo(function NewsBody({
  body,
  className,
  style,
}: {
  body: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return React.createElement("p", {
    className,
    style,
    dangerouslySetInnerHTML: { __html: renderNewsBodyHtml(body) },
  });
});
