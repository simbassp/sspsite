"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchUavItems } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

export default function UavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchUavItems()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!zoomedSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomedSrc(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoomedSrc]);

  return (
    <section>
      <h1 className="page-title">ТТХ БПЛА</h1>
      <p className="page-subtitle">Быстрый обзор и полная карточка с подробными характеристиками.</p>

      {loading && <p className="page-subtitle">Загрузка карточек БПЛА...</p>}
      {!loading && items.length === 0 && (
        <p className="page-subtitle">
          Пока нет доступных карточек БПЛА. Проверьте подключение к сети и обновите страницу.
        </p>
      )}

      <div className="grid grid-two">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <div
              style={{ position: "relative", cursor: "zoom-in", overflow: "hidden" }}
              onClick={() => setZoomedSrc(item.image)}
            >
              <Image
                src={item.image}
                alt={item.title}
                width={640}
                height={360}
                unoptimized
                style={{
                  width: "100%",
                  height: 200,
                  objectFit: "cover",
                  objectPosition: "top center",
                  display: "block",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 90,
                  zIndex: 1,
                  background: "linear-gradient(to top, rgba(7,9,13,0.95) 0%, rgba(7,9,13,0.4) 50%, transparent 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>
            <div className="card-body">
              <div className="meta">
                <span className="pill">{item.category}</span>
              </div>
              <h3 style={{ marginTop: 8 }}>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 8 }}>
                {item.summary}
              </p>
              <p className="label">Ключевые характеристики</p>
              <div className="grid grid-two">
                {item.specs.slice(0, 7).map((spec, index) => (
                  <div
                    key={spec.key}
                    className="card"
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
        ))}
      </div>

      {zoomedSrc && (
        <div
          onClick={() => setZoomedSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            cursor: "zoom-out",
          }}
        >
          <img
            src={zoomedSrc}
            alt=""
            style={{
              maxWidth: "100%",
              maxHeight: "90vh",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              objectFit: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomedSrc(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
