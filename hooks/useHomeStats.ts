"use client";

import { useEffect, useState } from "react";

export type HomeStatsUsersSummary = {
  totalUsers: number;
  onlineUsers: Array<{ id: string; name: string; callsign: string }>;
};

export type HomeStatsSiteAnalytics = {
  totalVisits: number;
  totalActiveSeconds: number;
};

type HomeStatsPayload = {
  ok?: boolean;
  usersSummary?: HomeStatsUsersSummary | null;
  siteAnalytics?: HomeStatsSiteAnalytics | null;
};

export function useHomeStats(pollMs = 45_000) {
  const [usersSummary, setUsersSummary] = useState<HomeStatsUsersSummary | null>(null);
  const [siteAnalytics, setSiteAnalytics] = useState<HomeStatsSiteAnalytics | null>(null);
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
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return { loading, usersSummary, siteAnalytics };
}
