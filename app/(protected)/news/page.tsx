"use client";

import { useEffect, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import { canManageNews } from "@/lib/permissions";
import { applyMarkupToSelection, isUpdateNews, NewsBody } from "@/lib/news-text";
import { deleteNews, fetchNews, normalizeNewsTextStyle, updateNews } from "@/lib/news-repository";
import { AuthorInfo } from "@/components/news/AuthorInfo";
import { NewsItem } from "@/lib/types";

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "update">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const session = readClientSession();
  const canEditNews = canManageNews(session);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; body: string; priority: "normal" | "high" | "update" }>({
    title: "",
    body: "",
    priority: "normal",
  });
  const editBodyRef = useRef<HTMLTextAreaElement | null>(null);

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

  const visible = news
    .filter((item) => {
      if (filter === "high") return item.priority === "high";
      if (filter === "update") return isUpdateNews(item);
      return true;
    })
    .sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
    });

  const startEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      body: item.body,
      priority: item.kind === "update" ? "update" : item.priority,
    });
  };

  const saveEdit = async (item: NewsItem) => {
    const nextTitle = editDraft.title.trim();
    const nextBody = editDraft.body.trim();
    if (!nextTitle || !nextBody) {
      setInfo("Заполните заголовок и текст.");
      return;
    }
    const result = await updateNews({
      id: item.id,
      title: nextTitle,
      body: nextBody,
      priority: editDraft.priority,
      textStyle: normalizeNewsTextStyle(item.textStyle),
    });
    setInfo(result.ok ? "Новость обновлена." : `Ошибка обновления: ${result.error}`);
    setEditingId(null);
    if ("localOnly" in result && result.localOnly) {
      setNews((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                title: nextTitle,
                body: nextBody,
                priority: editDraft.priority === "high" ? "high" : "normal",
                kind: editDraft.priority === "update" ? "update" : "news",
              }
            : entry,
        ),
      );
      return;
    }
    await load(true);
  };

  const applyEditSelectionTag = (tag: "b" | "i" | "u") => {
    const textarea = editBodyRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const next = applyMarkupToSelection({ value, start: selectionStart, end: selectionEnd, tag });
    setEditDraft((prev) => ({ ...prev, body: next.nextValue }));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.caretStart, next.caretEnd);
    });
  };

  const onDelete = async (item: NewsItem) => {
    const ok = window.confirm(`Удалить новость "${item.title}"?`);
    if (!ok) return;
    const result = await deleteNews(item.id);
    setInfo(result.ok ? "Новость удалена." : `Ошибка удаления: ${result.error}`);
    if ("localOnly" in result && result.localOnly) {
      setNews((prev) => prev.filter((entry) => entry.id !== item.id));
      return;
    }
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
              {editingId === item.id ? (
                <div className="form" style={{ marginBottom: 4 }}>
                  <input
                    className="input"
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Заголовок"
                  />
                  <textarea
                    ref={editBodyRef}
                    className="input"
                    value={editDraft.body}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, body: e.target.value }))}
                    placeholder="Текст новости"
                    style={{ minHeight: 100 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" type="button" onClick={() => applyEditSelectionTag("b")}>
                      Жирный
                    </button>
                    <button className="btn" type="button" onClick={() => applyEditSelectionTag("i")}>
                      Курсив
                    </button>
                    <button className="btn" type="button" onClick={() => applyEditSelectionTag("u")}>
                      Подчеркнутый
                    </button>
                  </div>
                  <select
                    className="select"
                    value={editDraft.priority}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, priority: e.target.value as typeof prev.priority }))}
                  >
                    <option value="normal">Обычная</option>
                    <option value="high">Важная</option>
                    <option value="update">Update</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" type="button" onClick={() => void saveEdit(item)}>
                      Сохранить
                    </button>
                    <button className="btn" type="button" onClick={() => setEditingId(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="news-card-header" style={{ marginTop: editingId === item.id ? 8 : 0 }}>
                <span className={`pill ${item.priority === "high" ? "pill-red" : ""}`}>
                  {formatDate(item.createdAt)} · {item.priority === "high" ? "Важно" : isUpdateNews(item) ? "Update" : "Новость"}
                </span>
                <AuthorInfo item={item} />
              </div>
              {editingId !== item.id ? <h3 style={{ marginTop: 10 }}>{item.title}</h3> : null}
              <NewsBody
                className="page-subtitle"
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontWeight: normalizeNewsTextStyle(item.textStyle).bold ? 700 : 400,
                  fontStyle: normalizeNewsTextStyle(item.textStyle).italic ? "italic" : "normal",
                  textDecoration: normalizeNewsTextStyle(item.textStyle).underline ? "underline" : "none",
                }}
                body={item.body}
              />
              {canEditNews && editingId !== item.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="btn"
                    style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                    type="button"
                    title="Редактировать"
                    aria-label={`Редактировать ${item.title}`}
                    onClick={() => startEdit(item)}
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
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
