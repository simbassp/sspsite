"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { canResetTestResults } from "@/lib/permissions";
import { getPositionBadgeClass } from "@/lib/position-ui";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { formatDateTime } from "@/lib/format";

type DateRange = "all" | "today" | "7d" | "30d";
type StatusFilter = "all" | "passed" | "failed" | "not_started";

type UserSummary = {
  userId: string;
  name: string;
  callsign: string;
  position?: string;
  status: "passed" | "failed" | "not_started";
  scorePercent: number | null;
  questionsCorrect: number | null;
  questionsTotal: number | null;
  latestFinalAt: string | null;
  usedFinalAttempts: number;
  maxFinalAttempts: number;
  showResetAttempts: boolean;
};

type BootstrapPayload = {
  ok?: boolean;
  error?: string;
  viewerIsAdmin?: boolean;
  summaries?: UserSummary[];
  lastResetAudit?: {
    created_at: string;
    admin_name: string;
    target_name: string;
    target_callsign: string;
  } | null;
};

export default function AdminResultsPage() {
  const session = readClientSession();
  const viewerCanReset = session ? canResetTestResults(session) : false;

  const [range, setRange] = useState<DateRange>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [lastResetAudit, setLastResetAudit] = useState<BootstrapPayload["lastResetAudit"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState("");

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
      setLastResetAudit(payload.lastResetAudit ?? null);
    } catch {
      setLoadError("Не удалось получить данные результатов. Попробуйте обновить страницу.");
      setSummaries([]);
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return summaries.filter((s) => {
      const byStatus = statusFilter === "all" ? true : s.status === statusFilter;
      if (!byStatus) return false;
      if (!query) return true;
      return s.name.toLowerCase().includes(query) || s.callsign.toLowerCase().includes(query);
    });
  }, [summaries, statusFilter, searchTerm]);

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

  const fractionLabel = (s: UserSummary) => {
    const qt = s.questionsTotal;
    const qc = s.questionsCorrect;
    if (qt != null && qc != null && qt > 0) {
      return `${qc} / ${qt}`;
    }
    if (s.scorePercent != null) {
      return `${s.scorePercent}%`;
    }
    return "—";
  };

  return (
    <section>
      <h1 className="page-title">Админ / Результаты тестов</h1>

      {viewerCanReset && lastResetAudit && (
        <p className="page-subtitle" style={{ marginBottom: 10, fontSize: 11 }}>
          Последний сброс попыток: {formatDateTime(lastResetAudit.created_at)} — {lastResetAudit.admin_name} →{" "}
          {lastResetAudit.target_name}
        </p>
      )}

      <p className="page-subtitle">Фильтр по дате последней попытки и статусу итогового теста.</p>
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

      <div className="chips">
        <span className="label" style={{ width: "100%", marginBottom: 4 }}>
          Статус
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
        <button
          className={`chip ${statusFilter === "not_started" ? "active" : ""}`}
          type="button"
          onClick={() => setStatusFilter("not_started")}
        >
          Не проходил
        </button>
      </div>

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
        {visible.map((row) => (
          <article
            className={`card admin-results-card admin-results-card--${row.status}`}
            key={row.userId}
          >
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>
                  {row.name} ({row.callsign})
                </h3>
                <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                  {row.position || "—"}
                </span>
              </div>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Статус:{" "}
                <span
                  className={`pill ${row.status === "passed" ? "pill-green" : row.status === "failed" ? "pill-red" : "pill-yellow"}`}
                >
                  {row.status === "passed" ? "Сдал" : row.status === "failed" ? "Не сдал" : "Не проходил"}
                </span>
              </p>
              {row.status !== "not_started" && (
                <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                  Результат:{" "}
                  {row.scorePercent != null ? `${row.scorePercent}% (${fractionLabel(row)})` : fractionLabel(row)}
                </p>
              )}
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                Попытки: {row.usedFinalAttempts} / {row.maxFinalAttempts ?? FINAL_TEST_MAX_ATTEMPTS}
              </p>
              <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                Последняя попытка: {row.latestFinalAt ? formatDateTime(row.latestFinalAt) : "—"}
              </p>
              {row.showResetAttempts && (
                <button
                  className="btn"
                  type="button"
                  style={{ marginTop: 10 }}
                  disabled={resetBusyId === row.userId}
                  onClick={() => void onResetAttempts(row.userId)}
                >
                  {resetBusyId === row.userId ? "Сброс…" : "Сбросить попытки"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
