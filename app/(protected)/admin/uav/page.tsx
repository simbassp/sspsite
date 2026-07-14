"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { splitCategoryLabels, uavBadgeStyle } from "@/lib/catalog-badges";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { UAV_CATEGORIES, isPresetUavCategory, itemMatchesUavCategory } from "@/lib/uav-categories";
import { UAV_ENGINE_TYPES, UavEngineType, appendEngineSpec, detectEngineType } from "@/lib/uav-engine";
import { deleteUavItem, fetchUavItems, reorderUavItems, saveUavItem } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

type DraftUav = {
  id?: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  specsText: string[];
  engineType: UavEngineType;
};

const emptyDraft: DraftUav = {
  title: "",
  category: "",
  image: "",
  summary: "",
  specsText: ["", "", "", "", "", ""],
  engineType: "",
};

const categoryOptions = UAV_CATEGORIES;
const otherCategoryValue = "__other__";
const maxUploadSizeMb = 8;

function normalizeSpecs(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      if (line.includes(":")) {
        const [left, ...rest] = line.split(":");
        const key = left.trim() || `Параметр ${index + 1}`;
        const value = rest.join(":").trim();
        return { key, value };
      }
      return { key: `Параметр ${index + 1}`, value: line };
    });
}

function specsToText(specs: CatalogItem["specs"]) {
  const lines = specs
    .filter((item) => item.key.trim().toLowerCase() !== "тип двигателя")
    .slice(0, 6)
    .map((item) => `${item.key}: ${item.value}`);
  while (lines.length < 6) lines.push("");
  return lines;
}

function sortCatalogItems(list: CatalogItem[]) {
  return [...list].sort((a, b) => {
    const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0;
    const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title, "ru");
  });
}

function moveIdInList(ids: string[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

/** Переставляет видимые id внутри полного порядка (невидимые остаются на местах). */
function applyVisibleReorder(allOrderedIds: string[], visibleIds: string[], from: number, to: number) {
  const nextVisible = moveIdInList(visibleIds, from, to);
  const visibleSet = new Set(visibleIds);
  let cursor = 0;
  return allOrderedIds.map((id) => (visibleSet.has(id) ? nextVisible[cursor++]! : id));
}

export default function AdminUavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<DraftUav>(emptyDraft);
  const [message, setMessage] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderMessage, setReorderMessage] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const pointerStartYRef = useRef(0);
  const itemsRef = useRef<CatalogItem[]>([]);
  const visibleIdsRef = useRef<string[]>([]);
  const orderBeforeDragRef = useRef<CatalogItem[] | null>(null);
  const dirtyDuringDragRef = useRef(false);

  const orderedItems = useMemo(() => sortCatalogItems(items), [items]);
  itemsRef.current = orderedItems;

  const visibleItems = useMemo(() => {
    if (categoryFilter === "all") return orderedItems;
    return orderedItems.filter((item) => itemMatchesUavCategory(item.category, categoryFilter));
  }, [orderedItems, categoryFilter]);
  visibleIdsRef.current = visibleItems.map((item) => item.id);

  const isPresetCategory = isPresetUavCategory(draft.category);
  const categorySelectValue = isPresetCategory
    ? (categoryOptions.find((option) => option.trim().toLowerCase() === draft.category.trim().toLowerCase()) ??
      otherCategoryValue)
    : draft.category.trim()
      ? otherCategoryValue
      : "";

  const refresh = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const list = await fetchUavItems();
      setItems(sortCatalogItems(list));
    } catch {
      setLoadError("Не удалось загрузить карточки БПЛА. Попробуйте снова.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const persistOrder = useCallback(async (nextOrdered: CatalogItem[]) => {
    const prev = itemsRef.current;
    const withOrder = nextOrdered.map((item, index) => ({ ...item, sortOrder: index }));
    setItems(withOrder);
    setReorderSaving(true);
    setReorderMessage("Сохраняем порядок…");
    try {
      await reorderUavItems(withOrder.map((item) => item.id));
      setReorderMessage("Порядок сохранён.");
    } catch (error) {
      setItems(prev);
      setReorderMessage(
        error instanceof Error && error.message.includes("migration_required")
          ? "Нужна миграция sort_order в Supabase. Порядок не сохранён."
          : "Не удалось сохранить порядок. Попробуйте ещё раз.",
      );
    } finally {
      setReorderSaving(false);
    }
  }, []);

  const buildReordered = useCallback((fromIndex: number, toIndex: number) => {
    const allIds = itemsRef.current.map((item) => item.id);
    const visibleIds = visibleIdsRef.current;
    const nextAllIds = applyVisibleReorder(allIds, visibleIds, fromIndex, toIndex);
    if (nextAllIds.every((id, i) => id === allIds[i])) return null;
    const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
    return nextAllIds.map((id) => byId.get(id)!).filter(Boolean);
  }, []);

  const moveVisibleItem = useCallback(
    (fromIndex: number, toIndex: number, opts?: { persist?: boolean }) => {
      const nextOrdered = buildReordered(fromIndex, toIndex);
      if (!nextOrdered) return;
      const withOrder = nextOrdered.map((item, index) => ({ ...item, sortOrder: index }));
      setItems(withOrder);
      itemsRef.current = withOrder;
      visibleIdsRef.current =
        categoryFilter === "all"
          ? withOrder.map((item) => item.id)
          : withOrder
              .filter((item) => itemMatchesUavCategory(item.category, categoryFilter))
              .map((item) => item.id);
      if (opts?.persist !== false) {
        void persistOrder(withOrder);
      } else {
        dirtyDuringDragRef.current = true;
      }
    },
    [buildReordered, categoryFilter, persistOrder],
  );

  const finishDrag = useCallback(() => {
    const dragging = dragIdRef.current;
    dragIdRef.current = null;
    setDraggingId(null);
    if (!dragging || !dirtyDuringDragRef.current) {
      dirtyDuringDragRef.current = false;
      orderBeforeDragRef.current = null;
      return;
    }
    dirtyDuringDragRef.current = false;
    const next = itemsRef.current;
    const before = orderBeforeDragRef.current;
    orderBeforeDragRef.current = null;
    if (before && before.map((i) => i.id).join() === next.map((i) => i.id).join()) return;
    void persistOrder(next);
  }, [persistOrder]);

  useEffect(() => {
    void refresh();
  }, []);

  const onSave = async () => {
    setMessage("");
    if (!draft.title.trim()) return setMessage("Введите название БПЛА.");
    if (!draft.category.trim()) return setMessage("Выберите категорию БПЛА.");
    if (!draft.image.trim()) return setMessage("Добавьте изображение (ссылка или загрузка файла).");

    const specs = normalizeSpecs(draft.specsText);
    if (specs.length < 6) return setMessage("Заполните 6 строк ТТХ.");

    try {
      await saveUavItem({
        id: draft.id,
        title: draft.title.trim(),
        category: draft.category.trim() || "Без категории",
        image: draft.image.trim(),
        summary: draft.summary.trim(),
        specs: appendEngineSpec(specs.slice(0, 6), draft.engineType),
        details: {
          overview: "",
          tth: "",
          usage: "",
          materials: "",
        },
      });
      setMessage(draft.id ? "Карточка БПЛА обновлена." : "Карточка БПЛА добавлена.");
      setDraft(emptyDraft);
      await refresh();
    } catch {
      setMessage("Не удалось сохранить карточку в основной базе. Проверьте права/подключение и повторите.");
    }
  };

  const onUploadImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Можно загружать только изображения.");
      return;
    }
    if (file.size > maxUploadSizeMb * 1024 * 1024) {
      setMessage(`Файл слишком большой. Максимум ${maxUploadSizeMb} МБ.`);
      return;
    }
    setIsUploadingImage(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || payload.ok !== true || !payload.url) {
        setMessage(payload.error || "Не удалось загрузить изображение.");
        return;
      }
      setDraft((prev) => ({ ...prev, image: payload.url ?? prev.image }));
      setMessage("Изображение загружено.");
    } catch {
      setMessage("Ошибка загрузки изображения.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onEdit = (item: CatalogItem) => {
    setMessage("");
    setDraft({
      id: item.id,
      title: item.title,
      category: item.category,
      image: item.image,
      summary: item.summary,
      specsText: specsToText(item.specs),
      engineType: detectEngineType(item.specs),
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onDelete = async (itemId: string) => {
    setMessage("");
    try {
      await deleteUavItem(itemId);
      setMessage("Карточка удалена.");
      if (draft.id === itemId) setDraft(emptyDraft);
      await refresh();
    } catch {
      setMessage("Не удалось удалить карточку из основной базы. Проверьте подключение и права.");
    }
  };

  return (
    <section>
      <h1 className="page-title">Админ / БПЛА</h1>
      <p className="page-subtitle">
        Добавление и редактирование БПЛА: изображение, 6 ТТХ, тип двигателя. Ниже — порядок карточек и фильтр по
        категориям.
      </p>
      {isLoading && <p className="page-subtitle">Загрузка...</p>}
      {!isLoading && !!loadError && (
        <div className="form" style={{ marginBottom: 12 }}>
          <p className="page-subtitle">{loadError}</p>
          <button className="btn" type="button" onClick={() => void refresh()}>
            Повторить
          </button>
        </div>
      )}

      <article className="card">
        <div className="card-body">
          <h3>{draft.id ? "Редактирование карточки" : "Добавить карточку БПЛА"}</h3>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="label">Название</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />

            <label className="label">Категория</label>
            <select
              className="select"
              value={categorySelectValue || ""}
              onChange={(e) => {
                const nextValue = e.target.value;
                if (nextValue === otherCategoryValue) {
                  setDraft((prev) => ({
                    ...prev,
                    category: isPresetUavCategory(prev.category) ? "" : prev.category,
                  }));
                  return;
                }
                setDraft((prev) => ({ ...prev, category: nextValue }));
              }}
            >
              <option value="" disabled>
                Выберите категорию
              </option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={otherCategoryValue}>Другое</option>
            </select>
            {categorySelectValue === otherCategoryValue && (
              <input
                className="input"
                placeholder="Укажите свою категорию"
                value={draft.category}
                onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
              />
            )}

            <label className="label">Изображение</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? "Загрузка..." : "Загрузить с устройства"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => void onUploadImage(e.target.files?.[0] ?? null)}
              />
            </div>
            <label className="label">Ссылка на картинку (или вставьте вручную)</label>
            <input
              className="input"
              value={draft.image}
              onChange={(e) => setDraft((prev) => ({ ...prev, image: e.target.value }))}
              placeholder="https://... или /uploads/uav/..."
            />
            {draft.image.trim() && (
              <div style={{ marginTop: 8 }}>
                <p className="label" style={{ marginBottom: 6 }}>
                  Предпросмотр
                </p>
                <img
                  src={publicUploadDisplayUrl(draft.image)}
                  alt=""
                  decoding="async"
                  loading="lazy"
                  style={{ width: "100%", maxWidth: 360, height: 160, objectFit: "cover", borderRadius: 12, border: "1px solid var(--line)" }}
                />
                {draft.category.trim() && (
                  <div className="catalog-badge-row" style={{ marginTop: 8 }}>
                    {splitCategoryLabels(draft.category).map((label, bi) => {
                      const tone = uavBadgeStyle(label);
                      return (
                        <span key={`preview-cat-${bi}-${label}`} className="catalog-badge" style={tone} title={label}>
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <label className="label">Краткое описание</label>
            <textarea
              className="input"
              rows={2}
              value={draft.summary}
              onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
            />

            <h3 style={{ marginTop: 4 }}>6 строк характеристик</h3>
            {draft.specsText.map((line, index) => (
              <div key={`spec-${index}`}>
                <label className="label">ТТХ {index + 1}</label>
                <input
                  className="input"
                  placeholder="например: Скорость: 120 км/ч"
                  value={line}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      specsText: prev.specsText.map((oldLine, idx) => (idx === index ? e.target.value : oldLine)),
                    }))
                  }
                />
              </div>
            ))}
            <label className="label">Тип двигателя</label>
            <select
              className="select"
              value={draft.engineType}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  engineType: e.target.value as UavEngineType,
                }))
              }
            >
              <option value="">Не указан</option>
              {UAV_ENGINE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {message && <p className="page-subtitle">{message}</p>}
            <button className="btn btn-primary" type="button" onClick={() => void onSave()}>
              {draft.id ? "Сохранить карточку" : "Добавить карточку"}
            </button>
            {draft.id && (
              <button className="btn" type="button" onClick={() => setDraft(emptyDraft)}>
                Отменить редактирование
              </button>
            )}
          </div>
        </div>
      </article>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Карточки и порядок</h3>
        <p className="page-subtitle" style={{ marginBottom: 8 }}>
          Перетащите за ⋮⋮ или кнопками ↑↓. Порядок сразу сохраняется и так же показывается на странице ТТХ БПЛА.
          Фильтр — чтобы заранее увидеть набор категории.
        </p>

        <div className="chips" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`chip${categoryFilter === "all" ? " active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            Все ({orderedItems.length})
          </button>
          {UAV_CATEGORIES.map((category) => {
            const count = orderedItems.filter((item) => itemMatchesUavCategory(item.category, category)).length;
            return (
              <button
                key={category}
                type="button"
                className={`chip${categoryFilter === category ? " active" : ""}`}
                onClick={() => setCategoryFilter(category)}
              >
                {category}
                {count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {(reorderSaving || reorderMessage) && (
          <p className="page-subtitle" style={{ marginBottom: 8 }}>
            {reorderMessage || "Сохраняем порядок…"}
          </p>
        )}

        <div className="admin-uav-sort-list" ref={listRef}>
          {visibleItems.map((item, index) => (
            <article
              className={`card admin-uav-sort-item${draggingId === item.id ? " is-dragging" : ""}`}
              key={item.id}
              data-uav-sort-id={item.id}
            >
              <div className="card-body admin-uav-sort-item__body">
                <button
                  type="button"
                  className="admin-uav-sort-handle"
                  aria-label={`Перетащить ${item.title}`}
                  title="Перетащить"
                  disabled={reorderSaving}
                  onPointerDown={(e) => {
                    if (reorderSaving || e.button !== 0) return;
                    e.preventDefault();
                    dragIdRef.current = item.id;
                    pointerStartYRef.current = e.clientY;
                    orderBeforeDragRef.current = itemsRef.current;
                    dirtyDuringDragRef.current = false;
                    setDraggingId(item.id);
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!dragIdRef.current || !listRef.current) return;
                    const y = e.clientY;
                    if (Math.abs(y - pointerStartYRef.current) < 10) return;
                    const cards = Array.from(
                      listRef.current.querySelectorAll<HTMLElement>("[data-uav-sort-id]"),
                    );
                    const over = cards.find((el) => {
                      const rect = el.getBoundingClientRect();
                      return y >= rect.top && y <= rect.bottom;
                    });
                    if (!over) return;
                    const overId = over.dataset.uavSortId;
                    if (!overId || overId === dragIdRef.current) return;
                    const from = visibleIdsRef.current.indexOf(dragIdRef.current);
                    const to = visibleIdsRef.current.indexOf(overId);
                    if (from < 0 || to < 0 || from === to) return;
                    pointerStartYRef.current = y;
                    moveVisibleItem(from, to, { persist: false });
                  }}
                  onPointerUp={(e) => {
                    try {
                      (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                    finishDrag();
                  }}
                  onPointerCancel={() => {
                    finishDrag();
                  }}
                >
                  <GripVertical width={18} height={18} strokeWidth={2} aria-hidden />
                </button>

                <div className="admin-uav-sort-item__main" style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ marginBottom: 6 }}>{item.title}</h3>
                  <div className="meta" style={{ marginTop: 0 }}>
                    {item.category.trim() ? (
                      splitCategoryLabels(item.category).map((label, bi) => {
                        const tone = uavBadgeStyle(label);
                        return (
                          <span key={`${item.id}-cat-${bi}`} className="catalog-badge" style={tone} title={label}>
                            {label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="pill">Без категории</span>
                    )}
                    <span>{item.specs.length} характеристик</span>
                  </div>
                </div>

                <div className="admin-uav-sort-item__actions">
                  <button
                    className="btn"
                    style={{ width: 38, height: 34, padding: 0 }}
                    type="button"
                    title="Выше"
                    aria-label={`Поднять ${item.title}`}
                    disabled={reorderSaving || index === 0}
                    onClick={() => moveVisibleItem(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn"
                    style={{ width: 38, height: 34, padding: 0 }}
                    type="button"
                    title="Ниже"
                    aria-label={`Опустить ${item.title}`}
                    disabled={reorderSaving || index >= visibleItems.length - 1}
                    onClick={() => moveVisibleItem(index, index + 1)}
                  >
                    ↓
                  </button>
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
                    onClick={() => void onDelete(item.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!isLoading && !loadError && !visibleItems.length && (
          <p className="page-subtitle">
            {categoryFilter === "all"
              ? "Пока нет карточек БПЛА."
              : `В категории «${categoryFilter}» пока нет карточек.`}
          </p>
        )}
      </div>
    </section>
  );
}
