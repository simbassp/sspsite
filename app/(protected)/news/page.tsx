"use client";

import { useEffect, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import { canManageNews } from "@/lib/permissions";
import { isUpdateNews, NewsBody } from "@/lib/news-text";
import { deleteNews, fetchNews, normalizeNewsTextStyle, updateNews } from "@/lib/news-repository";
import { NewsItem } from "@/lib/types";

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "update">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const session = readClientSession();
  const canEditNews = canManageNews(session);

  const load = async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchNews(40, forceRefresh);
      setNews(rows);
    } catch {
      setError("Не удалось загрузить новости. Проверьте интернет и попробуйте снова.");
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = news.filter((item) => {
    if (filter === "high") return item.priority === "high";
    if (filter === "update") return isUpdateNews(item);
    return true;
  });

  const onEdit = async (item: NewsItem) => {
    const nextTitle = window.prompt("Заголовок новости", item.title)?.trim();
    if (!nextTitle) return;
    const nextBody = window.prompt("Текст новости", item.body)?.trim();
    if (!nextBody) return;
    const nextPriorityRaw = window.prompt('Приоритет: "normal" или "high"', item.priority)?.trim().toLowerCase();
    const nextPriority = nextPriorityRaw === "high" ? "high" : "normal";

    const result = await updateNews({
      id: item.id,
      title: nextTitle,
      body: nextBody,
      priority: nextPriority,
      textStyle: normalizeNewsTextStyle(item.textStyle),
    });
    setInfo(result.ok ? "Новость обновлена." : `Ошибка обновления: ${result.error}`);
    await load(true);
  };

  const onDelete = async (item: NewsItem) => {
    const ok = window.confirm(`Удалить новость "${item.title}"?`);
    if (!ok) return;
    const result = await deleteNews(item.id);
    setInfo(result.ok ? "Новость удалена." : `Ошибка удаления: ${result.error}`);
    await load(true);
  };

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
        <button className={`chip ${filter === "update" ? "active" : ""}`} onClick={() => setFilter("update")} type="button">
          Update
        </button>
      </div>
      {info && (
        <p className="page-subtitle" style={{ marginTop: 10 }}>
          {info}
        </p>
      )}

      <div className="list" style={{ marginTop: 12 }}>
        {loading && (
          <>
            <p className="page-subtitle">Загрузка новостей...</p>
            {[1, 2].map((i) => (
              <article className="card" key={`news-skeleton-${i}`}>
                <div className="card-body">
                  <p className="label">Загружаем карточку...</p>
                </div>
              </article>
            ))}
          </>
        )}
        {!loading && !!error && (
          <article className="card">
            <div className="card-body form">
              <p className="page-subtitle">{error}</p>
              <button className="btn" type="button" onClick={() => void load(true)}>
                Повторить
              </button>
            </div>
          </article>
        )}
        {!loading && !error && !visible.length && <p className="page-subtitle">Новости пока отсутствуют.</p>}
        {visible.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className={`pill ${item.priority === "high" ? "pill-red" : ""}`}>
                  {item.priority === "high" ? "Важно" : isUpdateNews(item) ? "Update" : "Новость"}
                </span>
                <span>{formatDate(item.createdAt)}</span>
                <span>{item.author || "Автор не указан"}</span>
              </div>
              {canEditNews && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="btn"
                    style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                    type="button"
                    title="Редактировать"
                    aria-label={`Редактировать ${item.title}`}
                    onClick={() => void onEdit(item)}
                  >
                    ✏
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                    type="button"
                    title="Удалить"
                    aria-label={`Удалить ${item.title}`}
                    onClick={() => void onDelete(item)}
                  >
                    🗑
                  </button>
                </div>
              )}
              <NewsBody
                className="page-subtitle"
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontSize: normalizeNewsTextStyle(item.textStyle).fontSize,
                  fontWeight: normalizeNewsTextStyle(item.textStyle).bold ? 700 : 400,
                  fontStyle: normalizeNewsTextStyle(item.textStyle).italic ? "italic" : "normal",
                  textDecoration: normalizeNewsTextStyle(item.textStyle).underline ? "underline" : "none",
                }}
                body={item.body}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
