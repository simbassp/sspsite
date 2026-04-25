"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { fetchCounteractionItems } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

export default function CounteractionPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    fetchCounteractionItems().then(setItems);
  }, []);

  return (
    <section>
      <h1 className="page-title">Противодействие</h1>
      <p className="page-subtitle">Каталог со сжатыми параметрами и переходом в детальные вкладки.</p>

      <div className="grid grid-two">
        {items.map((item) => {
          const imageSrc = publicUploadDisplayUrl(item.image);
          return (
          <article className="card" key={item.id}>
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={item.title}
                decoding="async"
                style={{ width: "100%", height: 180, objectFit: "cover" }}
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
            <div className="card-body">
              <div className="meta">
                <span className="pill">{item.category}</span>
              </div>
              <h3 style={{ marginTop: 8 }}>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 8 }}>
                {item.summary}
              </p>
              <div className="grid grid-two">
                {item.specs.map((spec) => (
                  <div key={spec.key} className="card">
                    <div className="card-body">
                      <p className="label">{spec.key}</p>
                      <p style={{ marginTop: 6, fontWeight: 700 }}>{spec.value}</p>
                    </div>
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
