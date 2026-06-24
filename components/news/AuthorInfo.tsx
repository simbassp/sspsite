"use client";

import { getPositionBadgeClass } from "@/lib/position-ui";

type AuthorInfoProps = {
  author?:
    | {
        id?: string | null;
        name?: string | null;
        callsign?: string | null;
        position?: string | null;
      }
    | null;
  fallbackName?: string | null;
};

export function AuthorInfo({ author, fallbackName }: AuthorInfoProps) {
  const name = author?.name?.trim() || "";
  const callsign = author?.callsign?.trim() || "";
  const authorName = [name, callsign].filter(Boolean).join(" ").trim() || fallbackName?.trim() || "Автор не указан";
  const position = author?.position || null;

  return (
    <div className="news-author-info">
      <div className="news-author-row">
        <div className="news-author-name">{authorName}</div>
        {position ? (
          <span className={`admin-users-position-badge ${getPositionBadgeClass(position)}`}>{position}</span>
        ) : null}
      </div>
    </div>
  );
}
