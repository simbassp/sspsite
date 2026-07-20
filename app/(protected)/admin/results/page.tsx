"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { canResetTestResults } from "@/lib/permissions";
import { getPositionBadgeClass } from "@/lib/position-ui";
import { formatDateTime } from "@/lib/format";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import {
  matchesResultsUnitFilter,
  UNIT_ASSIGNMENT_OPTIONS,
  unitAssignmentLabel,
  type RotaPlatoonFilter,
  type RotaSectionFilter,
  type UnitAssignmentFilter,
} from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import { ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS } from "@/lib/personnel-catalog";

type PeriodMode = "all" | "today" | "custom";
type TestTypeFilter = "all" | "trial" | "final";
type StatusFilter = "all" | "passed" | "failed" | "not_started";

type UserSummary = {
  userId: string;
  name: string;
  callsign: string;
  position?: string;
  unitAssignment?: UnitAssignment | null;
  rotaPlatoon?: number | null;
  rotaSection?: number | null;
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
  rotaPlatoon?: number | null;
  rotaSection?: number | null;
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

  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TestTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [unitFilter, setUnitFilter] = useState<UnitAssignmentFilter>("all");
  const [rotaPlatoon, setRotaPlatoon] = useState<RotaPlatoonFilter>("all");
  const [rotaSection, setRotaSection] = useState<RotaSectionFilter>("all");
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
      const params = new URLSearchParams();
      if (periodMode === "today") {
        params.set("range", "today");
      } else if (periodMode === "custom") {
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
      }
      const response = await fetch(`/api/admin/results/bootstrap?${params.toString()}`, {
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
  }, [periodMode, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeFilter === "trial" && statusFilter === "not_started") {
      setStatusFilter("all");
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    if (unitFilter !== "company_4") {
      setRotaPlatoon("all");
      setRotaSection("all");
    }
  }, [unitFilter]);

  const visibleAttempts = useMemo(() => {
    if (statusFilter === "not_started") return [];
    const query = searchTerm.trim().toLowerCase();
    return attempts.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!matchesResultsUnitFilter(unitFilter, rotaPlatoon, rotaSection, row)) return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.callsign.toLowerCase().includes(query);
    });
  }, [attempts, typeFilter, statusFilter, unitFilter, rotaPlatoon, rotaSection, searchTerm]);

  const visibleNotStarted = useMemo(() => {
    if (statusFilter !== "not_started" || typeFilter === "trial") return [];
    const query = searchTerm.trim().toLowerCase();
    return summaries.filter((row) => {
      if (row.status !== "not_started") return false;
      if (!matchesResultsUnitFilter(unitFilter, rotaPlatoon, rotaSection, row)) return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.callsign.toLowerCase().includes(query);
    });
  }, [summaries, statusFilter, typeFilter, unitFilter, rotaPlatoon, rotaSection, searchTerm]);

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
    <section className="admin-results-page">
      <h1 className="page-title">Админ / Результаты тестов</h1>

      {viewerCanReset && lastResetAudit && (
        <p className="page-subtitle" style={{ marginBottom: 10, fontSize: 11 }}>
          Последний сброс попыток: {formatDateTime(lastResetAudit.created_at)} — {lastResetAudit.admin_name} →{" "}
          {lastResetAudit.target_name}
        </p>
      )}

      <p className="page-subtitle">
        Пробные и итоговые попытки. Фильтры по периоду, подразделению, типу теста и результату.
      </p>
      <div className="selfcheck-hint" style={{ marginBottom: 10 }}>
        Сброс попыток доступен вручную (администратором или пользователем с правом сброса) и автоматически 25-го числа
        каждого месяца. Следующий автосброс: {autoResetText}.
      </div>
      {isLoading && <p className="page-subtitle">Загружаем результаты…</p>}
      {loadError && <p className="page-subtitle">{loadError}</p>}
      {!!resetMessage && <p className="page-subtitle">{resetMessage}</p>}

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body personnel-filters admin-results-filters">
          <div
            className={`personnel-filters__row admin-results-filters__row--primary${unitFilter === "company_4" ? " has-rota" : ""}`}
          >
            <div className="personnel-filters__field admin-results-filters__period">
              <p className="label">Период</p>
              <div className="admin-results-period">
                <input
                  className="input admin-results-period__date"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPeriodMode(e.target.value || dateTo ? "custom" : "all");
                  }}
                />
                <span className="admin-results-period__sep">—</span>
                <input
                  className="input admin-results-period__date"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPeriodMode(e.target.value || dateFrom ? "custom" : "all");
                  }}
                />
                <button
                  className={`btn ${periodMode === "today" ? "btn-primary" : ""}`}
                  type="button"
                  onClick={() => {
                    setPeriodMode("today");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Сегодня
                </button>
                <button
                  className={`btn ${periodMode === "all" ? "btn-primary" : ""}`}
                  type="button"
                  onClick={() => {
                    setPeriodMode("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Все
                </button>
              </div>
            </div>

            <div className="personnel-filters__field">
              <p className="label">Подразделение</p>
              <select
                className="select"
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value as UnitAssignmentFilter)}
              >
                <option value="all">Все подразделения</option>
                <option value="unset">Не указано</option>
                {UNIT_ASSIGNMENT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unitAssignmentLabel[unit]}
                  </option>
                ))}
              </select>
            </div>

            {unitFilter === "company_4" && (
              <>
                <div className="personnel-filters__field">
                  <p className="label">Взвод</p>
                  <select
                    className="select"
                    value={rotaPlatoon}
                    onChange={(e) => setRotaPlatoon(e.target.value as RotaPlatoonFilter)}
                  >
                    <option value="all">Все</option>
                    {ROTA_PLATOON_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {value} взвод
                      </option>
                    ))}
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Отделение</p>
                  <select
                    className="select"
                    value={rotaSection}
                    onChange={(e) => setRotaSection(e.target.value as RotaSectionFilter)}
                  >
                    <option value="all">Все</option>
                    {ROTA_SECTION_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="personnel-filters__row admin-results-filters__row--secondary">
            <div className="personnel-filters__field admin-results-filters__search">
              <p className="label">Поиск</p>
              <input
                className="input"
                type="text"
                placeholder="Имя или позывной"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="personnel-filters__field">
              <p className="label">Тест</p>
              <select
                className="select"
                value={typeFilter}
                onChange={(e) => {
                  const next = e.target.value as TestTypeFilter;
                  setTypeFilter(next);
                  if (next === "trial" && statusFilter === "not_started") {
                    setStatusFilter("all");
                  }
                }}
              >
                <option value="all">Все</option>
                <option value="trial">Пробный</option>
                <option value="final">Итоговый</option>
              </select>
            </div>

            <div className="personnel-filters__field">
              <p className="label">Результат</p>
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">Все</option>
                <option value="passed">Сдал</option>
                <option value="failed">Не сдал</option>
                {showNotStartedFilter && <option value="not_started">Не проходил итог</option>}
              </select>
            </div>
          </div>
        </div>
      </article>

      {!isLoading && !loadError && (
        <div className="admin-results-summary">
          <article className="admin-results-summary-card">
            <span className="admin-results-summary-card__icon home-icon-wrap is-green" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="home-icon-svg">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="admin-results-summary-card__body">
              <p className="label">Сдали итог</p>
              <p className="admin-results-summary-card__value">{bannerStats.passedCount}</p>
              <p className="admin-results-summary-card__sub">{formatLastPersonLine(bannerStats.lastPassed)}</p>
            </div>
          </article>
          <article className="admin-results-summary-card">
            <span className="admin-results-summary-card__icon home-icon-wrap is-red" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="home-icon-svg">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M15 9l-6 6M9 9l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <div className="admin-results-summary-card__body">
              <p className="label">Не сдали итог</p>
              <p className="admin-results-summary-card__value">{bannerStats.notPassedCount}</p>
              <p className="admin-results-summary-card__sub">{formatLastPersonLine(bannerStats.lastNotPassed)}</p>
            </div>
          </article>
          <article className="admin-results-summary-card">
            <span className="admin-results-summary-card__icon home-icon-wrap is-orange" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="home-icon-svg">
                <rect x="5" y="4" width="14" height="17" rx="2" />
                <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                <line x1="8" y1="11" x2="16" y2="11" />
                <line x1="8" y1="15" x2="13" y2="15" />
              </svg>
            </span>
            <div className="admin-results-summary-card__body">
              <p className="label">Пробных попыток</p>
              <p className="admin-results-summary-card__value">{bannerStats.trialAttemptsCount}</p>
              <p className="admin-results-summary-card__sub">{formatLastPersonLine(bannerStats.lastTrial)}</p>
            </div>
          </article>
          <article className="admin-results-summary-card">
            <span className="admin-results-summary-card__icon home-icon-wrap is-blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="home-icon-svg">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M8 9h8M8 13h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 3v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="admin-results-summary-card__body">
              <p className="label">Итоговых попыток</p>
              <p className="admin-results-summary-card__value">{bannerStats.finalAttemptsCount}</p>
              <p className="admin-results-summary-card__sub">{formatLastPersonLine(bannerStats.lastFinal)}</p>
            </div>
          </article>
        </div>
      )}

      <div className="admin-results-list">
        {visibleAttempts.map((row) => (
          <article
            className={`card admin-results-card admin-results-row admin-results-card--${row.status}`}
            key={row.id}
          >
            <div className="card-body admin-results-row__body">
              <div className="admin-results-row__main">
                <div className="admin-results-row__head">
                  <h3 className="admin-results-row__name">
                    <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                      {row.name}
                      {row.callsign ? ` (${row.callsign})` : ""}
                    </Link>
                  </h3>
                  <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                    {row.position || "—"}
                  </span>
                </div>
                <div className="admin-results-row__tags">
                  <span className={`pill ${row.type === "trial" ? "pill-orange" : "pill-blue"}`}>
                    {row.type === "trial" ? "Пробный" : "Итоговый"}
                  </span>
                  <span className={`pill ${row.status === "passed" ? "pill-green" : "pill-red"}`}>
                    {row.status === "passed" ? "Сдал" : "Не сдал"}
                  </span>
                  {row.type === "final" && row.finalAttemptIndex != null && row.finalAttemptIndex > 0 && (
                    <span className="admin-results-row__date">Попытка №{row.finalAttemptIndex}</span>
                  )}
                </div>
                {row.showResetAttempts && (
                  <div className="admin-results-row__actions">
                    <button
                      className="btn"
                      type="button"
                      disabled={resetBusyId === row.userId}
                      onClick={() => void onResetAttempts(row.userId)}
                    >
                      {resetBusyId === row.userId ? "Сброс…" : "Сбросить попытки итога"}
                    </button>
                  </div>
                )}
              </div>
              <div className="admin-results-row__meta">
                <span className="admin-results-row__score">{formatAttemptResult(row)}</span>
                <span className="admin-results-row__date">{row.createdAt ? formatDateTime(row.createdAt) : "—"}</span>
              </div>
            </div>
          </article>
        ))}

        {visibleNotStarted.map((row) => (
          <article className="card admin-results-card admin-results-row admin-results-card--not_started" key={`ns-${row.userId}`}>
            <div className="card-body admin-results-row__body">
              <div className="admin-results-row__main">
                <div className="admin-results-row__head">
                  <h3 className="admin-results-row__name">
                    <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                      {row.name}
                      {row.callsign ? ` (${row.callsign})` : ""}
                    </Link>
                  </h3>
                  <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                    {row.position || "—"}
                  </span>
                </div>
                <div className="admin-results-row__tags">
                  <span className="pill pill-blue">Итоговый</span>
                  <span className="pill pill-yellow">Не проходил</span>
                </div>
                <p className="admin-results-row__note">Итоговый тест ещё не сдавался в выбранном периоде.</p>
              </div>
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
