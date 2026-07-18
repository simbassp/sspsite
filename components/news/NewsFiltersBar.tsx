"use client";

import type { NewsFilter } from "@/lib/news-ui";

type NewsFiltersBarProps = {
  filter: NewsFilter;
  counts: Record<NewsFilter, number>;
  canCreate?: boolean;
  onFilterChange: (filter: NewsFilter) => void;
  onCreate?: () => void;
};

const FILTER_ITEMS: Array<{
  key: NewsFilter;
  label: string;
  icon: "all" | "star" | "update" | "news";
}> = [
  { key: "all", label: "Все", icon: "all" },
  { key: "high", label: "Важные", icon: "star" },
  { key: "update", label: "Обновления", icon: "update" },
  { key: "news", label: "Новости", icon: "news" },
];

function FilterIcon({ type }: { type: "all" | "star" | "update" | "news" }) {
  if (type === "star") {
    return (
      <svg viewBox="0 0 24 24" className="news-page-filter__icon" aria-hidden>
        <path d="M12 2.5 14.6 9H22l-6 4.5 2.3 7L12 17.8 5.7 20.5 8 13.5 2 9h7.4z" />
      </svg>
    );
  }
  if (type === "update") {
    return <span className="news-page-filter__dot is-green" aria-hidden />;
  }
  if (type === "news") {
    return <span className="news-page-filter__dot is-blue" aria-hidden />;
  }
  return null;
}

export function NewsFiltersBar({ filter, counts, canCreate = false, onFilterChange, onCreate }: NewsFiltersBarProps) {
  return (
    <div className="news-page-toolbar">
      <div className="news-page-filters" role="tablist" aria-label="Фильтр новостей">
        {FILTER_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            className={`news-page-filter${filter === item.key ? " is-active" : ""}`}
            onClick={() => onFilterChange(item.key)}
          >
            {item.icon !== "all" ? <FilterIcon type={item.icon} /> : null}
            <span>
              {item.label} {counts[item.key]}
            </span>
          </button>
        ))}
      </div>
      {canCreate ? (
        <button type="button" className="btn btn-primary news-page-create-btn" onClick={onCreate}>
          <svg viewBox="0 0 24 24" className="news-page-create-btn__icon" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Создать сообщение
        </button>
      ) : null}
    </div>
  );
}
