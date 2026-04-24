"use client";

import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { fetchUserResults } from "@/lib/tests-repository";
import { TestResult } from "@/lib/types";

export default function ProfilePage() {
  const session = useMemo(() => readClientSession(), []);
  const [rows, setRows] = useState<TestResult[]>([]);

  useEffect(() => {
    if (!session) return;
    fetchUserResults(session.id).then(setRows);
  }, [session]);

  const stats = useMemo(() => {
    if (!session) return { average: 0, best: 0, total: 0 };
    const total = rows.length;
    const average = total ? Math.round(rows.reduce((acc, r) => acc + r.score, 0) / total) : 0;
    const best = total ? Math.max(...rows.map((r) => r.score)) : 0;
    return { average, best, total };
  }, [rows, session]);

  if (!session) {
    return <p className="page-subtitle">Профиль не найден.</p>;
  }

  return (
    <section>
      <h1 className="page-title">Профиль</h1>
      <article className="card">
        <div className="card-body">
          <h3>{session.name}</h3>
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            {session.callsign} • {session.position}
          </p>
          <div className="grid grid-two">
            <div className="card">
              <div className="card-body">
                <p className="label">Средний балл</p>
                <p className="stat-value">{stats.average}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Лучшая попытка</p>
                <p className="stat-value">{stats.best}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Всего попыток</p>
                <p className="stat-value">{stats.total}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">План на будущее</p>
                <p style={{ marginTop: 8 }}>Вход по Face ID / отпечатку / WebAuthn (подготовлено).</p>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
