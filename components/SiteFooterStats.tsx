"use client";

import { useEffect, useMemo, useState } from "react";
import { formatSiteDuration } from "@/lib/site-analytics";

type UsersSummary = {
  totalUsers: number;
  onlineUsers: Array<{ id: string; name: string; callsign: string }>;
};

type SiteAnalytics = {
  totalVisits: number;
  totalActiveSeconds: number;
};

type HomeStatsPayload = {
  ok?: boolean;
  usersSummary?: UsersSummary | null;
  siteAnalytics?: SiteAnalytics | null;
};

function formatOnlineUsers(online: UsersSummary["onlineUsers"]) {
  if (!online.length) return "Онлайн: 0";
  const shown = online.slice(0, 8).map((item) => {
    const name = item.name || "Пользователь";
    return item.callsign ? `${name} ${item.callsign}` : name;
  });
  const extra = online.length > 8 ? ` +${online.length - 8}` : "";
  return `Онлайн: ${online.length} — ${shown.join(", ")}${extra}`;
}

export function SiteFooterStats() {
  const [usersSummary, setUsersSummary] = useState<UsersSummary | null>(null);
  const [siteAnalytics, setSiteAnalytics] = useState<SiteAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/home-stats", { cache: "no-store" });
        const payload = (await response.json()) as HomeStatsPayload;
        if (cancelled || !response.ok || payload.ok !== true) return;
        setUsersSummary(payload.usersSummary ?? null);
        setSiteAnalytics(payload.siteAnalytics ?? null);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 45_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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

  return <p className="app-site-footer__stats">{text}</p>;
}
