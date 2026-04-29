"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { resolvePermissions } from "@/lib/permissions";

type HomePayload = {
  ok?: boolean;
  error?: string;
  events?: Array<{
    id?: string;
    type?: "user_added" | "user_removed" | "position_changed" | "commander_assigned";
    title?: string;
    description?: string;
    created_at?: string | null;
  }>;
  usersSummary?: {
    totalUsers?: number;
    onlineUsers?: Array<{
      id?: string;
      name?: string;
      callsign?: string;
    }>;
  } | null;
};

type HomeEvent = {
  id: string;
  type: "user_added" | "user_removed" | "position_changed" | "commander_assigned";
  title: string;
  description: string;
  createdAt: string | null;
};

type OnlineUser = {
  id: string;
  name: string;
  callsign: string;
};

type UsersSummary = {
  totalUsers: number;
  onlineUsers: OnlineUser[];
};

function parsePayload(raw: unknown): { events: HomeEvent[]; usersSummary: UsersSummary | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as HomePayload;
  const sourceEvents = Array.isArray(o.events) ? o.events : [];
  const events: HomeEvent[] = sourceEvents
    .map((item, index) => ({
      id: String(item.id || `${item.type || "event"}:${item.created_at || index}`),
      type: item.type || "user_added",
      title: String(item.title || ""),
      description: String(item.description || ""),
      createdAt: item.created_at ? String(item.created_at) : null,
    }))
    .filter((item) => item.title.length > 0);
  let usersSummary: UsersSummary | null = null;
  if (o.usersSummary && typeof o.usersSummary === "object") {
    const totalUsers = Number(o.usersSummary.totalUsers ?? 0);
    const online = Array.isArray(o.usersSummary.onlineUsers) ? o.usersSummary.onlineUsers : [];
    usersSummary = {
      totalUsers: Number.isFinite(totalUsers) ? totalUsers : 0,
      onlineUsers: online.map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        callsign: String(item.callsign || ""),
      })),
    };
  }
  return {
    events,
    usersSummary,
  };
}

function formatDayLabel(dateValue: string | null) {
  if (!dateValue) return "Без даты";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "Без даты";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dayOnly.getTime() === today.getTime()) return "Сегодня";
  if (dayOnly.getTime() === yesterday.getTime()) return "Вчера";
  return d.toLocaleDateString("ru-RU");
}

function formatTimeLabel(dateValue: string | null) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function iconByType(type: HomeEvent["type"]) {
  if (type === "user_removed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
        <circle cx="10" cy="8" r="4" />
        <path d="M3.5 19c1.5-3.2 3.8-4.8 6.5-4.8" />
        <line x1="15" y1="16" x2="21" y2="16" />
      </svg>
    );
  }
  if (type === "position_changed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8l1.5 2.7L16.5 11l-2.2 2.2.5 3L12 15l-2.8 1.2.5-3L7.5 11l3-.3z" />
      </svg>
    );
  }
  if (type === "commander_assigned") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
        <path d="M4 8l3.5 2.5L12 6l4.5 4.5L20 8v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
      <circle cx="10" cy="8" r="4" />
      <path d="M3.5 19c1.5-3.2 3.8-4.8 6.5-4.8s5 1.6 6.5 4.8" />
      <path d="M18 7v6M15 10h6" />
    </svg>
  );
}

export default function DashboardPage() {
  const session = useMemo(() => readClientSession(), []);
  const permissions = resolvePermissions(session);
  const canSeeUserStats = Boolean(permissions.users || permissions.online);
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [usersSummary, setUsersSummary] = useState<UsersSummary | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [statsError, setStatsError] = useState("");

  const sections = useMemo(() => {
    const base = [
      {
        href: "/news",
        title: "Новости",
        description: "Важные сообщения и уведомления.",
        color: "purple",
        visible: permissions.news,
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
            <rect x="4" y="4" width="13" height="16" rx="2" />
            <path d="M17 7h3v11a2 2 0 0 1-2 2" />
            <line x1="7" y1="9" x2="14" y2="9" />
            <line x1="7" y1="13" x2="14" y2="13" />
          </svg>
        ),
      },
      {
        href: "/counteraction",
        title: "Противодействие",
        description: "Каталог карточек со структурированными ТТХ.",
        color: "green",
        visible: permissions.counteraction,
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
            <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6l8-3z" />
            <path d="M9 12.5l2 2 4-4" />
          </svg>
        ),
      },
      {
        href: "/uav",
        title: "ТТХ БПЛА",
        description: "Отдельные карточки и детальные страницы.",
        color: "blue",
        visible: permissions.uav,
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
            <circle cx="12" cy="12" r="2.3" />
            <circle cx="5.5" cy="5.5" r="2" />
            <circle cx="18.5" cy="5.5" r="2" />
            <circle cx="5.5" cy="18.5" r="2" />
            <circle cx="18.5" cy="18.5" r="2" />
            <path d="M7 7l3.4 3.4M17 7l-3.4 3.4M7 17l3.4-3.4M17 17l-3.4-3.4" />
          </svg>
        ),
      },
      {
        href: "/tests",
        title: "Тесты",
        description: "Пробный мягкий режим и строгий итоговый.",
        color: "orange",
        visible: permissions.tests,
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
            <line x1="8" y1="11" x2="16" y2="11" />
            <line x1="8" y1="15" x2="13" y2="15" />
          </svg>
        ),
      },
      {
        href: "/profile",
        title: "Профиль",
        description: "Ваши данные и личные результаты тестов.",
        color: "sky",
        visible: true,
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.8-3.8 4.5-5.5 8-5.5s6.2 1.7 8 5.5" />
          </svg>
        ),
      },
    ];
    const visibleBase = base.filter((item) => item.visible).map(({ visible, ...rest }) => rest);
    const admin = [
      permissions.users
        ? {
            href: "/admin/users",
            title: "Пользователи",
            description: "Управление пользователями и доступом.",
            color: "green",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
                <circle cx="9" cy="8" r="3" />
                <circle cx="16.5" cy="9" r="2.5" />
                <path d="M3 18c1.5-3 3.7-4.4 6-4.4s4.5 1.4 6 4.4" />
                <path d="M14.5 17.5c.7-1.7 2-2.8 3.8-3.2" />
              </svg>
            ),
          }
        : null,
      permissions.results
        ? {
            href: "/admin/results",
            title: "Результаты",
            description: "Просмотр результатов тестирования.",
            color: "blue",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
                <line x1="5" y1="20" x2="19" y2="20" />
                <rect x="6" y="11" width="3" height="7" rx="1" />
                <rect x="11" y="8" width="3" height="10" rx="1" />
                <rect x="16" y="5" width="3" height="13" rx="1" />
              </svg>
            ),
          }
        : null,
    ].filter(Boolean);
    return [...visibleBase, ...admin].filter((item): item is NonNullable<(typeof admin)[number]> => Boolean(item));
  }, [permissions.news, permissions.counteraction, permissions.uav, permissions.tests, permissions.users, permissions.results]);

  const refresh = async () => {
    setIsLoadingEvents(true);
    setIsLoadingStats(true);
    setEventsError("");
    setStatsError("");
    try {
      const response = await fetch("/api/home-stats", { cache: "no-store" });
      const payload = (await response.json()) as HomePayload;
      if (!response.ok || payload.ok !== true) {
        setEventsError("Не удалось загрузить события.");
        if (canSeeUserStats) setStatsError("Статистика пользователей недоступна.");
        return;
      }
      const parsed = parsePayload(payload);
      if (!parsed) {
        setEventsError("Не удалось загрузить события.");
        if (canSeeUserStats) setStatsError("Статистика пользователей недоступна.");
        return;
      }
      setEvents(parsed.events);
      setUsersSummary(parsed.usersSummary);
      if (canSeeUserStats && !parsed.usersSummary) {
        setStatsError("Статистика пользователей недоступна.");
      }
    } catch {
      setEventsError("Не удалось загрузить события.");
      if (canSeeUserStats) setStatsError("Статистика пользователей недоступна.");
    } finally {
      setIsLoadingEvents(false);
      setIsLoadingStats(false);
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

  const usersSummaryText = useMemo(() => {
    if (!usersSummary) return "";
    const total = usersSummary.totalUsers;
    const online = usersSummary.onlineUsers;
    if (!online.length) return `Пользователей: ${total} · Онлайн: 0`;
    const shown = online.slice(0, 3).map((item) => {
      const name = item.name || "Пользователь";
      return item.callsign ? `${name} (@${item.callsign})` : name;
    });
    const extra = online.length > 3 ? ` +${online.length - 3}` : "";
    return `Пользователей: ${total} · Онлайн: ${online.length} — ${shown.join(", ")}${extra}`;
  }, [usersSummary]);

  return (
    <section className="dashboard-page">
      <h1 className="page-title">Главная</h1>
      <p className="page-subtitle">Быстрый доступ к разделам системы.</p>
      <div className="dashboard-page__stack">
        <article className="card">
          <div className="card-body">
            <h3>Разделы системы</h3>
            <div className="home-sections-grid">
              {sections.map((section) => (
                <Link href={section.href} key={`${section.href}:${section.title}`} className="home-section-card">
                  <span className={`home-icon-wrap is-${section.color}`}>{section.icon}</span>
                  <span className="home-section-main">
                    <span className="home-section-title">{section.title}</span>
                    <span className="home-section-desc">{section.description}</span>
                  </span>
                  <span className="home-section-arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="home-icon-svg">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-body">
            <div className="home-events-head">
              <h3>Последние события</h3>
            </div>
            {isLoadingEvents ? (
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                Загрузка событий...
              </p>
            ) : eventsError ? (
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {eventsError}
              </p>
            ) : !events.length ? (
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                Пока нет событий.
              </p>
            ) : (
              <div className="home-events-list">
                {events.map((item) => (
                  <article className="home-event-row" key={item.id}>
                    <span className={`home-event-icon is-${item.type}`}>{iconByType(item.type)}</span>
                    <span className="home-event-main">
                      <span className="home-event-title">{item.title}</span>
                      <span className="home-event-desc">{item.description}</span>
                    </span>
                    <span className="home-event-time">
                      <span>{formatTimeLabel(item.createdAt)}</span>
                      <span>{formatDayLabel(item.createdAt)}</span>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </article>

        {canSeeUserStats && (
          <p className="home-users-summary">
            {isLoadingStats
              ? "Загрузка статистики..."
              : statsError
                ? statsError
                : usersSummaryText || "Пользователей: 0 · Онлайн: 0"}
          </p>
        )}
      </div>
    </section>
  );
}
