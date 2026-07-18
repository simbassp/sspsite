"use client";

import type { ReactNode } from "react";
import { getPositionBadgeClass } from "@/lib/position-ui";
import {
  formatNewsDateParts,
  getAuthorDisplayName,
  getAuthorInitials,
  getNewsCategory,
  getNewsCategoryLabel,
  isLongNewsBody,
  type NewsCategory,
} from "@/lib/news-ui";
import { NewsBody } from "@/lib/news-text";
import { normalizeNewsTextStyle } from "@/lib/news-repository";
import type { NewsItem } from "@/lib/types";

type NewsMessageCardProps = {
  item: NewsItem;
  expanded: boolean;
  canEdit?: boolean;
  editing?: boolean;
  onToggleView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  editForm?: ReactNode;
};

function CategoryIcon({ category }: { category: NewsCategory }) {
  if (category === "update") {
    return (
      <svg viewBox="0 0 24 24" className="news-message-card__icon-svg" aria-hidden>
        <path d="M20 12a8 8 0 1 1-2.3-5.7" />
        <path d="M20 4v5h-5" />
      </svg>
    );
  }
  if (category === "high") {
    return (
      <svg viewBox="0 0 24 24" className="news-message-card__icon-svg" aria-hidden>
        <path d="M12 2.5 14.6 9H22l-6 4.5 2.3 7L12 17.8 5.7 20.5 8 13.5 2 9h7.4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="news-message-card__icon-svg" aria-hidden>
      <rect x="4" y="4" width="13" height="16" rx="2" />
      <path d="M17 7h3v11a2 2 0 0 1-2 2" />
      <line x1="7" y1="9" x2="14" y2="9" />
      <line x1="7" y1="13" x2="14" y2="13" />
    </svg>
  );
}

export function NewsMessageCard({
  item,
  expanded,
  canEdit = false,
  editing = false,
  onToggleView,
  onEdit,
  onDelete,
  editForm,
}: NewsMessageCardProps) {
  const category = getNewsCategory(item);
  const { date, time } = formatNewsDateParts(item.createdAt);
  const authorName = getAuthorDisplayName(item);
  const authorInitials = getAuthorInitials(item);
  const position = item.authorProfile?.position ?? item.authorInfo?.position ?? item.authorPosition ?? null;
  const textStyle = normalizeNewsTextStyle(item.textStyle);
  const longBody = isLongNewsBody(item.body);

  if (editing && editForm) {
    return (
      <article className={`news-message-card is-${category}`}>
        <div className="news-message-card__accent" aria-hidden />
        <div className="card-body news-message-card__inner">{editForm}</div>
      </article>
    );
  }

  return (
    <article className={`news-message-card is-${category}`}>
      <div className="news-message-card__accent" aria-hidden />
      <div className="card-body news-message-card__inner">
        <div className="news-message-card__main">
          <span className={`news-message-card__icon is-${category}`}>
            <CategoryIcon category={category} />
          </span>
          <div className="news-message-card__content">
            <span className={`news-message-card__badge is-${category}`}>{getNewsCategoryLabel(category)}</span>
            <h3 className="news-message-card__title">{item.title}</h3>
            <div
              className={`news-message-card__body${expanded ? " is-expanded" : ""}${longBody ? " is-clamped" : ""}`}
            >
              <NewsBody
                className="news-message-card__text"
                style={{
                  fontWeight: textStyle.bold ? 700 : 400,
                  fontStyle: textStyle.italic ? "italic" : "normal",
                  textDecoration: textStyle.underline ? "underline" : "none",
                }}
                body={item.body}
              />
            </div>
            <div className="news-message-card__meta">
              <svg viewBox="0 0 24 24" className="news-message-card__meta-icon" aria-hidden>
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="8" y1="3" x2="8" y2="7" />
                <line x1="16" y1="3" x2="16" y2="7" />
              </svg>
              <span>{date}</span>
              <span className="news-message-card__meta-sep" aria-hidden>
                ·
              </span>
              <span>{time}</span>
            </div>
          </div>
        </div>

        <div className="news-message-card__aside">
          <div className="news-message-card__author">
            <span className="news-message-card__author-avatar" aria-hidden>
              {authorInitials}
            </span>
            <span className="news-message-card__author-copy">
              <strong>{authorName}</strong>
              {position ? (
                <span className={`admin-users-position-badge ${getPositionBadgeClass(position)}`}>{position}</span>
              ) : (
                <small>Сотрудник</small>
              )}
            </span>
          </div>

          <div className="news-message-card__actions">
            <button type="button" className="btn news-message-card__action-btn" onClick={onToggleView}>
              <svg viewBox="0 0 24 24" className="news-message-card__action-icon" aria-hidden>
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                <circle cx="12" cy="12" r="2.8" />
              </svg>
              {expanded ? "Свернуть" : "Просмотр"}
            </button>
            {canEdit && onEdit ? (
              <button type="button" className="btn news-message-card__action-btn" onClick={onEdit}>
                <svg viewBox="0 0 24 24" className="news-message-card__action-icon" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Редактировать
              </button>
            ) : null}
            {canEdit && onDelete ? (
              <button type="button" className="btn news-message-card__action-btn is-danger" onClick={onDelete}>
                <svg viewBox="0 0 24 24" className="news-message-card__action-icon" aria-hidden>
                  <path d="M4 7h16" />
                  <path d="M9 7V5h6v2" />
                  <rect x="6" y="7" width="12" height="13" rx="2" />
                </svg>
                Удалить
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
