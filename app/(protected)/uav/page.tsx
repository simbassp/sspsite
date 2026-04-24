"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { listUav } from "@/lib/storage";
import { CatalogItem } from "@/lib/types";

export default function UavPage() {
  const [items] = useState<CatalogItem[]>(() => listUav());

  return (
    <section>
      <h1 className="page-title">ТТХ БПЛА</h1>
      <p className="page-subtitle">Быстрый обзор и детальная карточка с отдельными вкладками.</p>

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
              <Link href={`/uav/${item.id}`} className="btn btn-primary" style={{ display: "inline-block", marginTop: 10 }}>
                Открыть карточку
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
