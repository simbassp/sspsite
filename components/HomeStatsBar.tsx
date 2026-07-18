"use client";

import type { ReactNode } from "react";
import { formatSiteDuration } from "@/lib/site-analytics";
import { useHomeStats } from "@/hooks/useHomeStats";

function formatOnlineNames(online: Array<{ name: string; callsign: string }>) {
  if (!online.length) return "—";
  return online
    .map((item) => {
      const name = item.name || "Пользователь";
      return item.callsign ? `${name} ${item.callsign}` : name;
    })
    .join(", ");
}

type StatItemProps = {
  icon: ReactNode;
  label: string;
  value: string;
  wide?: boolean;
};

function StatItem({ icon, label, value, wide = false }: StatItemProps) {
  return (
    <div className={`home-stats-bar__item${wide ? " home-stats-bar__item--wide" : ""}`}>
      <span className="home-stats-bar__icon" aria-hidden>
        {icon}
      </span>
      <span className="home-stats-bar__content">
        <span className="home-stats-bar__label">{label}</span>
        <span className={`home-stats-bar__value${wide ? " home-stats-bar__value--names" : ""}`}>{value}</span>
      </span>
    </div>
  );
}

export function HomeStatsBar() {
  const { loading, usersSummary, siteAnalytics } = useHomeStats();

  const visits = siteAnalytics ? siteAnalytics.totalVisits.toLocaleString("ru-RU") : loading ? "…" : "—";
  const duration = siteAnalytics
    ? formatSiteDuration(siteAnalytics.totalActiveSeconds)
    : loading
      ? "…"
      : "—";
  const totalUsers = usersSummary ? usersSummary.totalUsers.toLocaleString("ru-RU") : loading ? "…" : "—";
  const onlineCount = usersSummary ? String(usersSummary.onlineUsers.length) : loading ? "…" : "0";
  const onlineNames = usersSummary ? formatOnlineNames(usersSummary.onlineUsers) : loading ? "…" : "—";

  return (
    <article className="card home-stats-bar">
      <div className="card-body home-stats-bar__body">
        <StatItem
          icon={
            <svg viewBox="0 0 24 24" className="home-icon-svg">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3.5 19c1.6-3 3.8-4.5 5.5-4.5s3.9 1.5 5.5 4.5" />
              <circle cx="17" cy="9" r="2.8" />
              <path d="M14.5 19c1-2 2.4-3 3.5-3s2.5 1 3.5 3" />
            </svg>
          }
          label="Посещений всего"
          value={visits}
        />
        <StatItem
          icon={
            <svg viewBox="0 0 24 24" className="home-icon-svg">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          label="Общее время всех пользователей"
          value={duration}
        />
        <StatItem
          icon={
            <svg viewBox="0 0 24 24" className="home-icon-svg">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.8-3.8 4.5-5.5 8-5.5s6.2 1.7 8 5.5" />
            </svg>
          }
          label="Пользователей"
          value={totalUsers}
        />
        <StatItem
          icon={<span className="home-stats-bar__online-dot" />}
          label="Онлайн"
          value={onlineCount}
        />
        <StatItem
          wide
          icon={
            <svg viewBox="0 0 24 24" className="home-icon-svg">
              <circle cx="8" cy="9" r="2.8" />
              <circle cx="16" cy="9" r="2.8" />
              <path d="M3.5 19c1.2-2.4 2.8-3.5 4.5-3.5s3.3 1.1 4.5 3.5" />
              <path d="M11.5 19c1.2-2.4 2.8-3.5 4.5-3.5s3.3 1.1 4.5 3.5" />
            </svg>
          }
          label="Сейчас в системе"
          value={onlineNames}
        />
      </div>
    </article>
  );
}
