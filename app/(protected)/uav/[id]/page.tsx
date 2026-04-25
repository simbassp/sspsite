"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchUavById } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

export default function UavDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"overview" | "tth" | "usage" | "materials">("overview");
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchUavById(params.id)
      .then((row) => {
        if (active) setItem(row);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return <p className="page-subtitle">Загрузка карточки БПЛА...</p>;
  }

  if (!item) {
    return <p className="page-subtitle">Карточка БПЛА не найдена.</p>;
  }

  const detailsMap = {
    overview: item.details.overview,
    tth: item.details.tth,
    usage: item.details.usage,
    materials: item.details.materials,
  };

  return (
    <section>
      <h1 className="page-title">{item.title}</h1>
      <p className="page-subtitle">{item.summary}</p>

      <article className="card" style={{ marginBottom: 12 }}>
        <div className="card-body">
          <p className="label">Ключевые характеристики</p>
          <div className="grid grid-two" style={{ marginTop: 8 }}>
            {item.specs.slice(0, 7).map((spec, index) => (
              <div
                className="card"
                key={`${spec.key}-${index}`}
                style={index === 6 ? { gridColumn: "1 / -1" } : undefined}
              >
                <div className="card-body">
                  <p className="label">{spec.key}</p>
                  <p style={{ marginTop: 6, fontWeight: 700 }}>{spec.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")} type="button">
          Описание
        </button>
        <button className={`tab ${tab === "tth" ? "active" : ""}`} onClick={() => setTab("tth")} type="button">
          Полное ТТХ
        </button>
        <button className={`tab ${tab === "usage" ? "active" : ""}`} onClick={() => setTab("usage")} type="button">
          Уязвимости
        </button>
        <button className={`tab ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")} type="button">
          Обнаружение
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
