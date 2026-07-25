"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ResultsExportExcelButton, postResultsExportExcel } from "@/components/admin/ResultsExportExcelButton";
import { UnitFieldLabel } from "@/components/profile/UnitFieldLabel";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import type { UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { useClientSession } from "@/hooks/useClientSession";
import { canResetTestResults } from "@/lib/permissions";
import { getPositionBadgeClass, positionDisplayLabel } from "@/lib/position-ui";
import { formatDateTime } from "@/lib/format";
import { formatTestResultForType } from "@/lib/test-pass-rules";
import {
  UNIT_ASSIGNMENT_OPTIONS,
  unitAssignmentLabel,
  type RotaPlatoonFilter,
  type RotaSectionFilter,
  type UnitAssignmentFilter,
} from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import { ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS, rotaPlatoonLabel, rotaSectionLabel } from "@/lib/personnel-catalog";
import { FINAL_AUTO_RESET_DAY_UTC } from "@/lib/final-effective-counting";
import { appendResultsPeriodParams, buildResultsPeriodBody } from "@/lib/admin-results-query";
import { clearPagePrefetchCache, readPagePrefetchCache, writePagePrefetchCache } from "@/lib/page-prefetch-cache";

type PeriodMode = "all" | "today" | "custom";
type TestTypeFilter = "all" | "trial" | "final";
type StatusFilter = "all" | "passed" | "failed" | "not_started";

type ResultsFilters = {
  periodMode: PeriodMode;
  dateFrom: string;
  dateTo: string;
  typeFilter: TestTypeFilter;
  statusFilter: StatusFilter;
  unitFilter: UnitAssignmentFilter;
  rotaPlatoon: RotaPlatoonFilter;
  rotaSection: RotaSectionFilter;
  searchTerm: string;
};

type UserSummary = {
  userId: string;
  name: string;
  callsign: string;
  nameColor?: ProfileNameColorId | null;
  cosmetics?: UserIdentityCosmetics | null;
  position?: string;
};

type AttemptRow = {
  id: string;
  userId: string;
  name: string;
  callsign: string;
  nameColor?: ProfileNameColorId | null;
  cosmetics?: UserIdentityCosmetics | null;
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
  showResetAttempts: boolean;
  canDeleteAttempt: boolean;
};

type BootstrapPayload = {
  ok?: boolean;
  error?: string;
  attempts?: AttemptRow[];
  attemptsTotal?: number;
  notStartedUsers?: UserSummary[];
  notStartedTotal?: number;
  lastResetAudit?: {
    created_at: string;
    admin_name: string;
    target_name: string;
    target_callsign: string;
  } | null;
  nextAutoResetAt?: string;
};

type ResultsPagePayload = {
  attempts: AttemptRow[];
  attemptsTotal: number;
  notStartedUsers: UserSummary[];
  notStartedTotal: number;
  lastResetAudit: BootstrapPayload["lastResetAudit"];
  nextAutoResetAt: string | null;
  page: number;
};

const ATTEMPTS_PAGE_SIZE = 10;

const DEFAULT_FILTERS: ResultsFilters = {
  periodMode: "all",
  dateFrom: "",
  dateTo: "",
  typeFilter: "all",
  statusFilter: "all",
  unitFilter: "all",
  rotaPlatoon: "all",
  rotaSection: "all",
  searchTerm: "",
};

function filtersKey(filters: ResultsFilters) {
  return [
    filters.periodMode,
    filters.dateFrom,
    filters.dateTo,
    filters.typeFilter,
    filters.statusFilter,
    filters.searchTerm.trim(),
    filters.unitFilter,
    filters.rotaPlatoon,
    filters.rotaSection,
  ].join("|");
}

function buildBootstrapParams(filters: ResultsFilters, page: number) {
  const params = new URLSearchParams();
  appendResultsPeriodParams(params, {
    periodMode: filters.periodMode,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  params.set("page", String(page));
  params.set("pageSize", String(ATTEMPTS_PAGE_SIZE));
  params.set("attemptType", filters.typeFilter);
  params.set("attemptStatus", filters.statusFilter);
  if (filters.searchTerm.trim()) params.set("search", filters.searchTerm.trim());
  if (filters.unitFilter !== "all") params.set("unit", filters.unitFilter);
  if (filters.rotaPlatoon !== "all") params.set("rotaPlatoon", filters.rotaPlatoon);
  if (filters.rotaSection !== "all") params.set("rotaSection", filters.rotaSection);
  return params;
}

function ResultsUserName({
  name,
  callsign,
  nameColor,
  cosmetics,
}: {
  name: string;
  callsign: string;
  nameColor?: ProfileNameColorId | null;
  cosmetics?: UserIdentityCosmetics | null;
}) {
  return (
    <UserIdentityDisplay
      name={name}
      callsign={callsign ? `(${callsign})` : undefined}
      cosmetics={cosmetics ?? (nameColor ? { adminNameColor: nameColor } : null)}
      separator=" "
      emptyName="—"
    />
  );
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
  const { session, hydrated } = useClientSession();
  const viewerCanReset = hydrated && session ? canResetTestResults(session) : false;

  const [draftFilters, setDraftFilters] = useState<ResultsFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ResultsFilters>(DEFAULT_FILTERS);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [notStartedUsers, setNotStartedUsers] = useState<UserSummary[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [lastResetAudit, setLastResetAudit] = useState<BootstrapPayload["lastResetAudit"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState("");
  const [nextAutoResetAt, setNextAutoResetAt] = useState<string | null>(null);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [exportExcelMsg, setExportExcelMsg] = useState("");

  const appliedFilterKey = useMemo(() => filtersKey(appliedFilters), [appliedFilters]);
  const draftFilterKey = useMemo(() => filtersKey(draftFilters), [draftFilters]);
  const filtersDirty = draftFilterKey !== appliedFilterKey;
  const isNotStartedView =
    appliedFilters.statusFilter === "not_started" && appliedFilters.typeFilter !== "trial";

  const resultsCacheKey = useCallback(
    (page: number) => `admin-results:${appliedFilterKey}:p=${page}`,
    [appliedFilterKey],
  );

  const applyPayload = useCallback((payload: ResultsPagePayload, viewingNotStarted: boolean) => {
    setAttempts(payload.attempts);
    setNotStartedUsers(payload.notStartedUsers);
    setListTotal(viewingNotStarted ? payload.notStartedTotal : payload.attemptsTotal);
    setLastResetAudit(payload.lastResetAudit ?? null);
    setNextAutoResetAt(payload.nextAutoResetAt);
    setAttemptsPage(payload.page);
  }, []);

  const fetchResultsPage = useCallback(
    async (filters: ResultsFilters, targetPage: number, signal?: AbortSignal): Promise<ResultsPagePayload | null> => {
      try {
        const response = await fetch(`/api/admin/results/bootstrap?${buildBootstrapParams(filters, targetPage).toString()}`, {
          cache: "no-store",
          signal,
        });
        if (signal?.aborted) return null;
        const payload = (await response.json()) as BootstrapPayload;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "admin_results_bootstrap_failed");
        }
        const notStartedTotal = typeof payload.notStartedTotal === "number" ? payload.notStartedTotal : 0;
        const attemptsTotal = typeof payload.attemptsTotal === "number" ? payload.attemptsTotal : 0;
        return {
          attempts: Array.isArray(payload.attempts) ? payload.attempts : [],
          attemptsTotal,
          notStartedUsers: Array.isArray(payload.notStartedUsers) ? payload.notStartedUsers : [],
          notStartedTotal,
          lastResetAudit: payload.lastResetAudit ?? null,
          nextAutoResetAt: payload.nextAutoResetAt ?? null,
          page: targetPage,
        };
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return null;
        return null;
      }
    },
    [],
  );

  const prefetchResultsPage = useCallback(
    async (targetPage: number) => {
      const key = resultsCacheKey(targetPage);
      if (readPagePrefetchCache(key)) return;
      const data = await fetchResultsPage(appliedFilters, targetPage);
      if (data) writePagePrefetchCache(key, data);
    },
    [appliedFilters, fetchResultsPage, resultsCacheKey],
  );

  const loadResults = useCallback(
    async (targetPage = attemptsPage, signal?: AbortSignal) => {
      const viewingNotStarted =
        appliedFilters.statusFilter === "not_started" && appliedFilters.typeFilter !== "trial";
      const cacheKey = resultsCacheKey(targetPage);
      const cached = readPagePrefetchCache<ResultsPagePayload>(cacheKey);
      if (cached) {
        applyPayload(cached, viewingNotStarted);
        setLoadError("");
        setIsLoading(false);
        const total = viewingNotStarted ? cached.notStartedTotal : cached.attemptsTotal;
        if (targetPage * ATTEMPTS_PAGE_SIZE < total) void prefetchResultsPage(targetPage + 1);
        return;
      }

      setIsLoading(true);
      setLoadError("");
      const data = await fetchResultsPage(appliedFilters, targetPage, signal);
      if (signal?.aborted) return;
      if (!data) {
        setLoadError("Не удалось получить данные результатов. Попробуйте обновить страницу.");
        setAttempts([]);
        setNotStartedUsers([]);
        setListTotal(0);
        setIsLoading(false);
        return;
      }

      applyPayload(data, viewingNotStarted);
      writePagePrefetchCache(cacheKey, data);
      const total = viewingNotStarted ? data.notStartedTotal : data.attemptsTotal;
      if (targetPage * ATTEMPTS_PAGE_SIZE < total) void prefetchResultsPage(targetPage + 1);
      setIsLoading(false);
    },
    [attemptsPage, appliedFilters, applyPayload, fetchResultsPage, prefetchResultsPage, resultsCacheKey],
  );

  useEffect(() => {
    clearPagePrefetchCache("admin-results");
  }, [appliedFilterKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadResults(attemptsPage, controller.signal);
    return () => controller.abort();
  }, [appliedFilterKey, attemptsPage, loadResults]);

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setAttemptsPage(1);
  };

  const resetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setAttemptsPage(1);
  };

  const refreshResults = async () => {
    clearPagePrefetchCache("admin-results");
    await loadResults(attemptsPage);
  };

  const patchDraft = (patch: Partial<ResultsFilters>) => {
    setDraftFilters((current) => {
      const next = { ...current, ...patch };
      if (patch.unitFilter && patch.unitFilter !== "company_4") {
        next.rotaPlatoon = "all";
        next.rotaSection = "all";
      }
      if (patch.typeFilter === "trial" && next.statusFilter === "not_started") {
        next.statusFilter = "all";
      }
      return next;
    });
  };

  const attemptsPageCount = Math.max(1, Math.ceil(listTotal / ATTEMPTS_PAGE_SIZE));
  const showNotStartedFilter = draftFilters.typeFilter !== "trial";

  const onDeleteAttempt = async (row: AttemptRow) => {
    if (!viewerCanReset || !row.canDeleteAttempt) return;
    const typeLabel = row.type === "trial" ? "пробную" : "итоговую";
    const confirmed = window.confirm(`Удалить эту ${typeLabel} попытку из истории?`);
    if (!confirmed) return;
    setDeleteBusyId(row.id);
    setResetMessage("");
    try {
      const response = await fetch("/api/admin/results/delete-attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId: row.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "delete_failed");
      }
      setResetMessage("Попытка удалена.");
      await refreshResults();
    } catch {
      setResetMessage("Не удалось удалить попытку.");
    } finally {
      setDeleteBusyId(null);
    }
  };

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
      await refreshResults();
    } catch {
      setResetMessage("Не удалось сбросить попытки.");
    } finally {
      setResetBusyId(null);
    }
  };

  const autoResetText = nextAutoResetAt
    ? formatDateTime(nextAutoResetAt)
    : `${FINAL_AUTO_RESET_DAY_UTC}-го числа следующего месяца`;

  const onExportExcel = async () => {
    setExportExcelLoading(true);
    setExportExcelMsg("");
    try {
      await postResultsExportExcel({
        ...buildResultsPeriodBody({
          periodMode: appliedFilters.periodMode,
          dateFrom: appliedFilters.dateFrom,
          dateTo: appliedFilters.dateTo,
        }),
        attemptType: appliedFilters.typeFilter,
        attemptStatus: appliedFilters.statusFilter,
        search: appliedFilters.searchTerm.trim() || undefined,
        unit: appliedFilters.unitFilter,
        rotaPlatoon: appliedFilters.rotaPlatoon,
        rotaSection: appliedFilters.rotaSection,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "empty_export") {
        setExportExcelMsg("Нет записей для выгрузки по текущим фильтрам.");
        return;
      }
      if (error instanceof Error && error.message === "gateway_timeout") {
        setExportExcelMsg("Сервер долго формирует файл. Сузьте фильтр и попробуйте снова.");
        return;
      }
      setExportExcelMsg("Не удалось сформировать Excel.");
    } finally {
      setExportExcelLoading(false);
    }
  };

  const listEmpty = isNotStartedView ? notStartedUsers.length === 0 : attempts.length === 0;
  const listLabel = isNotStartedView ? "человек" : "попыток";

  return (
    <section className="admin-results-page">
      <div className="personnel-page__header">
        <div>
          <h1 className="page-title">Админ / Результаты тестов</h1>
        </div>
        <div className="personnel-page__header-actions">
          <ResultsExportExcelButton busy={exportExcelLoading} onClick={() => void onExportExcel()} />
        </div>
      </div>

      {viewerCanReset && lastResetAudit && (
        <p className="page-subtitle" style={{ marginBottom: 10, fontSize: 11 }}>
          Последний сброс попыток: {formatDateTime(lastResetAudit.created_at)} — {lastResetAudit.admin_name} →{" "}
          {lastResetAudit.target_name}
        </p>
      )}

      <p className="page-subtitle">
        Пробные и итоговые попытки. Выставьте фильтры и нажмите «Применить».
      </p>
      <div className="selfcheck-hint" style={{ marginBottom: 10 }}>
        Сброс попыток доступен вручную (администратором или пользователем с правом сброса) и автоматически{" "}
        {FINAL_AUTO_RESET_DAY_UTC}-го числа каждого месяца. Следующий автосброс: {autoResetText}.
      </div>
      {isLoading && <p className="page-subtitle">Загружаем результаты…</p>}
      {!isLoading && loadError && <p className="page-subtitle">{loadError}</p>}
      {!!resetMessage && <p className="page-subtitle">{resetMessage}</p>}
      {!!exportExcelMsg && <p className="page-subtitle">{exportExcelMsg}</p>}
      {!isLoading && !loadError && listTotal > 0 && (
        <p className="page-subtitle admin-results-export-meta">
          {isNotStartedView ? (
            <>Не проходили итог: {listTotal} чел.</>
          ) : (
            <>
              Всего {listTotal}{" "}
              {listTotal === 1 ? "попытка" : listTotal >= 2 && listTotal <= 4 ? "попытки" : "попыток"}
              {listTotal > ATTEMPTS_PAGE_SIZE && (
                <>
                  {" "}
                  · показано {(attemptsPage - 1) * ATTEMPTS_PAGE_SIZE + 1}–
                  {Math.min(attemptsPage * ATTEMPTS_PAGE_SIZE, listTotal)}
                </>
              )}
            </>
          )}
        </p>
      )}

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body personnel-filters admin-results-filters">
          <div
            className={`personnel-filters__row admin-results-filters__row--primary${draftFilters.unitFilter === "company_4" ? " has-rota" : ""}`}
          >
            <div className="personnel-filters__field admin-results-filters__period">
              <p className="label">Период</p>
              <div className="admin-results-period">
                <input
                  className="input admin-results-period__date"
                  type="date"
                  value={draftFilters.dateFrom}
                  onChange={(e) => {
                    const dateFrom = e.target.value;
                    patchDraft({
                      dateFrom,
                      periodMode: dateFrom || draftFilters.dateTo ? "custom" : "all",
                    });
                  }}
                />
                <span className="admin-results-period__sep">—</span>
                <input
                  className="input admin-results-period__date"
                  type="date"
                  value={draftFilters.dateTo}
                  onChange={(e) => {
                    const dateTo = e.target.value;
                    patchDraft({
                      dateTo,
                      periodMode: dateTo || draftFilters.dateFrom ? "custom" : "all",
                    });
                  }}
                />
                <button
                  className={`btn ${draftFilters.periodMode === "today" ? "btn-primary" : ""}`}
                  type="button"
                  onClick={() => patchDraft({ periodMode: "today", dateFrom: "", dateTo: "" })}
                >
                  Сегодня
                </button>
                <button
                  className={`btn ${draftFilters.periodMode === "all" ? "btn-primary" : ""}`}
                  type="button"
                  onClick={() => patchDraft({ periodMode: "all", dateFrom: "", dateTo: "" })}
                >
                  Все
                </button>
              </div>
            </div>

            <div className="personnel-filters__field personnel-filters__field--compact">
              <UnitFieldLabel kind="unit" />
              <select
                className="select"
                value={draftFilters.unitFilter}
                onChange={(e) => patchDraft({ unitFilter: e.target.value as UnitAssignmentFilter })}
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

            {draftFilters.unitFilter === "company_4" && (
              <>
                <div className="personnel-filters__field personnel-filters__field--compact">
                  <UnitFieldLabel kind="platoon" />
                  <select
                    className="select"
                    value={draftFilters.rotaPlatoon}
                    onChange={(e) => patchDraft({ rotaPlatoon: e.target.value as RotaPlatoonFilter })}
                  >
                    <option value="all">Все</option>
                    {ROTA_PLATOON_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {rotaPlatoonLabel(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="personnel-filters__field personnel-filters__field--compact">
                  <UnitFieldLabel kind="section" />
                  <select
                    className="select"
                    value={draftFilters.rotaSection}
                    onChange={(e) => patchDraft({ rotaSection: e.target.value as RotaSectionFilter })}
                  >
                    <option value="all">Все</option>
                    {ROTA_SECTION_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {rotaSectionLabel(value)}
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
                value={draftFilters.searchTerm}
                onChange={(e) => patchDraft({ searchTerm: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
            </div>

            <div className="personnel-filters__field">
              <p className="label">Тест</p>
              <select
                className="select"
                value={draftFilters.typeFilter}
                onChange={(e) => patchDraft({ typeFilter: e.target.value as TestTypeFilter })}
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
                value={draftFilters.statusFilter}
                onChange={(e) => patchDraft({ statusFilter: e.target.value as StatusFilter })}
              >
                <option value="all">Все</option>
                <option value="passed">Сдал</option>
                <option value="failed">Не сдал</option>
                {showNotStartedFilter && <option value="not_started">Не проходил итог</option>}
              </select>
            </div>

            <div className="personnel-filters__field admin-results-filters__actions">
              <p className="label">&nbsp;</p>
              <div className="admin-results-filters__buttons">
                <button className="btn btn-primary" type="button" onClick={applyFilters}>
                  Применить
                </button>
                {(filtersDirty || appliedFilterKey !== filtersKey(DEFAULT_FILTERS)) && (
                  <button className="btn" type="button" onClick={resetFilters}>
                    Сбросить
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {filtersDirty && !isLoading && (
        <p className="page-subtitle">Фильтры изменены — нажмите «Применить».</p>
      )}

      <div className="admin-results-list">
        {!isNotStartedView &&
          attempts.map((row) => (
            <article
              className={`card admin-results-card admin-results-row admin-results-card--${row.status}`}
              key={row.id}
            >
              <div className="card-body admin-results-row__body">
                <div className="admin-results-row__main">
                  <div className="admin-results-row__head">
                    <h3 className="admin-results-row__name">
                      <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                        <ResultsUserName
                          name={row.name}
                          callsign={row.callsign}
                          nameColor={row.nameColor}
                          cosmetics={row.cosmetics}
                        />
                      </Link>
                    </h3>
                    <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                      {positionDisplayLabel(row.position || "") || "—"}
                    </span>
                  </div>
                  <div className="admin-results-row__tags">
                    <span className={`pill ${row.type === "trial" ? "pill-orange" : "pill-blue"}`}>
                      {row.type === "trial" ? "Пробный" : "Итоговый"}
                    </span>
                    <span className={`pill ${row.status === "passed" ? "pill-green" : "pill-red"}`}>
                      {row.status === "passed" ? "Сдал" : "Не сдал"}
                    </span>
                  </div>
                  {(row.canDeleteAttempt || row.showResetAttempts) && (
                    <div className="admin-results-row__actions">
                      {row.canDeleteAttempt && (
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={deleteBusyId === row.id}
                          onClick={() => void onDeleteAttempt(row)}
                        >
                          {deleteBusyId === row.id ? "Удаление…" : "Удалить из истории"}
                        </button>
                      )}
                      {row.showResetAttempts && (
                        <button
                          className="btn"
                          type="button"
                          disabled={resetBusyId === row.userId}
                          onClick={() => void onResetAttempts(row.userId)}
                        >
                          {resetBusyId === row.userId ? "Сброс…" : "Сбросить попытки итога"}
                        </button>
                      )}
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

        {isNotStartedView &&
          notStartedUsers.map((row) => (
            <article
              className="card admin-results-card admin-results-row admin-results-card--not_started"
              key={`ns-${row.userId}`}
            >
              <div className="card-body admin-results-row__body">
                <div className="admin-results-row__main">
                  <div className="admin-results-row__head">
                    <h3 className="admin-results-row__name">
                      <Link href={`/profile/${row.userId}`} prefetch={false} className="admin-users-profile-link">
                        <ResultsUserName
                          name={row.name}
                          callsign={row.callsign}
                          nameColor={row.nameColor}
                          cosmetics={row.cosmetics}
                        />
                      </Link>
                    </h3>
                    <span className={`admin-users-position-badge ${getPositionBadgeClass(row.position || "")}`}>
                      {positionDisplayLabel(row.position || "") || "—"}
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

        {!isLoading && !loadError && listEmpty && (
          <p className="page-subtitle">Нет записей по выбранным фильтрам.</p>
        )}

        {!isLoading && !loadError && listTotal > 0 && (
          <div className="admin-results-footer">
            <span className="admin-results-footer__total">
              Всего {listLabel}: {listTotal}
            </span>
            <div className="admin-users-pagination">
              <button
                className="btn"
                type="button"
                disabled={attemptsPage <= 1}
                onClick={() => setAttemptsPage((page) => Math.max(1, page - 1))}
              >
                ‹
              </button>
              <span className="admin-users-page-indicator">
                {attemptsPage} / {attemptsPageCount}
              </span>
              <button
                className="btn"
                type="button"
                disabled={attemptsPage >= attemptsPageCount}
                onClick={() => setAttemptsPage((page) => Math.min(attemptsPageCount, page + 1))}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
