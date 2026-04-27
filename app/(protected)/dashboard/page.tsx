"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
type CountsPayload = { active_users?: unknown; news_count?: unknown };

function parseCounts(raw: unknown): { active: number; news: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as CountsPayload;
  const a = o.active_users;
  const n = o.news_count;
  if (typeof a !== "number" || typeof n !== "number") return null;
  return { active: a, news: n };
}

export default function DashboardPage() {
  const [activeUserCount, setActiveUserCount] = useState<number | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/home-stats", { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; error?: string } & CountsPayload;
        if (cancelled) return;
        if (!response.ok || payload.ok !== true) {
          setLoadError(`Не удалось загрузить сводку${payload.error ? `: ${payload.error}` : ""}`);
          setActiveUserCount(null);
          setNewsCount(null);
          return;
        }
        const parsed = parseCounts(payload);
        if (!parsed) {
          setLoadError("Некорректный ответ сервера.");
          setActiveUserCount(null);
          setNewsCount(null);
          return;
        }
        setActiveUserCount(parsed.active);
        setNewsCount(parsed.news);
      } catch {
        if (cancelled) return;
        setLoadError("Часть данных не загрузилась. Проверьте интернет и обновите страницу.");
        setActiveUserCount(null);
        setNewsCount(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h1 className="page-title">Главная</h1>
      {isLoading && <p className="page-subtitle">Загружаем данные…</p>}
      {loadError && <p className="page-subtitle">{loadError}</p>}

      <div className="grid grid-two">
        <div className="card">
          <div className="card-body">
            <p className="label">Активных учётных записей</p>
            <p className="label" style={{ marginTop: 6, fontSize: 12 }}>
              Всего в системе (статус «активен»)
            </p>
            <p className="stat-value">{activeUserCount === null ? "—" : activeUserCount}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Новостей в ленте</p>
            <p className="label" style={{ marginTop: 6, fontSize: 12 }}>
              Записей в разделе «Новости»
            </p>
            <p className="stat-value">{newsCount === null ? "—" : newsCount}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-two" style={{ marginTop: 12 }}>
        <Link href="/news" className="card">
          <div className="card-body">
            <h3>Новости</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Важные сообщения и уведомления.
            </p>
          </div>
        </Link>
        <Link href="/counteraction" className="card">
          <div className="card-body">
            <h3>Противодействие</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Каталог карточек со структурированными ТТХ.
            </p>
          </div>
        </Link>
        <Link href="/uav" className="card">
          <div className="card-body">
            <h3>ТТХ БПЛА</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Отдельные карточки и детальные страницы.
            </p>
          </div>
        </Link>
        <Link href="/tests" className="card">
          <div className="card-body">
            <h3>Тесты</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Пробный мягкий режим и строгий итоговый.
            </p>
          </div>
        </Link>
        <Link href="/profile" className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-body">
            <h3>Профиль</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Ваши данные и личные результаты тестов.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}
