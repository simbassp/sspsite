"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { fetchCounteractionById } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

function parseImages(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function CounteractionDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"overview" | "tth" | "usage" | "materials">("overview");
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [imageIndex, setImageIndex] = useState(0);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const next = await fetchCounteractionById(params.id);
      setItem(next);
    } catch {
      setItem(null);
      setLoadError("Не удалось загрузить карточку. Проверьте интернет и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    setImageIndex(0);
  }, [params.id]);

  if (loading) {
    return <p className="page-subtitle">Загрузка карточки...</p>;
  }

  if (!loading && loadError) {
    return (
      <section>
        <p className="page-subtitle">{loadError}</p>
        <button className="btn" type="button" onClick={() => void load()}>
          Повторить
        </button>
      </section>
    );
  }

  if (!item) {
    return <p className="page-subtitle">Карточка не найдена.</p>;
  }

  const detailsMap = {
    overview: item.details.overview,
    tth: item.details.tth,
    usage: item.details.usage,
    materials: item.details.materials,
  };
  const images = parseImages(item.image).map(publicUploadDisplayUrl).filter(Boolean);
  const activeImage = images[Math.min(imageIndex, Math.max(images.length - 1, 0))] ?? "";

  return (
    <section>
      <h1 className="page-title">{item.title}</h1>
      <p className="page-subtitle">{item.summary}</p>

      <article className="card" style={{ marginBottom: 12 }}>
        <div style={{ position: "relative", overflow: "hidden" }}>
          {activeImage ? (
            <img
              src={activeImage}
              alt={item.title}
              decoding="async"
              style={{ width: "100%", height: 260, objectFit: "cover", objectPosition: "top center" }}
            />
          ) : (
            <div style={{ height: 260, display: "grid", placeItems: "center", color: "var(--muted)" }}>Нет изображения</div>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="btn"
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", padding: "6px 8px" }}
                onClick={() => setImageIndex((prev) => (prev - 1 + images.length) % images.length)}
              >
                ‹
              </button>
              <button
                type="button"
                className="btn"
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", padding: "6px 8px" }}
                onClick={() => setImageIndex((prev) => (prev + 1) % images.length)}
              >
                ›
              </button>
              <div style={{ position: "absolute", right: 10, bottom: 8, fontSize: 11, color: "#fff" }}>
                {Math.min(imageIndex, images.length - 1) + 1}/{images.length}
              </div>
            </>
          )}
        </div>
        <div className="card-body">
          <p className="label">Ключевые характеристики</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            {item.specs.slice(0, 8).map((spec) => (
              <div
                key={spec.key}
                style={{
                  padding: "7px 10px",
                  background: "var(--glass)",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                }}
              >
                <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.3 }}>{spec.key}</p>
                <p style={{ marginTop: 2, fontWeight: 700, fontSize: 13 }}>{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      </article>

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")} type="button">
          Обзор
        </button>
        <button className={`tab ${tab === "tth" ? "active" : ""}`} onClick={() => setTab("tth")} type="button">
          ТТХ
        </button>
        <button className={`tab ${tab === "usage" ? "active" : ""}`} onClick={() => setTab("usage")} type="button">
          Применение
        </button>
        <button className={`tab ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")} type="button">
          Материалы
        </button>
      </div>

      <article className="card">
        <div className="card-body">
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            {detailsMap[tab]}
          </p>
        </div>
      </article>
    </section>
  );
}
