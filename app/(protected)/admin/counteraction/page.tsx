"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { deleteCounteractionItem, fetchCounteractionItems, saveCounteractionItem } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

type DraftCounteraction = {
  id?: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  specsText: string[];
};

const emptyDraft: DraftCounteraction = {
  title: "",
  category: "",
  image: "",
  summary: "",
  specsText: ["", "", "", "", "", "", "", ""],
};

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
  const lines = specs.slice(0, 8).map((item) => `${item.key}: ${item.value}`);
  while (lines.length < 8) lines.push("");
  return lines;
}

function parseImages(input: string) {
  return input
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function AdminCounteractionPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<DraftCounteraction>(emptyDraft);
  const [message, setMessage] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.title.localeCompare(b.title)), [items]);

  const refresh = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const list = await fetchCounteractionItems();
      setItems(list);
    } catch {
      setLoadError("Не удалось загрузить карточки противодействия. Попробуйте снова.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void refresh().then(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, []);

  const onSave = async () => {
    setMessage("");
    if (!draft.title.trim()) return setMessage("Введите название карточки.");
    if (parseImages(draft.image).length === 0) return setMessage("Добавьте минимум одно изображение.");

    const specs = normalizeSpecs(draft.specsText).slice(0, 8);

    await saveCounteractionItem({
      id: draft.id,
      title: draft.title.trim(),
      category: draft.category.trim() || "Без категории",
      image: draft.image.trim(),
      summary: draft.summary.trim(),
      specs,
      details: {
        overview: "",
        tth: "",
        usage: "",
        materials: "",
      },
    });
    setMessage(draft.id ? "Карточка противодействия обновлена." : "Карточка противодействия добавлена.");
    setDraft(emptyDraft);
    await refresh();
  };

  const onUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsUploadingImage(true);
    setMessage("");
    const uploadedUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload-image", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
        if (!response.ok || payload.ok !== true || !payload.url) {
          setMessage(payload.error || "Не удалось загрузить часть изображений.");
          continue;
        }
        uploadedUrls.push(payload.url);
      }
      if (uploadedUrls.length > 0) {
        setDraft((prev) => {
          const all = [...parseImages(prev.image), ...uploadedUrls];
          return { ...prev, image: all.join("\n") };
        });
        setMessage(`Загружено изображений: ${uploadedUrls.length}.`);
      }
    } catch {
      setMessage("Ошибка загрузки изображений.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onDelete = async (itemId: string) => {
    setMessage("");
    await deleteCounteractionItem(itemId);
    setMessage("Карточка удалена.");
    if (draft.id === itemId) setDraft(emptyDraft);
    await refresh();
  };

  return (
    <section>
      <h1 className="page-title">Управление / Противодействие</h1>
      <p className="page-subtitle">Добавление и редактирование карточек противодействия.</p>
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
          <h3>{draft.id ? "Редактирование карточки" : "Добавить карточку противодействия"}</h3>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="label">Название</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />

            <label className="label">Категория</label>
            <input
              className="input"
              value={draft.category}
              onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
            />

            <label className="label">Изображения (несколько штук, каждая строка - отдельный URL)</label>
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
                multiple
                style={{ display: "none" }}
                onChange={(e) => void onUploadImages(e.target.files)}
              />
            </div>
            <input
              className="input"
              value={draft.image}
              onChange={(e) => setDraft((prev) => ({ ...prev, image: e.target.value }))}
              placeholder="https://... (каждый URL с новой строки)"
            />
            {parseImages(draft.image).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parseImages(draft.image).slice(0, 6).map((url, idx) => (
                  <img
                    key={`${url}-${idx}`}
                    src={publicUploadDisplayUrl(url)}
                    alt=""
                    decoding="async"
                    loading="lazy"
                    style={{ width: 110, height: 70, borderRadius: 10, border: "1px solid var(--line)", objectFit: "cover" }}
                  />
                ))}
              </div>
            )}

            <label className="label">Краткое описание</label>
            <textarea
              className="input"
              rows={2}
              value={draft.summary}
              onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
            />

            <h3 style={{ marginTop: 4 }}>Параметры (до 8 строк, заполните только нужные)</h3>
            {draft.specsText.map((line, index) => (
              <div key={`spec-${index}`}>
                <label className="label">Параметр {index + 1}</label>
                <input
                  className="input"
                  placeholder="например: Дальность подавления: 2 км"
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

      <div className="list" style={{ marginTop: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {sortedItems.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body" style={{ padding: 12 }}>
              <h3 style={{ marginBottom: 6 }}>{item.title}</h3>
              <div className="meta" style={{ marginTop: 0 }}>
                <span className="pill">{item.category}</span>
                <span>{item.specs.length} параметров</span>
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
                  onClick={() => void onDelete(item.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          </article>
        ))}
        {!isLoading && !loadError && !sortedItems.length && <p className="page-subtitle">Пока нет карточек противодействия.</p>}
      </div>
    </section>
  );
}
