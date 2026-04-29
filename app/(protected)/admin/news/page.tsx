"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import {
  createNews,
  DEFAULT_NEWS_TEXT_STYLE,
  deleteNews,
  fetchNews,
  normalizeNewsTextStyle,
  updateNews,
} from "@/lib/news-repository";
import { applyMarkupToSelection, isUpdateNews, NewsBody } from "@/lib/news-text";
import { isPlaceholderNewsAuthor } from "@/lib/news-author";
import { NewsItem } from "@/lib/types";

export default function AdminNewsPage() {
  const session = readClientSession();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"high" | "normal" | "update">("normal");
  const [textStyle, setTextStyle] = useState(DEFAULT_NEWS_TEXT_STYLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<"all" | "high" | "update">("all");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const refresh = async (force = false) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const rows = await fetchNews(40, force);
      setNews(rows);
    } catch {
      setLoadError("Не удалось загрузить новости. Попробуйте снова.");
      setNews([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editingId
      ? await updateNews({
          id: editingId,
          title,
          body,
          priority,
          textStyle,
        })
      : await createNews({
          title,
          body,
          priority,
          author: "",
          textStyle,
        });
    if (!result.ok) {
      setInfo(`Ошибка: ${result.error}`);
    } else {
      setInfo(editingId ? "Новость обновлена." : "Новость опубликована.");
    }
    setEditingId(null);
    setTitle("");
    setBody("");
    setPriority("normal");
    setTextStyle(DEFAULT_NEWS_TEXT_STYLE);
    await refresh(true);
  };

  const onEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setPriority(item.kind === "update" ? "update" : item.priority);
    setTextStyle(normalizeNewsTextStyle(item.textStyle));
    setInfo("");
  };

  const onDelete = async (item: NewsItem) => {
    const ok = typeof window === "undefined" ? true : window.confirm(`Удалить новость "${item.title}"?`);
    if (!ok) return;
    const result = await deleteNews(item.id);
    setInfo(result.ok ? "Новость удалена." : `Ошибка удаления: ${result.error}`);
    await refresh(true);
  };

  const applySelectionTag = (tag: "b" | "i" | "u") => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const next = applyMarkupToSelection({
      value,
      start: selectionStart,
      end: selectionEnd,
      tag,
    });
    setBody(next.nextValue);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.caretStart, next.caretEnd);
    });
  };

  const getPositionBadgeClass = (position?: string | null) => {
    const normalized = (position || "").trim().toLowerCase();
    if (normalized === "младший специалист") return "is-junior";
    if (normalized === "специалист") return "is-specialist";
    if (normalized === "ведущий специалист") return "is-lead";
    if (normalized === "главный специалист") return "is-chief";
    if (normalized === "командир взвода") return "is-commander";
    return "is-default";
  };

  const visibleNews = news.filter((item) => {
    if (filter === "high") return item.priority === "high";
    if (filter === "update") return isUpdateNews(item);
    return true;
  });

  return (
    <section>
      <h1 className="page-title">Админ / Новости</h1>
      <div className="card">
        <div className="card-body">
          <form className="form" onSubmit={onSubmit}>
            <div className="chips" style={{ marginBottom: 4 }}>
              <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")} type="button">
                Все
              </button>
              <button className={`chip ${filter === "high" ? "active" : ""}`} onClick={() => setFilter("high")} type="button">
                Важные
              </button>
              <button
                className={`chip ${filter === "update" ? "active" : ""}`}
                onClick={() => setFilter("update")}
                type="button"
              >
                Update
              </button>
            </div>
            <input className="input" placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea
              ref={bodyRef}
              className="input"
              placeholder="Текст новости"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 120 }}
              required
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={() => applySelectionTag("b")}>
                Жирный
              </button>
              <button className="btn" type="button" onClick={() => applySelectionTag("i")}>
                Курсив
              </button>
              <button className="btn" type="button" onClick={() => applySelectionTag("u")}>
                Подчеркнутый
              </button>
            </div>
            <div
              className="card"
              style={{ marginTop: 2, borderStyle: "dashed", borderColor: "var(--line)", background: "transparent" }}
            >
              <div className="card-body">
                <p className="label" style={{ marginBottom: 8 }}>
                  Предпросмотр
                </p>
                <NewsBody
                  className="page-subtitle"
                  style={{
                    marginTop: 0,
                    marginBottom: 0,
                    fontWeight: textStyle.bold ? 700 : 400,
                    fontStyle: textStyle.italic ? "italic" : "normal",
                    textDecoration: textStyle.underline ? "underline" : "none",
                  }}
                  body={body || "Текст новости"}
                />
              </div>
            </div>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="normal">Обычная</option>
              <option value="high">Важная</option>
              <option value="update">Update</option>
            </select>
            <button className="btn btn-primary" type="submit">
              {editingId ? "Сохранить изменения" : "Опубликовать"}
            </button>
            {editingId && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTitle("");
                  setBody("");
                  setPriority("normal");
                  setTextStyle(DEFAULT_NEWS_TEXT_STYLE);
                }}
              >
                Отменить редактирование
              </button>
            )}
            {info && <p className="page-subtitle">{info}</p>}
          </form>
        </div>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {isLoading && <p className="page-subtitle">Загрузка...</p>}
        {!isLoading && !!loadError && (
          <div className="form">
            <p className="page-subtitle">{loadError}</p>
            <button className="btn" type="button" onClick={() => void refresh(true)}>
              Повторить
            </button>
          </div>
        )}
        {visibleNews.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className={`pill ${item.priority === "high" ? "pill-red" : ""}`}>
                  {item.priority === "high" ? "Важно" : isUpdateNews(item) ? "Update" : "Новость"}
                </span>
                <span>{formatDate(item.createdAt)}</span>
                {item.author && !isPlaceholderNewsAuthor(item.author) ? <span>{item.author}</span> : null}
                {item.authorPosition ? (
                  <span className={`admin-users-position-badge ${getPositionBadgeClass(item.authorPosition)}`}>
                    {item.authorPosition}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="btn"
                  style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                  type="button"
                  title="Редактировать"
                  aria-label={`Редактировать ${item.title}`}
                  onClick={() => onEdit(item)}
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
              <NewsBody
                className="page-subtitle"
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontWeight: normalizeNewsTextStyle(item.textStyle).bold ? 700 : 400,
                  fontStyle: normalizeNewsTextStyle(item.textStyle).italic ? "italic" : "normal",
                  textDecoration: normalizeNewsTextStyle(item.textStyle).underline ? "underline" : "none",
                }}
                body={item.body}
              />
            </div>
          </article>
        ))}
        {!isLoading && !loadError && !news.length && <p className="page-subtitle">Новостей пока нет.</p>}
      </div>
    </section>
  );
}
