"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Highlight = {
  name: string;
  callsign: string;
  position?: string;
  created_at?: string;
} | null;

type HomePayload = {
  ok?: boolean;
  error?: string;
  active_users?: unknown;
  news_count?: unknown;
  highlights?: {
    newcomer?: Highlight;
    departed?: Highlight;
    promoted?: Highlight;
    commander?: Highlight;
  };
};

type DashboardData = {
  active: number;
  news: number;
  highlights: {
    newcomer: Highlight;
    departed: Highlight;
    promoted: Highlight;
    commander: Highlight;
  };
};

function parseDashboardData(raw: unknown): DashboardData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as HomePayload;
  const a = o.active_users;
  const n = o.news_count;
  if (typeof a !== "number" || typeof n !== "number") return null;
  return {
    active: a,
    news: n,
    highlights: {
      newcomer: o.highlights?.newcomer ?? null,
      departed: o.highlights?.departed ?? null,
      promoted: o.highlights?.promoted ?? null,
      commander: o.highlights?.commander ?? null,
    },
  };
}

export default function DashboardPage() {
  const [activeUserCount, setActiveUserCount] = useState<number | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<DashboardData["highlights"]>({
    newcomer: null,
    departed: null,
    promoted: null,
    commander: { name: "Владислав", callsign: "Клиган" },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refresh = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/home-stats", { cache: "no-store" });
      const payload = (await response.json()) as HomePayload;
      if (!response.ok || payload.ok !== true) {
        const normalized = (payload.error || "").replace("supabse", "supabase");
        setLoadError(`Не удалось загрузить сводку${normalized ? `: ${normalized}` : ""}`);
        setActiveUserCount(null);
        setNewsCount(null);
        return;
      }
      const parsed = parseDashboardData(payload);
      if (!parsed) {
        setLoadError("Некорректный ответ сервера.");
        setActiveUserCount(null);
        setNewsCount(null);
        return;
      }
      setActiveUserCount(parsed.active);
      setNewsCount(parsed.news);
      setHighlights(parsed.highlights);
    } catch {
      setLoadError("Часть данных не загрузилась. Проверьте интернет и обновите страницу.");
      setActiveUserCount(null);
      setNewsCount(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="dashboard-page">
      <h1 className="page-title">Главная</h1>
      {isLoading && <p className="page-subtitle">Загружаем данные…</p>}
      {loadError && <p className="page-subtitle">{loadError}</p>}

      <div className="dashboard-home-summary">
        <div className="grid grid-two">
          <div className="card dashboard-highlight-card">
            <div className="card-body">
              <p className="label">Наш новый товарищ</p>
              <h3 className="dashboard-highlight-name">
                {highlights.newcomer ? `${highlights.newcomer.name} ${highlights.newcomer.callsign}` : "Нет данных"}
              </h3>
            </div>
          </div>
          <div className="card dashboard-highlight-card">
            <div className="card-body">
              <p className="label">Нас покинул</p>
              <h3 className="dashboard-highlight-name">
                {highlights.departed ? `${highlights.departed.name} ${highlights.departed.callsign}` : "Нет записей"}
              </h3>
            </div>
          </div>
          <div className="card dashboard-highlight-card">
            <div className="card-body">
              <p className="label">В повышении должности</p>
              <h3 className="dashboard-highlight-name">
                {highlights.promoted ? `${highlights.promoted.name} ${highlights.promoted.callsign}` : "Нет записей"}
              </h3>
              {highlights.promoted?.position ? (
                <p className="page-subtitle dashboard-highlight-card__extra">
                  Новая должность: {highlights.promoted.position}
                </p>
              ) : null}
            </div>
          </div>
          <div className="card dashboard-highlight-card">
            <div className="card-body">
              <p className="label">Наш командир</p>
              <h3 className="dashboard-highlight-name">Владислав Клиган</h3>
            </div>
          </div>
        </div>

        <div className="grid grid-two">
          <div className="card">
            <div className="card-body">
              <p className="label">Активных учётных записей</p>
              <p className="stat-value">{activeUserCount === null ? "—" : activeUserCount}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="label">Новостей в ленте</p>
              <p className="stat-value">{newsCount === null ? "—" : newsCount}</p>
            </div>
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
