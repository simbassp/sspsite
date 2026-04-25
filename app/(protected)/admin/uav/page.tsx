"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteUavItem, fetchUavItems, saveUavItem } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

type DraftUav = {
  id?: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  specsText: string[];
  engineType: "электрический" | "двс" | "гибридный";
};

const emptyDraft: DraftUav = {
  title: "",
  category: "",
  image: "",
  summary: "",
  specsText: ["", "", "", "", ""],
  engineType: "электрический",
};

const categoryOptions = ["Ударный", "Разведывательный"] as const;
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
    .slice(0, 5)
    .map((item) => `${item.key}: ${item.value}`);
  while (lines.length < 5) lines.push("");
  return lines;
}

function detectEngineType(
  specs: CatalogItem["specs"],
): "электрический" | "двс" | "гибридный" {
  const candidate = specs.find((item) => item.key.trim().toLowerCase() === "тип двигателя")?.value.trim().toLowerCase();
  if (candidate === "двс") return "двс";
  if (candidate === "гибридный") return "гибридный";
  return "электрический";
}

export default function AdminUavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<DraftUav>(emptyDraft);
  const [message, setMessage] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.title.localeCompare(b.title)), [items]);
  const isPresetCategory = categoryOptions.some((option) => option === draft.category.trim());
  const categorySelectValue = isPresetCategory ? draft.category.trim() : otherCategoryValue;

  const refresh = async () => {
    const list = await fetchUavItems();
    setItems(list);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSave = async () => {
    setMessage("");
    if (!draft.title.trim()) return setMessage("Введите название БПЛА.");
    if (!draft.category.trim()) return setMessage("Выберите категорию БПЛА.");
    if (!draft.image.trim()) return setMessage("Добавьте изображение (ссылка или загрузка файла).");

    const specs = normalizeSpecs(draft.specsText);
    if (specs.length < 5) return setMessage("Заполните 5 строк ТТХ.");

    try {
      await saveUavItem({
        id: draft.id,
        title: draft.title.trim(),
        category: draft.category.trim() || "Без категории",
        image: draft.image.trim(),
        summary: draft.summary.trim(),
        specs: [...specs.slice(0, 5), { key: "Тип двигателя", value: draft.engineType }],
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
      <p className="page-subtitle">Добавление и редактирование БПЛА: изображение, 5 ТТХ и тип двигателя.</p>

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
              value={categorySelectValue}
              onChange={(e) => {
                const nextValue = e.target.value;
                if (nextValue === otherCategoryValue) {
                  setDraft((prev) => ({
                    ...prev,
                    category: categoryOptions.some((option) => option === prev.category.trim()) ? "" : prev.category,
                  }));
                  return;
                }
                setDraft((prev) => ({ ...prev, category: nextValue }));
              }}
            >
              <option value="Ударный">Ударный</option>
              <option value="Разведывательный">Разведывательный</option>
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

            <label className="label">Краткое описание</label>
            <textarea
              className="input"
              rows={2}
              value={draft.summary}
              onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
            />

            <h3 style={{ marginTop: 4 }}>5 строк характеристик</h3>
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
                  engineType: e.target.value as DraftUav["engineType"],
                }))
              }
            >
              <option value="электрический">электрический</option>
              <option value="двс">двс</option>
              <option value="гибридный">гибридный</option>
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

      <div className="list" style={{ marginTop: 12 }}>
        {sortedItems.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className="pill">{item.category}</span>
                <span>{item.specs.length} характеристик</span>
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
      </div>
    </section>
  );
}
