"use client";

import { NewsItem } from "@/lib/types";

type AuthorInfoProps = {
  item: NewsItem;
};

function getPositionBadgeClass(position?: string | null) {
  const normalized = (position || "").trim().toLowerCase();
  if (normalized === "младший специалист") return "is-junior";
  if (normalized === "специалист") return "is-specialist";
  if (normalized === "ведущий специалист") return "is-lead";
  if (normalized === "главный специалист") return "is-chief";
  if (normalized === "командир взвода") return "is-commander";
  return "is-default";
}

export function AuthorInfo({ item }: AuthorInfoProps) {
  const name = item.authorInfo?.name?.trim() || "";
  const callsign = item.authorInfo?.callsign?.trim() || "";
  const authorName = [name, callsign].filter(Boolean).join(" ").trim() || item.author?.trim() || "Автор не указан";
  const position = item.authorInfo?.position || item.authorPosition || null;

  return (
    <div className="news-author-info">
      <div className="news-author-name">{authorName}</div>
      {position ? <span className={`admin-users-position-badge ${getPositionBadgeClass(position)}`}>{position}</span> : null}
    </div>
  );
}
