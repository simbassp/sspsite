"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { fetchUavItems } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

export default function UavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

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

  const scrollToCard = (id: string) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

      {items.length > 1 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            backdropFilter: "blur(12px)",
            background: "color-mix(in srgb, var(--bg) 88%, transparent)",
            margin: "0 -16px",
            padding: "8px 16px",
            borderBottom: "1px solid var(--line)",
            marginBottom: 12,
          }}
        >
          <div className="chips">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToCard(item.id)}
                style={{
                  whiteSpace: "nowrap",
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--line-strong)",
                  background: "var(--panel)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-two">
        {items.map((item) => (
          <article
            className="card"
            key={item.id}
            ref={(el) => { cardRefs.current[item.id] = el; }}
          >
            <div
              style={{ position: "relative", cursor: "zoom-in", overflow: "hidden" }}
              onClick={() => !imgErrors[item.id] && setZoomedSrc(item.image)}
            >
              {imgErrors[item.id] ? (
                <div
                  style={{
                    width: "100%",
                    height: 200,
                    background: "var(--panel2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  Нет изображения
                </div>
              ) : (
                <>
                  <Image
                    src={item.image}
                    alt={item.title}
                    width={640}
                    height={360}
                    unoptimized
                    onError={() => setImgErrors((prev) => ({ ...prev, [item.id]: true }))}
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
                </>
              )}
            </div>
            <div className="card-body">
              <div className="meta">
                <span className="pill">{item.category}</span>
              </div>
              <h3 style={{ marginTop: 8 }}>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 8, fontSize: 13 }}>
                {item.summary}
              </p>
              <p className="label" style={{ marginBottom: 6 }}>Ключевые характеристики</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {item.specs.slice(0, 7).map((spec, index) => (
                  <div
                    key={spec.key}
                    style={{
                      gridColumn: index === 6 ? "1 / -1" : undefined,
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
