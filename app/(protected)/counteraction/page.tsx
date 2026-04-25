"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { fetchCounteractionItems } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

function parseImages(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function CounteractionPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [imageIndexes, setImageIndexes] = useState<Record<string, number>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    fetchCounteractionItems().then(setItems);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 819px)");
    const apply = () => {
      const header = document.getElementById("mobile-app-header");
      if (!mq.matches || !header) {
        document.documentElement.style.removeProperty("--uav-sticky-below-header");
        return;
      }
      const h = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--uav-sticky-below-header", `${h}px`);
    };
    apply();
    const header = document.getElementById("mobile-app-header");
    const ro = header ? new ResizeObserver(apply) : null;
    if (header && ro) ro.observe(header);
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      ro?.disconnect();
      document.documentElement.style.removeProperty("--uav-sticky-below-header");
    };
  }, []);

  const scrollToCard = (id: string) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section>
      <h1 className="page-title">Противодействие</h1>
      <p className="page-subtitle">Каталог со сжатыми параметрами и переходом в детальные вкладки.</p>

      {items.length > 1 && (
        <div className="uav-model-nav">
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
        {items.map((item) => {
          const images = parseImages(item.image).map(publicUploadDisplayUrl).filter(Boolean);
          const activeIndex = Math.min(imageIndexes[item.id] ?? 0, Math.max(images.length - 1, 0));
          const imageSrc = images[activeIndex] ?? "";
          return (
          <article className="card" key={item.id} ref={(el) => { cardRefs.current[item.id] = el; }}>
            <div style={{ position: "relative", overflow: "hidden" }}>
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={item.title}
                  decoding="async"
                  style={{ width: "100%", height: 180, objectFit: "cover", objectPosition: "top center" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 180,
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
              )}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="btn"
                    style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", padding: "6px 8px" }}
                    onClick={() =>
                      setImageIndexes((prev) => ({
                        ...prev,
                        [item.id]: (activeIndex - 1 + images.length) % images.length,
                      }))
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", padding: "6px 8px" }}
                    onClick={() =>
                      setImageIndexes((prev) => ({
                        ...prev,
                        [item.id]: (activeIndex + 1) % images.length,
                      }))
                    }
                  >
                    ›
                  </button>
                  <div style={{ position: "absolute", right: 10, bottom: 8, fontSize: 11, color: "#fff" }}>
                    {activeIndex + 1}/{images.length}
                  </div>
                </>
              )}
            </div>
            <div className="card-body">
              <div className="meta">
                <span className="pill">{item.category}</span>
              </div>
              <h3 style={{ marginTop: 8 }}>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 8 }}>
                {item.summary}
              </p>
              <p className="label" style={{ marginBottom: 6 }}>Ключевые характеристики</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
              <Link href={`/counteraction/${item.id}`} className="btn btn-primary" style={{ display: "inline-block", marginTop: 10 }}>
                Подробнее
              </Link>
            </div>
          </article>
        );
        })}
      </div>
    </section>
  );
}
