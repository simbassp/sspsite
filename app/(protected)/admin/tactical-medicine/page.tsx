"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { splitCategoryLabels, tacticalMedicineBadgeStyle } from "@/lib/catalog-badges";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import {
  buildTacticalMedicineCategoryOptions,
  findCanonicalTacticalMedicineCategory,
  isBuiltinTacticalMedicineCategory,
  itemMatchesTacticalMedicineCategory,
} from "@/lib/tactical-medicine-categories";
import {
  deleteTacticalMedicineItem,
  fetchTacticalMedicineItems,
  reorderTacticalMedicineItems,
  saveTacticalMedicineItem,
} from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

type DraftTacticalMedicine = {
  id?: string;
  title: string;
  category: string;
  image: string;
  summary: string;
};

const emptyDraft: DraftTacticalMedicine = {
  title: "",
  category: "",
  image: "",
  summary: "",
};

const otherCategoryValue = "__other__";
const maxUploadSizeMb = 8;
const customCategoriesLsKey = "ssp:tactical_medicine_custom_categories";

function readLocalCustomCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(customCategoriesLsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalCustomCategories(list: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(customCategoriesLsKey, JSON.stringify(list));
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

function applyVisibleReorder(allOrderedIds: string[], visibleIds: string[], from: number, to: number) {
  const nextVisible = moveIdInList(visibleIds, from, to);
  const visibleSet = new Set(visibleIds);
  let cursor = 0;
  return allOrderedIds.map((id) => (visibleSet.has(id) ? nextVisible[cursor++]! : id));
}

export default function AdminTacticalMedicinePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<DraftTacticalMedicine>(emptyDraft);
  const [message, setMessage] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categoryModeOther, setCategoryModeOther] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryHint, setCategoryHint] = useState("");
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

  const categoryOptions = useMemo(() => buildTacticalMedicineCategoryOptions(customCategories), [customCategories]);
  const isKnownCategory = Boolean(findCanonicalTacticalMedicineCategory(draft.category, categoryOptions));
  const categorySelectValue = isKnownCategory
    ? (findCanonicalTacticalMedicineCategory(draft.category, categoryOptions) ?? "")
    : draft.category.trim() || categoryModeOther
      ? otherCategoryValue
      : "";

  const orderedItems = useMemo(() => sortCatalogItems(items), [items]);
  itemsRef.current = orderedItems;

  const visibleItems = useMemo(() => {
    if (categoryFilter === "all") return orderedItems;
    return orderedItems.filter((item) => itemMatchesTacticalMedicineCategory(item.category, categoryFilter));
  }, [orderedItems, categoryFilter]);
  visibleIdsRef.current = visibleItems.map((item) => item.id);

  const refreshCustomCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tactical-medicine/categories", { cache: "no-store" });
      const payload = (await res.json()) as { ok?: boolean; custom?: string[]; migrationRequired?: boolean };
      if (res.ok && payload.ok) {
        const fromApi = Array.isArray(payload.custom) ? payload.custom : [];
        if (payload.migrationRequired) {
          const local = readLocalCustomCategories();
          setCustomCategories(
            buildTacticalMedicineCategoryOptions(local).filter((c) => !isBuiltinTacticalMedicineCategory(c)),
          );
          setCategoryHint("Пользовательские категории пока в этом браузере (нужна миграция в Supabase).");
          return;
        }
        setCustomCategories(fromApi);
        writeLocalCustomCategories(fromApi);
        setCategoryHint("");
        return;
      }
    } catch {
      /* fallback */
    }
    setCustomCategories(readLocalCustomCategories().filter((c) => !isBuiltinTacticalMedicineCategory(c)));
  }, []);

  const saveCustomCategory = async (rawLabel: string) => {
    const label = rawLabel.trim();
    if (!label) {
      setCategoryHint("Введите название категории.");
      return;
    }
    if (isBuiltinTacticalMedicineCategory(label)) {
      const canonical = findCanonicalTacticalMedicineCategory(label, categoryOptions) || label;
      setDraft((prev) => ({ ...prev, category: canonical }));
      setCategoryModeOther(false);
      setCategoryHint("");
      return;
    }
    setCategoryBusy(true);
    setCategoryHint("");
    try {
      const res = await fetch("/api/admin/tactical-medicine/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        label?: string;
        error?: string;
        message?: string;
      };
      if (res.ok && payload.ok) {
        const saved = String(payload.label || label).trim();
        setCustomCategories((prev) =>
          buildTacticalMedicineCategoryOptions([...prev, saved]).filter((c) => !isBuiltinTacticalMedicineCategory(c)),
        );
        writeLocalCustomCategories(
          buildTacticalMedicineCategoryOptions([...customCategories, saved]).filter(
            (c) => !isBuiltinTacticalMedicineCategory(c),
          ),
        );
        setDraft((prev) => ({ ...prev, category: saved }));
        setCategoryModeOther(false);
        setCategoryHint("Категория сохранена в списке.");
        return;
      }
      if (payload.error === "migration_required_tactical_medicine_category_presets") {
        const next = buildTacticalMedicineCategoryOptions([...customCategories, label]).filter(
          (c) => !isBuiltinTacticalMedicineCategory(c),
        );
        setCustomCategories(next);
        writeLocalCustomCategories(next);
        setDraft((prev) => ({ ...prev, category: label }));
        setCategoryModeOther(false);
        setCategoryHint("Сохранено в этом браузере. Для общего списка выполните миграцию.");
        return;
      }
      setCategoryHint(payload.message || payload.error || "Не удалось сохранить категорию.");
    } catch {
      const next = buildTacticalMedicineCategoryOptions([...customCategories, label]).filter(
        (c) => !isBuiltinTacticalMedicineCategory(c),
      );
      setCustomCategories(next);
      writeLocalCustomCategories(next);
      setDraft((prev) => ({ ...prev, category: label }));
      setCategoryModeOther(false);
      setCategoryHint("Сохранено локально (сервер недоступен).");
    } finally {
      setCategoryBusy(false);
    }
  };

  const deleteCustomCategory = async (label: string) => {
    if (isBuiltinTacticalMedicineCategory(label)) return;
    setCategoryBusy(true);
    try {
      const res = await fetch(`/api/admin/tactical-medicine/categories?label=${encodeURIComponent(label)}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      const next = customCategories.filter(
        (c) => c.trim().toLowerCase() !== label.trim().toLowerCase() && !isBuiltinTacticalMedicineCategory(c),
      );
      if (
        (res.ok && payload.ok) ||
        payload.error === "migration_required_tactical_medicine_category_presets" ||
        !res.ok
      ) {
        setCustomCategories(next);
        writeLocalCustomCategories(next);
        if (draft.category.trim().toLowerCase() === label.trim().toLowerCase()) {
          setDraft((prev) => ({ ...prev, category: "" }));
          setCategoryModeOther(false);
        }
        if (categoryFilter === label) setCategoryFilter("all");
        setCategoryHint(
          payload.error === "migration_required_tactical_medicine_category_presets" ? "Удалено в этом браузере." : "",
        );
        return;
      }
      setCategoryHint(payload.message || payload.error || "Не удалось удалить.");
    } catch {
      const next = customCategories.filter((c) => c.trim().toLowerCase() !== label.trim().toLowerCase());
      setCustomCategories(next);
      writeLocalCustomCategories(next);
      if (draft.category.trim().toLowerCase() === label.trim().toLowerCase()) {
        setDraft((prev) => ({ ...prev, category: "" }));
      }
      if (categoryFilter === label) setCategoryFilter("all");
    } finally {
      setCategoryBusy(false);
    }
  };

  const refresh = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const list = await fetchTacticalMedicineItems();
      setItems(sortCatalogItems(list));
      await refreshCustomCategories();
    } catch {
      setLoadError("Не удалось загрузить карточки. Попробуйте снова.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const persistOrder = useCallback(async (nextOrdered: CatalogItem[]) => {
    const prev = itemsRef.current;
    const withOrder = nextOrdered.map((item, index) => ({ ...item, sortOrder: index }));
    setItems(withOrder);
    itemsRef.current = withOrder;
    setReorderSaving(true);
    setReorderMessage("");
    try {
      await reorderTacticalMedicineItems(withOrder.map((item) => item.id));
      setReorderMessage("Порядок сохранён.");
    } catch {
      setItems(prev);
      itemsRef.current = prev;
      setReorderMessage("Не удалось сохранить порядок.");
    } finally {
      setReorderSaving(false);
      window.setTimeout(() => setReorderMessage(""), 2500);
    }
  }, []);

  const buildReordered = useCallback((fromVisible: number, toVisible: number) => {
    const allIds = itemsRef.current.map((item) => item.id);
    const nextIds = applyVisibleReorder(allIds, visibleIdsRef.current, fromVisible, toVisible);
    const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
    return nextIds.map((id) => byId.get(id)!).filter(Boolean);
  }, []);

  const moveVisibleItem = useCallback(
    (from: number, to: number, opts?: { persist?: boolean }) => {
      const next = buildReordered(from, to);
      const withOrder = next.map((item, index) => ({ ...item, sortOrder: index }));
      setItems(withOrder);
      itemsRef.current = withOrder;
      visibleIdsRef.current =
        categoryFilter === "all"
          ? withOrder.map((item) => item.id)
          : withOrder
              .filter((item) => itemMatchesTacticalMedicineCategory(item.category, categoryFilter))
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
    if (!draft.title.trim()) return setMessage("Введите название карточки.");
    if (!draft.category.trim()) return setMessage("Выберите категорию.");
    if (!draft.image.trim()) return setMessage("Добавьте изображение.");

    const categoryLabel = draft.category.trim();
    if (
      !findCanonicalTacticalMedicineCategory(categoryLabel, categoryOptions) &&
      !isBuiltinTacticalMedicineCategory(categoryLabel)
    ) {
      await saveCustomCategory(categoryLabel);
    }

    try {
      await saveTacticalMedicineItem({
        id: draft.id,
        title: draft.title.trim(),
        category: draft.category.trim() || "Без категории",
        image: draft.image.trim(),
        summary: draft.summary.trim(),
        specs: [],
        details: { overview: "", tth: "", usage: "", materials: "" },
      });
      setMessage(draft.id ? "Карточка обновлена." : "Карточка добавлена.");
      setDraft(emptyDraft);
      setCategoryModeOther(false);
      setCategoryHint("");
      await refresh();
    } catch {
      setMessage("Не удалось сохранить карточку. Проверьте права/подключение и повторите.");
    }
  };

  const onUploadImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    setMessage("");
    try {
      if (!file.type.startsWith("image/")) {
        setMessage("Можно загружать только изображения.");
        return;
      }
      if (file.size > maxUploadSizeMb * 1024 * 1024) {
        setMessage(`Файл слишком большой. Максимум ${maxUploadSizeMb} МБ.`);
        return;
      }
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload-image", { method: "POST", body });
      const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || payload.ok !== true || !payload.url) {
        setMessage(payload.error || "Не удалось загрузить изображение.");
        return;
      }
      setDraft((prev) => ({ ...prev, image: payload.url! }));
      setMessage("Изображение загружено.");
    } catch {
      setMessage("Ошибка загрузки изображения.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onEdit = (item: CatalogItem) => {
    setMessage("");
    const known = Boolean(findCanonicalTacticalMedicineCategory(item.category, categoryOptions));
    setCategoryModeOther(!known && Boolean(item.category.trim()));
    setCategoryHint("");
    setDraft({
      id: item.id,
      title: item.title,
      category: item.category,
      image: item.image.trim(),
      summary: item.summary,
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onDelete = async (itemId: string) => {
    setMessage("");
    try {
      await deleteTacticalMedicineItem(itemId);
      setMessage("Карточка удалена.");
      if (draft.id === itemId) {
        setDraft(emptyDraft);
        setCategoryModeOther(false);
      }
      await refresh();
    } catch {
      setMessage("Не удалось удалить карточку.");
    }
  };

  const previewImageSrc = draft.image.trim() ? publicUploadDisplayUrl(draft.image.trim()) : "";

  return (
    <section>
      <h1 className="page-title">Админ / Тактическая медицина</h1>
      <p className="page-subtitle">Добавление карточек, категории и порядок отображения.</p>
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
          <h3>{draft.id ? "Редактирование карточки" : "Добавить карточку"}</h3>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="label">Название</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />

            <label className="label">Категория</label>
            <p className="page-subtitle" style={{ marginBottom: 8 }}>
              Выберите из списка или «Другое» — введите и сохраните. Крестик удаляет только свои категории.
            </p>
            <div className="chips" style={{ marginBottom: 8 }}>
              {categoryOptions.map((option) => {
                const selected =
                  !categoryModeOther && findCanonicalTacticalMedicineCategory(draft.category, [option]) === option;
                const canDelete = !isBuiltinTacticalMedicineCategory(option);
                return (
                  <span
                    key={option}
                    className={`chip${selected ? " active" : ""}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                    onClick={() => {
                      setCategoryModeOther(false);
                      setDraft((prev) => ({ ...prev, category: option }));
                      setCategoryHint("");
                    }}
                  >
                    {option}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`Удалить категорию ${option}`}
                        title="Удалить из списка"
                        disabled={categoryBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteCustomCategory(option);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          padding: 0,
                          lineHeight: 1,
                          fontSize: 14,
                          opacity: 0.85,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
              <button
                type="button"
                className={`chip${categorySelectValue === otherCategoryValue ? " active" : ""}`}
                disabled={categoryBusy}
                onClick={() => {
                  setCategoryModeOther(true);
                  setDraft((prev) => ({
                    ...prev,
                    category: findCanonicalTacticalMedicineCategory(prev.category, categoryOptions)
                      ? ""
                      : prev.category,
                  }));
                }}
              >
                Другое
              </button>
            </div>
            {categorySelectValue === otherCategoryValue && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className="input"
                  style={{ flex: "1 1 200px" }}
                  placeholder="Название новой категории"
                  value={draft.category}
                  disabled={categoryBusy}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveCustomCategory(draft.category);
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={categoryBusy || !draft.category.trim()}
                  onClick={() => void saveCustomCategory(draft.category)}
                >
                  {categoryBusy ? "Сохраняем…" : "Сохранить в список"}
                </button>
              </div>
            )}
            {categoryHint && <p className="page-subtitle">{categoryHint}</p>}

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
                onChange={(e) => void onUploadImage(e.target.files)}
              />
            </div>
            <input
              className="input"
              value={draft.image}
              onChange={(e) => setDraft((prev) => ({ ...prev, image: e.target.value }))}
              placeholder="https://..."
            />
            {previewImageSrc && (
              <img
                src={previewImageSrc}
                alt=""
                decoding="async"
                loading="lazy"
                style={{
                  width: 160,
                  height: 100,
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  objectFit: "cover",
                  marginTop: 8,
                }}
              />
            )}
            {draft.category.trim() && (
              <div className="catalog-badge-row" style={{ marginTop: 8 }}>
                {splitCategoryLabels(draft.category).map((label, bi) => {
                  const tone = tacticalMedicineBadgeStyle(label);
                  return (
                    <span key={`preview-cat-${bi}-${label}`} className="catalog-badge" style={tone} title={label}>
                      {label}
                    </span>
                  );
                })}
              </div>
            )}

            <label className="label">Описание</label>
            <textarea
              className="input"
              rows={3}
              value={draft.summary}
              onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
            />

            {message && <p className="page-subtitle">{message}</p>}
            <button className="btn btn-primary" type="button" onClick={() => void onSave()}>
              {draft.id ? "Сохранить карточку" : "Добавить карточку"}
            </button>
            {draft.id && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setDraft(emptyDraft);
                  setCategoryModeOther(false);
                  setCategoryHint("");
                }}
              >
                Отменить редактирование
              </button>
            )}
          </div>
        </div>
      </article>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Карточки и порядок</h3>
        <p className="page-subtitle" style={{ marginBottom: 8 }}>
          Перетащите за ⋮⋮ или кнопками ↑↓. Порядок сразу сохраняется и отображается на публичной странице.
        </p>

        <div className="chips" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`chip${categoryFilter === "all" ? " active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            Все ({orderedItems.length})
          </button>
          {categoryOptions.map((category) => {
            const count = orderedItems.filter((item) =>
              itemMatchesTacticalMedicineCategory(item.category, category),
            ).length;
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
                  onPointerCancel={() => finishDrag()}
                >
                  <GripVertical width={18} height={18} strokeWidth={2} aria-hidden />
                </button>

                <div className="admin-uav-sort-item__main" style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ marginBottom: 6 }}>{item.title}</h3>
                  <div className="meta" style={{ marginTop: 0 }}>
                    {item.category.trim() ? (
                      splitCategoryLabels(item.category).map((label, bi) => {
                        const tone = tacticalMedicineBadgeStyle(label);
                        return (
                          <span key={`${item.id}-cat-${bi}`} className="catalog-badge" style={tone} title={label}>
                            {label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="pill">Без категории</span>
                    )}
                  </div>
                </div>

                <div className="admin-uav-sort-item__actions">
                  <button
                    className="btn"
                    style={{ width: 38, height: 34, padding: 0 }}
                    type="button"
                    title="Выше"
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
                    onClick={() => onEdit(item)}
                  >
                    ✏
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                    type="button"
                    title="Удалить"
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
              ? "Пока нет карточек тактической медицины."
              : `В категории «${categoryFilter}» пока нет карточек.`}
          </p>
        )}
      </div>
    </section>
  );
}
