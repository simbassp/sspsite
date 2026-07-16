"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { canResetTestResults } from "@/lib/permissions";
import { getPositionBadgeClass } from "@/lib/position-ui";
import { formatDateTime } from "@/lib/format";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import {
  matchesUnitFilter,
  UNIT_ASSIGNMENT_OPTIONS,
  unitAssignmentLabel,
  type UnitAssignmentFilter,
} from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";

type DateRange = "all" | "today" | "7d" | "30d";
type TestTypeFilter = "all" | "trial" | "final";
type StatusFilter = "all" | "passed" | "failed" | "not_started";

type UserSummary = {
  userId: string;
  name: string;
  callsign: string;
  position?: string;
  unitAssignment?: UnitAssignment | null;
  status: "passed" | "failed" | "not_started";
  scorePercent: number | null;
  questionsCorrect: number | null;
  questionsTotal: number | null;
  latestFinalAt: string | null;
  usedFinalAttempts: number;
  maxFinalAttempts: number;
  showResetAttempts: boolean;
};

type AttemptRow = {
  id: string;
  userId: string;
  name: string;
  callsign: string;
  position?: string;
  unitAssignment?: UnitAssignment | null;
  type: "trial" | "final";
  status: "passed" | "failed";
  scorePercent: number;
  questionsCorrect: number | null;
  questionsTotal: number | null;
  createdAt: string;
  finalAttemptIndex: number | null;
  showResetAttempts: boolean;
};

type LastPersonAt = { name: string; callsign: string; at: string };

type BannerStats = {
  passedCount: number;
  lastPassed: LastPersonAt | null;
  notPassedCount: number;
  lastNotPassed: LastPersonAt | null;
  trialAttemptsCount: number;
  lastTrial: LastPersonAt | null;
  finalAttemptsCount: number;
  lastFinal: LastPersonAt | null;
};

type BootstrapPayload = {
  ok?: boolean;
  error?: string;
  viewerIsAdmin?: boolean;
  nextAutoResetAt?: string;
  summaries?: UserSummary[];
  attempts?: AttemptRow[];
  bannerStats?: BannerStats;
  lastResetAudit?: {
    created_at: string;
    admin_name: string;
    target_name: string;
    target_callsign: string;
  } | null;
};

const emptyBannerStats: BannerStats = {
  passedCount: 0,
  lastPassed: null,
  notPassedCount: 0,
  lastNotPassed: null,
  trialAttemptsCount: 0,
  lastTrial: null,
  finalAttemptsCount: 0,
  lastFinal: null,
};

function formatLastPersonLine(row: LastPersonAt | null) {
  if (!row) return "Последний: —";
  const who = row.callsign ? `${row.name} (${row.callsign})` : row.name;
  return `Последний: ${who} · ${formatDateTime(row.at)}`;
}

function formatAttemptResult(row: {
  type: "trial" | "final";
  questionsTotal: number | null;
  questionsCorrect: number | null;
  scorePercent: number | null;
}) {
  return formatTestResultForType(row);
}

export default function AdminResultsPage() {
  const session = readClientSession();
  const viewerCanReset = session ? canResetTestResults(session) : false;

  const [range, setRange] = useState<DateRange>("all");
  const [typeFilter, setTypeFilter] = useState<TestTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [unitFilter, setUnitFilter] = useState<UnitAssignmentFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [bannerStats, setBannerStats] = useState<BannerStats>(emptyBannerStats);
  const [lastResetAudit, setLastResetAudit] = useState<BootstrapPayload["lastResetAudit"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState("");
  const [nextAutoResetAt, setNextAutoResetAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/admin/results/bootstrap?range=${encodeURIComponent(range)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as BootstrapPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "admin_results_bootstrap_failed");
      }
      setSummaries(Array.isArray(payload.summaries) ? payload.summaries : []);
      setAttempts(Array.isArray(payload.attempts) ? payload.attempts : []);
      setBannerStats(payload.bannerStats ?? emptyBannerStats);
      setLastResetAudit(payload.lastResetAudit ?? null);
      setNextAutoResetAt(payload.nextAutoResetAt ?? null);
    } catch {
      setLoadError("Не удалось получить данные результатов. Попробуйте обновить страницу.");
      setSummaries([]);
      setAttempts([]);
      setBannerStats(emptyBannerStats);
      setNextAutoResetAt(null);
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeFilter === "trial" && statusFilter === "not_started") {
      setStatusFilter("all");
    }
  }, [typeFilter, statusFilter]);

  const visibleAttempts = useMemo(() => {
    if (statusFilter === "not_started") return [];
    const query = searchTerm.trim().toLowerCase();
    return attempts.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!matchesUnitFilter(unitFilter, row.unitAssignment)) return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.callsign.toLowerCase().includes(query);
    });
  }, [attempts, typeFilter, statusFilter, unitFilter, searchTerm]);

  const visibleNotStarted = useMemo(() => {
    if (statusFilter !== "not_started" || typeFilter === "trial") return [];
    const query = searchTerm.trim().toLowerCase();
    return summaries.filter((row) => {
      if (row.status !== "not_started") return false;
      if (!matchesUnitFilter(unitFilter, row.unitAssignment)) return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.callsign.toLowerCase().includes(query);
    });
  }, [summaries, statusFilter, typeFilter, unitFilter, searchTerm]);

  const onResetAttempts = async (userId: string) => {
    if (!viewerCanReset) return;
    const confirmed = window.confirm("Сбросить попытки итогового теста для этого пользователя?");
    if (!confirmed) return;
    setResetBusyId(userId);
    setResetMessage("");
    try {
      const response = await fetch("/api/admin/results/reset-final", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "reset_failed");
      }
      setResetMessage("Попытки сброшены.");
      await load();
    } catch {
      setResetMessage("Не удалось сбросить попытки.");
    } finally {
      setResetBusyId(null);
    }
  };

  const autoResetText = nextAutoResetAt ? formatDateTime(nextAutoResetAt) : "25-го числа следующего месяца";
  const showNotStartedFilter = typeFilter !== "trial";

  return (
    <section>
      <h1 className="page-title">Админ / Результаты тестов</h1>

      {viewerCanReset && lastResetAudit && (
        <p className="page-subtitle" style={{ marginBottom: 10, fontSize: 11 }}>
          Последний сброс попыток: {formatDateTime(lastResetAudit.created_at)} — {lastResetAudit.admin_name} →{" "}
          {lastResetAudit.target_name}
        </p>
      )}

      <p className="page-subtitle">
        Пробные и итоговые попытки, фильтр по периоду, типу теста и результату.
      </p>
      <div className="selfcheck-hint" style={{ marginBottom: 10 }}>
        Сброс попыток доступен вручную (администратором или пользователем с правом сброса) и автоматически 25-го числа
        каждого месяца. Следующий автосброс: {autoResetText}.
      </div>
      {isLoading && <p className="page-subtitle">Загружаем результаты…</p>}
      {loadError && <p className="page-subtitle">{loadError}</p>}
      {!!resetMessage && <p className="page-subtitle">{resetMessage}</p>}

      <div className="chips" style={{ marginBottom: 8 }}>
        <span className="label" style={{ width: "100%", marginBottom: 4 }}>
          Период
        </span>
        <button className={`chip ${range === "today" ? "active" : ""}`} type="button" onClick={() => setRange("today")}>
          Сегодня
        </button>
        <button className={`chip ${range === "7d" ? "active" : ""}`} type="button" onClick={() => setRange("7d")}>
          За 7 дней
        </button>
        <button className={`chip ${range === "30d" ? "active" : ""}`} type="button" onClick={() => setRange("30d")}>
          За 30 дней
        </button>
        <button className={`chip ${range === "all" ? "active" : ""}`} type="button" onClick={() => setRange("all")}>
          Все
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 8 }}>
        <span className="label" style={{ width: "100%", marginBottom: 4 }}>
          Тип теста
        </span>
        <button
          className={`chip ${typeFilter === "all" ? "active" : ""}`}
          type="button"
          onClick={() => setTypeFilter("all")}
        >
          Все
        </button>
        <button
          className={`chip ${typeFilter === "trial" ? "active" : ""}`}
          type="button"
          onClick={() => setTypeFilter("trial")}
        >
          Пробный
        </button>
        <button
          className={`chip ${typeFilter === "final" ? "active" : ""}`}
          type="button"
          onClick={() => setTypeFilter("final")}
        >
          Итоговый
        </button>
      </div>

      <div className="chips">
        <span className="label" style={{ width: "100%", marginBottom: 4 }}>
          Результат
        </span>
        <button
          className={`chip ${statusFilter === "all" ? "active" : ""}`}
          type="button"
          onClick={() => setStatusFilter("all")}
        >
          Все
        </button>
        <button
          className={`chip ${statusFilter === "passed" ? "active" : ""}`}
          type="button"
          onClick={() => setStatusFilter("passed")}
        >
          Сдал
        </button>
        <button
          className={`chip ${statusFilter === "failed" ? "active" : ""}`}
          type="button"
          onClick={() => setStatusFilter("failed")}
        >
          Не сдал
        </button>
        {showNotStartedFilter && (
          <button
            className={`chip ${statusFilter === "not_started" ? "active" : ""}`}
            type="button"
            onClick={() => setStatusFilter("not_started")}
          >
            Не проходил итог
          </button>
        )}
      </div>

      {!isLoading && !loadError && (
        <>
          <div className="grid grid-two" style={{ marginTop: 14, gap: 12 }}>
            <div className="card">
              <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="home-icon-wrap is-green" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="home-icon-svg">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="label" style={{ marginBottom: 4 }}>
                    Сдали итог
                  </p>
                  <p className="stat-value" style={{ margin: 0 }}>
                    {bannerStats.passedCount}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                    {formatLastPersonLine(bannerStats.lastPassed)}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="home-icon-wrap is-red" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="home-icon-svg">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M15 9l-6 6M9 9l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="label" style={{ marginBottom: 4 }}>
                    Не сдали итог
                  </p>
                  <p className="stat-value" style={{ margin: 0 }}>
                    {bannerStats.notPassedCount}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                    {formatLastPersonLine(bannerStats.lastNotPassed)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-two" style={{ marginTop: 12, gap: 12 }}>
            <div className="card">
              <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="home-icon-wrap is-orange" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="home-icon-svg">
                    <rect x="5" y="4" width="14" height="17" rx="2" />
                    <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                    <line x1="8" y1="11" x2="16" y2="11" />
                    <line x1="8" y1="15" x2="13" y2="15" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="label" style={{ marginBottom: 4 }}>
                    Пробных попыток
                  </p>
                  <p className="stat-value" style={{ margin: 0 }}>
                    {bannerStats.trialAttemptsCount}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                    {formatLastPersonLine(bannerStats.lastTrial)}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="home-icon-wrap is-blue" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="home-icon-svg">
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path d="M8 9h8M8 13h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 3v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="label" style={{ marginBottom: 4 }}>
                    Итоговых попыток
                  </p>
                  <p className="stat-value" style={{ margin: 0 }}>
                    {bannerStats.finalAttemptsCount}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                    {formatLastPersonLine(bannerStats.lastFinal)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <label className="label" htmlFor="results-unit-filter" style={{ marginTop: 12 }}>
        Подразделение
      </label>
      <select
        id="results-unit-filter"
        className="select"
        value={unitFilter}
        onChange={(e) => setUnitFilter(e.target.value as UnitAssignmentFilter)}
        style={{ marginTop: 6, maxWidth: 320 }}
      >
        <option value="all">Все подразделения</option>
        <option value="unset">Не указано</option>
        {UNIT_ASSIGNMENT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unitAssignmentLabel[unit]}
          </option>
        ))}
      </select>

      <label className="label" htmlFor="results-search" style={{ marginTop: 12 }}>
        Поиск по имени и позывному
      </label>
      <input
        id="results-search"
        className="input"
        type="text"
        placeholder="Введите имя или позывной"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ marginTop: 6 }}
      />

      <div className="list" style={{ marginTop: 12 }}>
        {visibleAttempts.map((row) => (
          <article
            className={`card admin-results-card admin-results-card--${row.status}`}
            key={row.id}
          >
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>
                  <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                    {row.name}
                    {row.callsign ? ` (${row.callsign})` : ""}
                  </Link>
                </h3>
                <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                  {row.position || "—"}
                </span>
              </div>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={`pill ${row.type === "trial" ? "pill-orange" : "pill-blue"}`}>
                  {row.type === "trial" ? "Пробный" : "Итоговый"}
                </span>
                <span className={`pill ${row.status === "passed" ? "pill-green" : "pill-red"}`}>
                  {row.status === "passed" ? "Сдал" : "Не сдал"}
                </span>
              </p>
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                Результат: {formatAttemptResult(row)}
              </p>
              {row.type === "final" && row.finalAttemptIndex != null && row.finalAttemptIndex > 0 && (
                <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                  Попытка итога №{row.finalAttemptIndex}
                </p>
              )}
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                Дата: {row.createdAt ? formatDateTime(row.createdAt) : "—"}
              </p>
              {row.showResetAttempts && (
                <button
                  className="btn"
                  type="button"
                  style={{ marginTop: 10 }}
                  disabled={resetBusyId === row.userId}
                  onClick={() => void onResetAttempts(row.userId)}
                >
                  {resetBusyId === row.userId ? "Сброс…" : "Сбросить попытки итога"}
                </button>
              )}
            </div>
          </article>
        ))}

        {visibleNotStarted.map((row) => (
          <article className="card admin-results-card admin-results-card--not_started" key={`ns-${row.userId}`}>
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>
                  <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                    {row.name}
                    {row.callsign ? ` (${row.callsign})` : ""}
                  </Link>
                </h3>
                <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                  {row.position || "—"}
                </span>
              </div>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="pill pill-blue">Итоговый</span>
                <span className="pill pill-yellow">Не проходил</span>
              </p>
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                Итоговый тест ещё не сдавался в выбранном периоде.
              </p>
            </div>
          </article>
        ))}

        {!isLoading && !loadError && visibleAttempts.length === 0 && visibleNotStarted.length === 0 && (
          <p className="page-subtitle">Нет записей по выбранным фильтрам.</p>
        )}
      </div>
    </section>
  );
}
