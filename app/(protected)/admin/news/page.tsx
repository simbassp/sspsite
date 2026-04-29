"use client";

import { FormEvent, useEffect, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import {
  createNews,
  DEFAULT_NEWS_TEXT_STYLE,
  deleteNews,
  fetchNews,
  normalizeNewsTextStyle,
  updateNews,
} from "@/lib/news-repository";
import { NewsItem } from "@/lib/types";

export default function AdminNewsPage() {
  const session = readClientSession();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"high" | "normal">("normal");
  const [textStyle, setTextStyle] = useState(DEFAULT_NEWS_TEXT_STYLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
          author: session?.name || session?.callsign || "Редактор",
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
    await refresh();
  };

  const onEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setPriority(item.priority);
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

  return (
    <section>
      <h1 className="page-title">Админ / Новости</h1>
      <div className="card">
        <div className="card-body">
          <form className="form" onSubmit={onSubmit}>
            <input className="input" placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea
              className="input"
              placeholder="Текст новости"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 120 }}
              required
            />
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="normal">Обычная</option>
              <option value="high">Важная</option>
            </select>
            <div className="grid grid-two">
              <div>
                <label className="label">Размер шрифта</label>
                <input
                  className="input"
                  type="number"
                  min={12}
                  max={32}
                  value={textStyle.fontSize}
                  onChange={(e) =>
                    setTextStyle((prev) => ({ ...prev, fontSize: Math.min(32, Math.max(12, Number(e.target.value) || 16)) }))
                  }
                />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={textStyle.bold}
                    onChange={(e) => setTextStyle((prev) => ({ ...prev, bold: e.target.checked }))}
                  />
                  Жирный
                </label>
                <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={textStyle.italic}
                    onChange={(e) => setTextStyle((prev) => ({ ...prev, italic: e.target.checked }))}
                  />
                  Курсив
                </label>
                <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={textStyle.underline}
                    onChange={(e) => setTextStyle((prev) => ({ ...prev, underline: e.target.checked }))}
                  />
                  Подчеркнутый
                </label>
              </div>
            </div>
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
        {news.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
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
              <p
                className="page-subtitle"
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: normalizeNewsTextStyle(item.textStyle).fontSize,
                  fontWeight: normalizeNewsTextStyle(item.textStyle).bold ? 700 : 400,
                  fontStyle: normalizeNewsTextStyle(item.textStyle).italic ? "italic" : "normal",
                  textDecoration: normalizeNewsTextStyle(item.textStyle).underline ? "underline" : "none",
                }}
              >
                {item.body}
              </p>
            </div>
          </article>
        ))}
        {!isLoading && !loadError && !news.length && <p className="page-subtitle">Новостей пока нет.</p>}
      </div>
    </section>
  );
}
