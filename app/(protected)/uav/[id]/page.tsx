"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { getUavById } from "@/lib/storage";

export default function UavDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"overview" | "tth" | "usage" | "materials">("overview");
  const item = getUavById(params.id);

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

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")} type="button">
          Обзор
        </button>
        <button className={`tab ${tab === "tth" ? "active" : ""}`} onClick={() => setTab("tth")} type="button">
          ТТХ
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
