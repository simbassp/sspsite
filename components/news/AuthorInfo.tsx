"use client";

import { Position } from "@/lib/types";

type AuthorInfoProps = {
  author?:
    | {
        id?: string | null;
        name?: string | null;
        callsign?: string | null;
        position?: Position | null;
      }
    | null;
  fallbackName?: string | null;
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

export function AuthorInfo({ author, fallbackName }: AuthorInfoProps) {
  const name = author?.name?.trim() || "";
  const callsign = author?.callsign?.trim() || "";
  const authorName = [name, callsign].filter(Boolean).join(" ").trim() || fallbackName?.trim() || "Автор не указан";
  const position = author?.position || null;

  return (
    <div className="news-author-info">
      <div className="news-author-name">{authorName}</div>
      {position ? <span className={`admin-users-position-badge ${getPositionBadgeClass(position)}`}>{position}</span> : null}
    </div>
  );
}
