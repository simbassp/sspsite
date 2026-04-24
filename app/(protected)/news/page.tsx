"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { fetchNews } from "@/lib/news-repository";
import { NewsItem } from "@/lib/types";

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<"all" | "high">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNews()
      .then((rows) => setNews(rows))
      .finally(() => setLoading(false));
  }, []);

  const visible = news.filter((item) => (filter === "all" ? true : item.priority === "high"));

  return (
    <section>
      <h1 className="page-title">Новости</h1>
      <p className="page-subtitle">Карточки сообщений с быстрым фильтром по важности.</p>

      <div className="chips">
        <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")} type="button">
          Все
        </button>
        <button className={`chip ${filter === "high" ? "active" : ""}`} onClick={() => setFilter("high")} type="button">
          Важные
        </button>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {loading && <p className="page-subtitle">Загрузка новостей...</p>}
        {visible.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className={`pill ${item.priority === "high" ? "pill-red" : ""}`}>
                  {item.priority === "high" ? "Важно" : "Новость"}
                </span>
                <span>{formatDate(item.createdAt)}</span>
                <span>{item.author}</span>
              </div>
              <p className="page-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
                {item.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
