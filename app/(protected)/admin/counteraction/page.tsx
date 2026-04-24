"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteCounteractionItem, fetchCounteractionItems, saveCounteractionItem } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

type DraftCounteraction = {
  id?: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  specsText: string[];
  overview: string;
  tth: string;
  usage: string;
  materials: string;
};

const emptyDraft: DraftCounteraction = {
  title: "",
  category: "",
  image: "",
  summary: "",
  specsText: ["", "", "", "", "", ""],
  overview: "",
  tth: "",
  usage: "",
  materials: "",
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
  const lines = specs.slice(0, 6).map((item) => `${item.key}: ${item.value}`);
  while (lines.length < 6) lines.push("");
  return lines;
}

export default function AdminCounteractionPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<DraftCounteraction>(emptyDraft);
  const [message, setMessage] = useState("");

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.title.localeCompare(b.title)), [items]);

  const refresh = async () => {
    const list = await fetchCounteractionItems();
    setItems(list);
  };

  useEffect(() => {
    let active = true;
    fetchCounteractionItems().then((list) => {
      if (active) setItems(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const onSave = async () => {
    setMessage("");
    if (!draft.title.trim()) return setMessage("Введите название карточки.");
    if (!draft.image.trim()) return setMessage("Добавьте ссылку на изображение.");

    const specs = normalizeSpecs(draft.specsText);
    if (specs.length < 2) return setMessage("Заполните минимум 2 строки ключевых параметров.");

    await saveCounteractionItem({
      id: draft.id,
      title: draft.title.trim(),
      category: draft.category.trim() || "Без категории",
      image: draft.image.trim(),
      summary: draft.summary.trim() || draft.overview.trim(),
      specs: specs.slice(0, 6),
      details: {
        overview: draft.overview.trim(),
        tth: draft.tth.trim(),
        usage: draft.usage.trim(),
        materials: draft.materials.trim(),
      },
    });
    setMessage(draft.id ? "Карточка защиты обновлена." : "Карточка защиты добавлена.");
    setDraft(emptyDraft);
    await refresh();
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
      overview: item.details.overview,
      tth: item.details.tth,
      usage: item.details.usage,
      materials: item.details.materials,
    });
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
      <h1 className="page-title">Управление / Защита</h1>
      <p className="page-subtitle">Добавление и редактирование карточек противодействия.</p>

      <article className="card">
        <div className="card-body">
          <h3>{draft.id ? "Редактирование карточки" : "Добавить карточку защиты"}</h3>
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

            <label className="label">Ссылка на картинку</label>
            <input
              className="input"
              value={draft.image}
              onChange={(e) => setDraft((prev) => ({ ...prev, image: e.target.value }))}
            />

            <label className="label">Краткое описание</label>
            <textarea
              className="input"
              rows={2}
              value={draft.summary}
              onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
            />

            <h3 style={{ marginTop: 4 }}>Ключевые параметры (до 6 строк)</h3>
            {draft.specsText.map((line, index) => (
              <div key={`spec-${index}`}>
                <label className="label">Параметр {index + 1}</label>
                <input
                  className="input"
                  placeholder="например: Радиус подавления: 2 км"
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

            <label className="label">Обзор</label>
            <textarea
              className="input"
              rows={3}
              value={draft.overview}
              onChange={(e) => setDraft((prev) => ({ ...prev, overview: e.target.value }))}
            />

            <label className="label">ТТХ</label>
            <textarea
              className="input"
              rows={3}
              value={draft.tth}
              onChange={(e) => setDraft((prev) => ({ ...prev, tth: e.target.value }))}
            />

            <label className="label">Применение</label>
            <textarea
              className="input"
              rows={3}
              value={draft.usage}
              onChange={(e) => setDraft((prev) => ({ ...prev, usage: e.target.value }))}
            />

            <label className="label">Материалы</label>
            <textarea
              className="input"
              rows={3}
              value={draft.materials}
              onChange={(e) => setDraft((prev) => ({ ...prev, materials: e.target.value }))}
            />

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

      <div className="list" style={{ marginTop: 12 }}>
        {sortedItems.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className="pill">{item.category}</span>
                <span>{item.specs.length} параметров</span>
              </div>
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                {item.summary}
              </p>
              <div className="form" style={{ marginTop: 10 }}>
                <button className="btn" type="button" onClick={() => onEdit(item)}>
                  Редактировать
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void onDelete(item.id)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
        {!sortedItems.length && <p className="page-subtitle">Пока нет карточек защиты.</p>}
      </div>
    </section>
  );
}
