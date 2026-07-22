"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { canManageNews } from "@/lib/permissions";
import { useClientSession } from "@/hooks/useClientSession";
import { applyMarkupToSelection } from "@/lib/news-text";
import {
  createNews,
  deleteNews,
  fetchNews,
  normalizeNewsTextStyle,
  updateNews,
} from "@/lib/news-repository";
import { countNewsByFilter, matchesNewsFilter, type NewsFilter } from "@/lib/news-ui";
import { NewsEditorForm } from "@/components/news/NewsEditorForm";
import { NewsFiltersBar } from "@/components/news/NewsFiltersBar";
import { NewsMessageCard } from "@/components/news/NewsMessageCard";
import type { NewsItem } from "@/lib/types";

type EditDraft = {
  title: string;
  body: string;
  priority: "normal" | "high" | "update";
};

const EMPTY_DRAFT: EditDraft = { title: "", body: "", priority: "normal" };

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<NewsFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { session, hydrated } = useClientSession();
  const canEditNews = hydrated && canManageNews(session);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [createDraft, setCreateDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const editBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const createBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const load = async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchNews(200, forceRefresh);
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

  const counts = useMemo(() => countNewsByFilter(news), [news]);

  const visible = useMemo(
    () =>
      news
        .filter((item) => matchesNewsFilter(item, filter))
        .sort((a, b) => {
          const left = new Date(a.createdAt).getTime();
          const right = new Date(b.createdAt).getTime();
          return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
        }),
    [filter, news],
  );

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pagedNews = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (item: NewsItem) => {
    setCreateOpen(false);
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      body: item.body,
      priority: item.kind === "update" ? "update" : item.priority === "high" ? "high" : "normal",
    });
  };

  const applySelectionTag = (
    ref: RefObject<HTMLTextAreaElement | null>,
    setter: (updater: (prev: EditDraft) => EditDraft) => void,
    tag: "b" | "i" | "u",
  ) => {
    const textarea = ref.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const next = applyMarkupToSelection({ value, start: selectionStart, end: selectionEnd, tag });
    setter((prev) => ({ ...prev, body: next.nextValue }));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.caretStart, next.caretEnd);
    });
  };

  const markupToolbar = (ref: RefObject<HTMLTextAreaElement | null>, setter: (updater: (prev: EditDraft) => EditDraft) => void) => (
    <div className="news-editor-form__toolbar">
      <button className="btn" type="button" onClick={() => applySelectionTag(ref, setter, "b")}>
        Жирный
      </button>
      <button className="btn" type="button" onClick={() => applySelectionTag(ref, setter, "i")}>
        Курсив
      </button>
      <button className="btn" type="button" onClick={() => applySelectionTag(ref, setter, "u")}>
        Подчеркнутый
      </button>
    </div>
  );

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

  const saveCreate = async () => {
    const nextTitle = createDraft.title.trim();
    const nextBody = createDraft.body.trim();
    if (!nextTitle || !nextBody) {
      setInfo("Заполните заголовок и текст.");
      return;
    }
    const result = await createNews({
      title: nextTitle,
      body: nextBody,
      priority: createDraft.priority,
      authorSnapshot: [session?.name?.trim(), session?.callsign?.trim()].filter(Boolean).join(" ").trim(),
      authorPositionSnapshot: session?.position ?? null,
    });
    setInfo(result.ok ? "Сообщение опубликовано." : `Ошибка публикации: ${result.error}`);
    if (result.ok) {
      setCreateOpen(false);
      setCreateDraft(EMPTY_DRAFT);
      await load(true);
    }
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
    <section className="news-page">
      <h1 className="page-title">Новости</h1>
      <p className="page-subtitle">Сообщения и обновления платформы.</p>

      <NewsFiltersBar
        filter={filter}
        counts={counts}
        canCreate={canEditNews}
        onFilterChange={setFilter}
        onCreate={() => {
          setEditingId(null);
          setCreateOpen(true);
          setCreateDraft(EMPTY_DRAFT);
        }}
      />

      {info ? <p className="page-subtitle news-page__info">{info}</p> : null}

      {createOpen && canEditNews ? (
        <article className="card news-page__composer">
          <div className="card-body">
            <h3 className="news-page__composer-title">Новое сообщение</h3>
            <NewsEditorForm
              title={createDraft.title}
              body={createDraft.body}
              priority={createDraft.priority}
              bodyRef={createBodyRef}
              submitLabel="Опубликовать"
              onTitleChange={(value) => setCreateDraft((prev) => ({ ...prev, title: value }))}
              onBodyChange={(value) => setCreateDraft((prev) => ({ ...prev, body: value }))}
              onPriorityChange={(value) => setCreateDraft((prev) => ({ ...prev, priority: value }))}
              onSubmit={() => void saveCreate()}
              onCancel={() => {
                setCreateOpen(false);
                setCreateDraft(EMPTY_DRAFT);
              }}
              toolbar={markupToolbar(createBodyRef, setCreateDraft)}
            />
          </div>
        </article>
      ) : null}

      <div className="news-page__list">
        {loading && (
          <>
            <p className="page-subtitle">Загрузка новостей...</p>
            {[1, 2].map((i) => (
              <article className="card news-message-card is-news" key={`news-skeleton-${i}`}>
                <div className="news-message-card__accent" aria-hidden />
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

        {!loading &&
          !error &&
          pagedNews.map((item) => (
            <NewsMessageCard
              key={item.id}
              item={item}
              expanded={expandedIds.has(item.id)}
              canEdit={canEditNews}
              editing={editingId === item.id}
              onToggleView={() => toggleExpanded(item.id)}
              onEdit={() => startEdit(item)}
              onDelete={() => void onDelete(item)}
              editForm={
                <NewsEditorForm
                  title={editDraft.title}
                  body={editDraft.body}
                  priority={editDraft.priority}
                  bodyRef={editBodyRef}
                  submitLabel="Сохранить"
                  onTitleChange={(value) => setEditDraft((prev) => ({ ...prev, title: value }))}
                  onBodyChange={(value) => setEditDraft((prev) => ({ ...prev, body: value }))}
                  onPriorityChange={(value) => setEditDraft((prev) => ({ ...prev, priority: value }))}
                  onSubmit={() => void saveEdit(item)}
                  onCancel={() => setEditingId(null)}
                  toolbar={markupToolbar(editBodyRef, setEditDraft)}
                />
              }
            />
          ))}
      </div>

      {!loading && !error && visible.length > 0 ? (
        <div className="news-page__footer">
          <span className="news-page__footer-total">Всего: {visible.length}</span>
          <div className="news-page__pagination">
            <button className="btn" type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </button>
            <span className="news-page__page-indicator">{currentPage}</span>
            <button
              className="btn"
              type="button"
              disabled={currentPage >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              ›
            </button>
          </div>
          <select
            className="select news-page__page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10 на странице</option>
            <option value={20}>20 на странице</option>
            <option value={30}>30 на странице</option>
          </select>
        </div>
      ) : null}
    </section>
  );
}
