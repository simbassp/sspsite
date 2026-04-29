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
    .replaceAll(/\[b\](.*?)\[\/b\]/gis, "<strong>$1</strong>")
    .replaceAll(/\[i\](.*?)\[\/i\]/gis, "<em>$1</em>")
    .replaceAll(/\[u\](.*?)\[\/u\]/gis, "<u>$1</u>")
    .replaceAll(/\n/g, "<br/>");
}

export function applyMarkupToSelection(input: {
  value: string;
  start: number;
  end: number;
  tag: "b" | "i" | "u";
}) {
  const open = `[${input.tag}]`;
  const close = `[/${input.tag}]`;
  const left = input.value.slice(0, input.start);
  const selected = input.value.slice(input.start, input.end);
  const right = input.value.slice(input.end);
  const wrapped = `${open}${selected || "текст"}${close}`;
  const nextValue = `${left}${wrapped}${right}`;
  const caretStart = input.start + open.length;
  const caretEnd = input.start + open.length + (selected || "текст").length;
  return { nextValue, caretStart, caretEnd };
}

export function isUpdateNews(item: { title: string; body: string }) {
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
  return <p className={className} style={style} dangerouslySetInnerHTML={{ __html: renderNewsBodyHtml(body) }} />;
});
