"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { formatSiteDuration } from "@/lib/site-analytics";
import { useHomeStats } from "@/hooks/useHomeStats";

function formatOnlineUsers(online: Array<{ name: string; callsign: string }>) {
  if (!online.length) return "Онлайн: 0";
  const shown = online.slice(0, 8).map((item) => {
    const name = item.name || "Пользователь";
    return item.callsign ? `${name} ${item.callsign}` : name;
  });
  const extra = online.length > 8 ? ` +${online.length - 8}` : "";
  return `Онлайн: ${online.length} — ${shown.join(", ")}${extra}`;
}

export function SiteFooterStats() {
  const pathname = usePathname();
  const { loading, usersSummary, siteAnalytics } = useHomeStats();

  const text = useMemo(() => {
    if (loading && !usersSummary && !siteAnalytics) return "Загрузка статистики…";
    const parts: string[] = [];
    if (siteAnalytics) {
      parts.push(`Посещений всего: ${siteAnalytics.totalVisits.toLocaleString("ru-RU")}`);
      parts.push(`Общее время всех пользователей: ${formatSiteDuration(siteAnalytics.totalActiveSeconds)}`);
    }
    if (usersSummary) {
      parts.push(`Пользователей: ${usersSummary.totalUsers.toLocaleString("ru-RU")}`);
      parts.push(formatOnlineUsers(usersSummary.onlineUsers));
    }
    return parts.join(" · ");
  }, [loading, siteAnalytics, usersSummary]);

  if (pathname === "/dashboard") return null;

  return <p className="app-site-footer__stats">{text}</p>;
}
