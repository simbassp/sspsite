"use client";

import { useEffect, useSyncExternalStore } from "react";

export type HomeStatsEvent = {
  id?: string;
  type?: "user_added" | "user_removed" | "position_changed" | "commander_assigned";
  title?: string;
  description?: string;
  created_at?: string | null;
};

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
  events?: HomeStatsEvent[];
  usersSummary?: HomeStatsUsersSummary | null;
  siteAnalytics?: HomeStatsSiteAnalytics | null;
};

type HomeStatsSnapshot = {
  loading: boolean;
  error: boolean;
  events: HomeStatsEvent[];
  usersSummary: HomeStatsUsersSummary | null;
  siteAnalytics: HomeStatsSiteAnalytics | null;
};

const DEFAULT_SNAPSHOT: HomeStatsSnapshot = {
  loading: true,
  error: false,
  events: [],
  usersSummary: null,
  siteAnalytics: null,
};

let snapshot: HomeStatsSnapshot = DEFAULT_SNAPSHOT;
let subscriberCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

async function loadHomeStats() {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch("/api/home-stats", { cache: "no-store" });
      const payload = (await response.json()) as HomeStatsPayload;
      if (!response.ok || payload.ok !== true) {
        snapshot = { ...snapshot, loading: false, error: true };
        emit();
        return;
      }
      snapshot = {
        loading: false,
        error: false,
        events: Array.isArray(payload.events) ? payload.events : [],
        usersSummary: payload.usersSummary ?? null,
        siteAnalytics: payload.siteAnalytics ?? null,
      };
      emit();
    } catch {
      snapshot = { ...snapshot, loading: false, error: true };
      emit();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

function startPolling(pollMs: number) {
  subscriberCount += 1;
  if (subscriberCount === 1) {
    void loadHomeStats();
    pollTimer = setInterval(() => {
      void loadHomeStats();
    }, pollMs);
  } else if (snapshot.loading && !inflight) {
    void loadHomeStats();
  }

  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export function useHomeStats(pollMs = 45_000) {
  const storeSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => startPolling(pollMs), [pollMs]);

  return {
    loading: storeSnapshot.loading,
    error: storeSnapshot.error,
    events: storeSnapshot.events,
    usersSummary: storeSnapshot.usersSummary,
    siteAnalytics: storeSnapshot.siteAnalytics,
  };
}
