"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchUavItems } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

export default function UavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    fetchUavItems().then(setItems);
  }, []);

  return (
    <section>
      <h1 className="page-title">ТТХ БПЛА</h1>
      <p className="page-subtitle">Быстрый обзор и полная карточка с подробными характеристиками.</p>

      <div className="grid grid-two">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <Image
              src={item.image}
              alt={item.title}
              width={640}
              height={360}
              unoptimized
              style={{ width: "100%", height: 180, objectFit: "cover" }}
            />
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
                {item.specs.slice(0, 6).map((spec) => (
                  <div key={spec.key} className="card">
                    <div className="card-body">
                      <p className="label">{spec.key}</p>
                      <p style={{ marginTop: 6, fontWeight: 700 }}>{spec.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href={`/uav/${item.id}`} className="btn btn-primary" style={{ display: "inline-block", marginTop: 10 }}>
                Полное ТТХ и описание
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
