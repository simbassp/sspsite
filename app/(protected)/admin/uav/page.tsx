"use client";

import { useState } from "react";
import { listUav } from "@/lib/storage";
import { CatalogItem } from "@/lib/types";

export default function AdminUavPage() {
  const [items] = useState<CatalogItem[]>(() => listUav());

  return (
    <section>
      <h1 className="page-title">Админ / БПЛА</h1>
      <p className="page-subtitle">Раздел контроля справочника БПЛА и угроз.</p>
      <div className="list">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className="pill">{item.category}</span>
                <span>{item.specs.length} ключевых параметров</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
