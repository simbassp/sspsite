"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import { UserAvatar } from "@/components/profile/UserAvatar";
import type { UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { withTimeout } from "@/lib/async-utils";
import { clearPagePrefetchCache, readPagePrefetchCache, writePagePrefetchCache } from "@/lib/page-prefetch-cache";
import { PersonnelPreviewBanner } from "@/components/personnel/PersonnelPreviewBanner";
import { PersonnelTableDualScroll } from "@/components/personnel/PersonnelTableDualScroll";
import {
  postResetPersonnelExams,
  ResetPersonnelExamsButton,
  ResetPersonnelExamsModal,
  useResetPersonnelExamsModal,
} from "@/components/personnel/ResetPersonnelExamsModal";
import {
  PersonnelExportExcelButton,
  PersonnelExportExcelModal,
  postPersonnelExportExcel,
  usePersonnelExportExcelModal,
} from "@/components/personnel/PersonnelExportExcelModal";
import {
  PersonnelExamRosterIcon,
  PersonnelRosterLicenseCell,
  PersonnelRosterTestCell,
  type PersonnelTestRosterStats,
} from "@/components/personnel/PersonnelIcons";
import { readClientSession } from "@/lib/client-auth";
import { canManageUsers, canResetTestResults } from "@/lib/permissions";
import { dutyLocationLabel } from "@/lib/duty-location";
import { resolvePersonnelProfilePath } from "@/lib/personnel-profile-path";
import { PERSONNEL_EXAM_TYPES, PERSONNEL_LICENSE_CATEGORIES, ROTA_MODULE_OPTIONS, personnelExamLabel, rotaUnitLabel, rotaUnitLabelCompact } from "@/lib/personnel-catalog";
import type { PersonnelExamType, PersonnelLicenseCategory, PersonnelRosterTops } from "@/lib/personnel-catalog";
import { PersonnelTopGrid } from "@/components/personnel/PersonnelTopGrid";
import type { Position } from "@/lib/types";

import {
  EMPTY_ROSTER_FILTER_PARAMS,
  hasActiveRosterFilters,
  type ExamFilterStatus,
  type RosterFilterParams,
  type TestFilter,
  type TriState,
} from "@/lib/personnel-roster-filters";

const EMPTY_TEST_STATS: PersonnelTestRosterStats = {
  trialPassed: 0,
  trialFailed: 0,
  finalPassed: 0,
  finalFailed: 0,
};

function resolveUserTestStats(user: UserRow, testDate: string) {
  if (testDate) return user.testStatsOnDate ?? EMPTY_TEST_STATS;
  return user.testStats ?? EMPTY_TEST_STATS;
}

type RosterFilters = RosterFilterParams;
const EMPTY_ROSTER_FILTERS = EMPTY_ROSTER_FILTER_PARAMS;

type RosterQuery = {
  platoon: "all" | "1" | "2";
  section: "all" | "1" | "2" | "3" | "4";
  module: string;
  search: string;
  testDate: string;
  filters: RosterFilters;
};

const DEFAULT_ROSTER_QUERY: RosterQuery = {
  platoon: "all",
  section: "all",
  module: "all",
  search: "",
  testDate: "",
  filters: EMPTY_ROSTER_FILTERS,
};

function buildRosterFilterKey(query: RosterQuery) {
  const q = new URLSearchParams();
  if (query.platoon !== "all") q.set("platoon", query.platoon);
  if (query.section !== "all") q.set("section", query.section);
  if (query.module !== "all") q.set("module", query.module);
  if (query.search.trim()) q.set("search", query.search.trim());
  if (query.testDate) q.set("testDate", query.testDate);
  q.set("examType", query.filters.examType);
  q.set("examStatus", query.filters.examStatus);
  q.set("license", query.filters.license);
  q.set("trialTest", query.filters.trialTest);
  q.set("finalTest", query.filters.finalTest);
  q.set("hits", query.filters.hits);
  q.set("premiums", query.filters.premiums);
  q.set("dutyStatus", query.filters.dutyStatus);
  return q.toString();
}

function hasActiveRosterQuery(query: RosterQuery) {
  return (
    query.platoon !== "all" ||
    query.section !== "all" ||
    query.module !== "all" ||
    !!query.search.trim() ||
    hasActiveRosterFilters(query.filters, query.testDate)
  );
}

function formatFilterDateLabel(iso: string) {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

function buildExportFilterLines(input: {
  platoon: "all" | "1" | "2";
  section: "all" | "1" | "2" | "3" | "4";
  module: string;
  search: string;
  testDate: string;
  filters: RosterFilters;
}) {
  const lines: string[] = [];
  if (input.platoon !== "all") lines.push(`Взвод: ${input.platoon}`);
  if (input.section !== "all") lines.push(`Отделение: ${input.section}`);
  if (input.module !== "all") lines.push(`Модуль: ${input.module}`);
  if (input.search) lines.push(`Поиск: ${input.search}`);
  if (input.testDate) lines.push(`Дата тестов: ${formatFilterDateLabel(input.testDate)}`);
  if (input.filters.examType !== "all") {
    lines.push(`Зачёт: ${personnelExamLabel[input.filters.examType]}`);
  }
  if (input.filters.examStatus !== "all") {
    lines.push(`Результат зачёта: ${input.filters.examStatus === "passed" ? "Сдан" : "Не сдан"}`);
  }
  if (input.filters.license !== "all") lines.push(`Права: категория ${input.filters.license}`);
  if (input.filters.trialTest !== "all") {
    lines.push(`Пробный тест: ${input.filters.trialTest === "passed" ? "Сдал" : "Не сдал"}`);
  }
  if (input.filters.finalTest !== "all") {
    lines.push(`Итоговый тест: ${input.filters.finalTest === "passed" ? "Сдал" : "Не сдал"}`);
  }
  if (input.filters.hits !== "all") lines.push(`Сбития: ${input.filters.hits === "yes" ? "Есть" : "Нет"}`);
  if (input.filters.premiums !== "all") lines.push(`Премии: ${input.filters.premiums === "yes" ? "Есть" : "Нет"}`);
  if (input.filters.dutyStatus !== "all") {
    lines.push(`Статус: ${dutyLocationLabel[input.filters.dutyStatus]}`);
  }
  return lines;
}

type UserRow = {
  id: string;
  name: string;
  callsign: string;
  avatarUrl?: string | null;
  nameColor?: ProfileNameColorId | null;
  cosmetics?: UserIdentityCosmetics | null;
  position: Position;
  dutyLocation: "base" | "deployment";
  rotaPlatoon: number | null;
  rotaSection: number | null;
  rotaModule: number | null;
  exams: Array<{ examType: string; status: string }>;
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  medalsCount: number;
  licenseCategories: string[];
  testStats: PersonnelTestRosterStats;
  testStatsOnDate?: PersonnelTestRosterStats | null;
};

type Tab = "all" | "top";

const ROSTER_FETCH_TIMEOUT_MS = 45000;
const ROSTER_PAGE_SIZE = 10;

export default function PersonnelListPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const session = useMemo(() => (isHydrated ? readClientSession() : null), [isHydrated]);
  const [tab, setTab] = useState<Tab>("all");
  const [draftQuery, setDraftQuery] = useState<RosterQuery>(DEFAULT_ROSTER_QUERY);
  const [appliedQuery, setAppliedQuery] = useState<RosterQuery>(DEFAULT_ROSTER_QUERY);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [stats, setStats] = useState({ totalEmployees: 0, deployedNow: 0, avgDays: 0, totalDays: 0, totalHits: 0, totalPremiums: 0 });
  const [tops, setTops] = useState<PersonnelRosterTops<UserRow>>({
    hits: [],
    trialTests: [],
    finalTests: [],
    deployments: [],
    activity: [],
  });
  const [isPreview, setIsPreview] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const canResetExams = useMemo(() => (session ? canResetTestResults(session) : false), [session]);
  const canExportExcel = useMemo(() => (session ? canManageUsers(session) : false), [session]);
  const resetExamsModal = useResetPersonnelExamsModal("filter");
  const exportExcelModal = usePersonnelExportExcelModal("filter");
  const [resetExamsSaving, setResetExamsSaving] = useState(false);
  const [resetExamsMsg, setResetExamsMsg] = useState("");
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [exportExcelMsg, setExportExcelMsg] = useState("");
  const [rosterPage, setRosterPage] = useState(1);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  type RosterPagePayload = {
    users: UserRow[];
    total: number;
    stats?: typeof stats;
    tops?: typeof tops;
    isPreview?: boolean;
  };

  const appliedFilterKey = useMemo(() => buildRosterFilterKey(appliedQuery), [appliedQuery]);
  const draftFilterKey = useMemo(() => buildRosterFilterKey(draftQuery), [draftQuery]);
  const filtersDirty = draftFilterKey !== appliedFilterKey;

  const rosterCacheKey = useCallback((page: number) => `personnel:${appliedFilterKey}:p=${page}`, [appliedFilterKey]);

  const applyRosterPayload = useCallback((payload: RosterPagePayload) => {
    setUsers(payload.users);
    setUsersTotal(payload.total);
    if (payload.stats) setStats(payload.stats);
    if (payload.tops) setTops(payload.tops);
    setIsPreview(payload.isPreview === true);
  }, []);

  const fetchRosterPage = useCallback(
    async (page: number, signal?: AbortSignal): Promise<RosterPagePayload | null> => {
      const q = new URLSearchParams(appliedFilterKey);
      q.set("page", String(page));
      q.set("pageSize", String(ROSTER_PAGE_SIZE));
      const res = await withTimeout(
        fetch(`/api/personnel/roster?${q.toString()}`, { cache: "no-store", signal }),
        ROSTER_FETCH_TIMEOUT_MS,
        "roster_timeout",
      );
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        users?: UserRow[];
        total?: number;
        stats?: typeof stats;
        tops?: typeof tops;
        isPreview?: boolean;
      };
      if (!res.ok || !payload.ok) return null;
      return {
        users: payload.users ?? [],
        total: typeof payload.total === "number" ? payload.total : (payload.users?.length ?? 0),
        stats: payload.stats,
        tops: payload.tops,
        isPreview: payload.isPreview,
      };
    },
    [appliedFilterKey],
  );

  const prefetchRosterPage = useCallback(
    async (page: number) => {
      const key = rosterCacheKey(page);
      if (readPagePrefetchCache(key)) return;
      try {
        const data = await fetchRosterPage(page);
        if (data) writePagePrefetchCache(key, data);
      } catch {
        // фоновая подгрузка — ошибки не показываем
      }
    },
    [fetchRosterPage, rosterCacheKey],
  );

  const load = useCallback(async () => {
    const cacheKey = rosterCacheKey(rosterPage);
    const cached = readPagePrefetchCache<RosterPagePayload>(cacheKey);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++loadSeqRef.current;

    if (cached) {
      applyRosterPayload(cached);
      setLoadError("");
      setIsLoading(false);
      const pageCount = Math.max(1, Math.ceil(cached.total / ROSTER_PAGE_SIZE));
      if (rosterPage < pageCount) void prefetchRosterPage(rosterPage + 1);
      return;
    }

    setIsLoading(true);
    setLoadError("");
    try {
      const data = await fetchRosterPage(rosterPage, controller.signal);
      if (seq !== loadSeqRef.current) return;
      if (!data) {
        setLoadError("Не удалось загрузить список.");
        return;
      }
      applyRosterPayload(data);
      writePagePrefetchCache(cacheKey, data);
      const pageCount = Math.max(1, Math.ceil(data.total / ROSTER_PAGE_SIZE));
      if (rosterPage < pageCount) void prefetchRosterPage(rosterPage + 1);
    } catch (error) {
      if (controller.signal.aborted || seq !== loadSeqRef.current) return;
      if (error instanceof Error && error.message === "roster_timeout") {
        setLoadError("Сервер долго отвечает. Сузьте фильтр или обновите страницу.");
        return;
      }
      setLoadError("Ошибка сети.");
    } finally {
      if (seq === loadSeqRef.current) setIsLoading(false);
    }
  }, [applyRosterPayload, fetchRosterPage, prefetchRosterPage, rosterCacheKey, rosterPage]);

  const examMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const u of users) {
      const inner = new Map<string, string>();
      for (const e of u.exams) inner.set(e.examType, e.status);
      m.set(u.id, inner);
    }
    return m;
  }, [users]);

  const rosterPageCount = Math.max(1, Math.ceil(usersTotal / ROSTER_PAGE_SIZE));
  const displayStats = stats;
  const rosterFiltersActive = hasActiveRosterQuery(appliedQuery);
  const displayTestStats = (user: UserRow) => resolveUserTestStats(user, appliedQuery.testDate);

  const patchDraft = (patch: Partial<RosterQuery>) => {
    setDraftQuery((current) => ({ ...current, ...patch }));
  };

  const patchDraftFilters = (patch: Partial<RosterFilters>) => {
    setDraftQuery((current) => ({ ...current, filters: { ...current.filters, ...patch } }));
  };

  const applyFilters = () => {
    setAppliedQuery(draftQuery);
    setRosterPage(1);
  };

  const resetFilters = () => {
    setDraftQuery(DEFAULT_ROSTER_QUERY);
    setAppliedQuery(DEFAULT_ROSTER_QUERY);
    setRosterPage(1);
  };

  useEffect(() => {
    clearPagePrefetchCache("personnel");
  }, [appliedFilterKey]);

  useEffect(() => {
    setRosterPage((page) => Math.min(page, rosterPageCount));
  }, [rosterPageCount]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [isHydrated, load, appliedFilterKey, rosterPage]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const profilePath = (id: string) => resolvePersonnelProfilePath(session, id);

  const onExportExcel = async () => {
    if (exportExcelLoading) return;
    setExportExcelLoading(true);
    setExportExcelMsg("");
    try {
      if (exportExcelModal.bulkScope === "all") {
        await postPersonnelExportExcel({ scope: "all" });
      } else {
        await postPersonnelExportExcel({
          scope: "filter",
          platoon: appliedQuery.platoon,
          section: appliedQuery.section,
          module: appliedQuery.module,
          search: appliedQuery.search.trim(),
          testDate: appliedQuery.testDate || undefined,
          examType: appliedQuery.filters.examType,
          examStatus: appliedQuery.filters.examStatus,
          license: appliedQuery.filters.license,
          trialTest: appliedQuery.filters.trialTest,
          finalTest: appliedQuery.filters.finalTest,
          hits: appliedQuery.filters.hits,
          premiums: appliedQuery.filters.premiums,
          dutyStatus: appliedQuery.filters.dutyStatus,
          filterLines: buildExportFilterLines({
            platoon: appliedQuery.platoon,
            section: appliedQuery.section,
            module: appliedQuery.module,
            search: appliedQuery.search.trim(),
            testDate: appliedQuery.testDate,
            filters: appliedQuery.filters,
          }),
        });
      }
      exportExcelModal.setOpen(false);
      setExportExcelMsg("Excel-файл сформирован и скачан.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "export_failed";
      setExportExcelMsg(
        message === "no_users"
          ? "Нет сотрудников для выгрузки."
          : message === "gateway_timeout"
            ? "Сервер не успел сформировать файл. Попробуйте сузить фильтр или повторите позже."
          : message === "export_failed"
            ? "Не удалось сформировать Excel."
            : `Не удалось сформировать Excel: ${message}`,
      );
    } finally {
      setExportExcelLoading(false);
    }
  };

  const onResetExamsBulk = async () => {
    if (resetExamsSaving) return;
    setResetExamsSaving(true);
    setResetExamsMsg("");
    try {
      const affected =
        resetExamsModal.bulkScope === "all"
          ? await postResetPersonnelExams({ scope: "all" })
          : await postResetPersonnelExams({
              scope: "filter",
              platoon: appliedQuery.platoon,
              section: appliedQuery.section,
              search: appliedQuery.search.trim(),
            });
      resetExamsModal.setOpen(false);
      setResetExamsMsg(
        affected > 0 ? `Зачёты сброшены для ${affected} сотрудник${affected === 1 ? "а" : "ов"}.` : "Записей зачётов не было.",
      );
      await load();
    } catch {
      setResetExamsMsg("Не удалось сбросить зачёты.");
    } finally {
      setResetExamsSaving(false);
    }
  };

  return (
    <section className="screen personnel-page">
      <div className="personnel-page__header">
        <div>
          <h1 className="page-title">Сотрудники</h1>
          <p className="page-subtitle">4 рота — личное дело и статистика</p>
        </div>
        <div className="personnel-page__header-actions">
          {canExportExcel && tab === "all" && (
            <PersonnelExportExcelButton
              busy={exportExcelLoading}
              onClick={() => {
                setExportExcelMsg("");
                exportExcelModal.setOpen(true);
              }}
            />
          )}
          {canResetExams && tab === "all" && (
            <ResetPersonnelExamsButton
              busy={resetExamsSaving}
              onClick={() => {
                setResetExamsMsg("");
                resetExamsModal.setOpen(true);
              }}
            />
          )}
          <Link href="/profile" className="btn btn-primary personnel-header-btn">
            Мой профиль
          </Link>
        </div>
      </div>

      {resetExamsMsg && <p className="page-subtitle">{resetExamsMsg}</p>}
      {exportExcelMsg && <p className="page-subtitle">{exportExcelMsg}</p>}

      {isPreview && <PersonnelPreviewBanner />}

      <div className="personnel-tabs">
        <button type="button" className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}>
          Все сотрудники
        </button>
        <button type="button" className={tab === "top" ? "is-active" : ""} onClick={() => setTab("top")}>
          Топ сотрудников
        </button>
      </div>

      {tab === "all" && (
        <>
          <article className="card">
            <div className="card-body personnel-filters">
              <div className="personnel-filters__row personnel-filters__row--primary">
                <div className="personnel-filters__field">
                  <p className="label">Взвод</p>
                  <select
                    className="select"
                    value={draftQuery.platoon}
                    onChange={(e) => patchDraft({ platoon: e.target.value as RosterQuery["platoon"] })}
                  >
                    <option value="all">Все</option>
                    <option value="1">1 взвод</option>
                    <option value="2">2 взвод</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Отделение</p>
                  <select
                    className="select"
                    value={draftQuery.section}
                    onChange={(e) => patchDraft({ section: e.target.value as RosterQuery["section"] })}
                  >
                    <option value="all">Все</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Модуль</p>
                  <select className="select" value={draftQuery.module} onChange={(e) => patchDraft({ module: e.target.value })}>
                    <option value="all">Все</option>
                    {ROTA_MODULE_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="personnel-filters__search-date">
                  <div className="personnel-filters__field personnel-filters__field--grow">
                    <p className="label">Поиск</p>
                    <input
                      className="input"
                      placeholder="Имя или позывной"
                      value={draftQuery.search}
                      onChange={(e) => patchDraft({ search: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFilters();
                      }}
                    />
                  </div>
                  <div className="personnel-filters__field personnel-filters__field--date">
                    <p className="label">Дата тестов</p>
                    <input
                      className="input"
                      type="date"
                      value={draftQuery.testDate}
                      onChange={(e) => patchDraft({ testDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="personnel-filters__row personnel-filters__row--secondary">
                <div className="personnel-filters__field">
                  <p className="label">Зачёт</p>
                  <select
                    className="select"
                    value={draftQuery.filters.examType}
                    onChange={(e) => {
                      const nextType = e.target.value as RosterFilters["examType"];
                      patchDraftFilters({
                        examType: nextType,
                        examStatus: nextType === "all" ? "all" : draftQuery.filters.examStatus,
                      });
                    }}
                  >
                    <option value="all">Все</option>
                    {PERSONNEL_EXAM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {personnelExamLabel[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Результат зачёта</p>
                  <select
                    className="select"
                    value={draftQuery.filters.examStatus}
                    onChange={(e) => patchDraftFilters({ examStatus: e.target.value as ExamFilterStatus })}
                    disabled={draftQuery.filters.examType === "all"}
                  >
                    <option value="all">Все</option>
                    <option value="passed">Сдан</option>
                    <option value="failed">Не сдан</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Права</p>
                  <select
                    className="select"
                    value={draftQuery.filters.license}
                    onChange={(e) => patchDraftFilters({ license: e.target.value as RosterFilters["license"] })}
                  >
                    <option value="all">Все</option>
                    {PERSONNEL_LICENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        Категория {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Сбития</p>
                  <select
                    className="select"
                    value={draftQuery.filters.hits}
                    onChange={(e) => patchDraftFilters({ hits: e.target.value as TriState })}
                  >
                    <option value="all">Все</option>
                    <option value="yes">Есть</option>
                    <option value="no">Нет</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Премии</p>
                  <select
                    className="select"
                    value={draftQuery.filters.premiums}
                    onChange={(e) => patchDraftFilters({ premiums: e.target.value as TriState })}
                  >
                    <option value="all">Все</option>
                    <option value="yes">Есть</option>
                    <option value="no">Нет</option>
                  </select>
                </div>
              </div>

              <div className="personnel-filters__row personnel-filters__row--tests">
                <div className="personnel-filters__field">
                  <p className="label">Пробный тест</p>
                  <select
                    className="select"
                    value={draftQuery.filters.trialTest}
                    onChange={(e) => patchDraftFilters({ trialTest: e.target.value as TestFilter })}
                  >
                    <option value="all">Все</option>
                    <option value="passed">Сдал</option>
                    <option value="failed">Не сдал</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Итоговый тест</p>
                  <select
                    className="select"
                    value={draftQuery.filters.finalTest}
                    onChange={(e) => patchDraftFilters({ finalTest: e.target.value as TestFilter })}
                  >
                    <option value="all">Все</option>
                    <option value="passed">Сдал</option>
                    <option value="failed">Не сдал</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Статус</p>
                  <select
                    className="select"
                    value={draftQuery.filters.dutyStatus}
                    onChange={(e) => patchDraftFilters({ dutyStatus: e.target.value as RosterFilters["dutyStatus"] })}
                  >
                    <option value="all">Все</option>
                    <option value="base">На базе</option>
                    <option value="deployment">В командировке</option>
                  </select>
                </div>
                <div className="personnel-filters__field personnel-filters__actions">
                  <p className="label">&nbsp;</p>
                  <div className="personnel-filters__buttons">
                    <button className="btn btn-primary" type="button" onClick={applyFilters}>
                      Применить
                    </button>
                    {(filtersDirty || rosterFiltersActive) && (
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

          <div className="personnel-stat-grid">
            <div className="personnel-stat-card">
              <p className="label">Всего</p>
              <strong>{displayStats.totalEmployees}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">В командировке</p>
              <strong>{displayStats.deployedNow}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Ср. дней</p>
              <strong>{displayStats.avgDays}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Сбитий</p>
              <strong>{displayStats.totalHits}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Премии</p>
              <strong>{displayStats.totalPremiums.toLocaleString("ru-RU")} ₽</strong>
            </div>
          </div>

          {rosterFiltersActive && !isLoading && (
            <p className="page-subtitle personnel-table-filter-meta">
              Найдено {usersTotal}
              {" · "}
              <button type="button" className="personnel-table-filter-reset" onClick={resetFilters}>
                Сбросить фильтры
              </button>
            </p>
          )}

          {!isLoading && usersTotal > 0 && (
            <p className="page-subtitle personnel-table-filter-meta">
              Показано {(rosterPage - 1) * ROSTER_PAGE_SIZE + 1}–
              {Math.min(rosterPage * ROSTER_PAGE_SIZE, usersTotal)} из {usersTotal}
            </p>
          )}

          {loadError && <p style={{ color: "var(--bad)" }}>{loadError}</p>}
          {isLoading && <p className="page-subtitle">Загрузка…</p>}

          <article className="card personnel-roster-card">
            <div className="card-body personnel-table-wrap">
              <p className="personnel-table-scroll-hint">Прокрутите таблицу вбок, чтобы увидеть все колонки</p>
              <PersonnelTableDualScroll>
              <table className="personnel-table">
                <thead>
                  <tr>
                    <th className="personnel-table__sticky">Имя</th>
                    <th className="personnel-table__compact" title="Взвод / отделение / модуль">
                      Взвод/Отдел/Мод
                    </th>
                    <th className="personnel-table__compact">Зачёты</th>
                    <th className="personnel-table__compact" title="Пробные и итоговые: сданы / не сданы">
                      Тесты
                    </th>
                    <th className="personnel-table__compact" title="Командировки">
                      Команд.
                    </th>
                    <th className="personnel-table__compact">Сбития</th>
                    <th className="personnel-table__compact">Премии</th>
                    <th className="personnel-table__compact">Статус</th>
                    <th className="personnel-table__compact" title="Категории прав">
                      Права
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="personnel-table__sticky">
                        <Link href={profilePath(u.id)} className="personnel-roster-person">
                          <UserAvatar
                            name={u.name}
                            callsign={u.callsign}
                            avatarUrl={u.avatarUrl ?? null}
                            size={34}
                            className="personnel-roster-person__avatar"
                            avatarFrame={u.cosmetics?.avatarFrame ?? null}
                            bankOverlay={u.cosmetics?.bankOverlay ?? null}
                            topRankBadge={u.cosmetics?.topRankBadge ?? null}
                          />
                          <UserIdentityDisplay
                            as="div"
                            className="personnel-roster-person__identity"
                            name={u.name}
                            callsign={u.callsign}
                            cosmetics={
                              u.cosmetics ??
                              (u.nameColor ? { adminNameColor: u.nameColor } : null)
                            }
                            nameClassName="personnel-roster-person__name"
                            callsignClassName="personnel-roster-person__callsign"
                            separator=""
                          />
                        </Link>
                      </td>
                      <td
                        className="personnel-table__compact"
                        title={
                          u.rotaPlatoon || u.rotaSection || u.rotaModule
                            ? rotaUnitLabel(u.rotaPlatoon, u.rotaSection, u.rotaModule)
                            : undefined
                        }
                      >
                        {rotaUnitLabelCompact(u.rotaPlatoon, u.rotaSection, u.rotaModule)}
                      </td>
                      <td className="personnel-table__compact">
                        <div className="personnel-roster-exams">
                          {PERSONNEL_EXAM_TYPES.map((t) => {
                            const st = examMap.get(u.id)?.get(t);
                            return (
                              <PersonnelExamRosterIcon key={t} type={t} passed={st === "passed"} />
                            );
                          })}
                        </div>
                      </td>
                      <td className="personnel-table__compact">
                        <PersonnelRosterTestCell stats={displayTestStats(u)} />
                      </td>
                      <td className="personnel-table__compact">
                        {u.deploymentsCount} ({u.deploymentDays} дн.)
                      </td>
                      <td className="personnel-table__compact">{u.uavHitsTotal}</td>
                      <td className="personnel-table__compact">{u.premiumsTotal.toLocaleString("ru-RU")} ₽</td>
                      <td className="personnel-table__compact">
                        <span className={`pill ${u.dutyLocation === "base" ? "pill-green" : "pill-red"}`}>
                          {dutyLocationLabel[u.dutyLocation]}
                        </span>
                      </td>
                      <td className="personnel-table__compact">
                        <PersonnelRosterLicenseCell categories={u.licenseCategories} />
                      </td>
                    </tr>
                  ))}
                  {isLoading && users.length === 0 && (
                    <tr>
                      <td colSpan={9} className="personnel-table__empty">
                        Загрузка…
                      </td>
                    </tr>
                  )}
                  {!isLoading && usersTotal === 0 && (
                    <tr>
                      <td colSpan={9} className="personnel-table__empty">
                        {users.length === 0 ? "Сотрудники не найдены" : "Нет сотрудников по выбранным фильтрам"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </PersonnelTableDualScroll>
            </div>
            <div className="card-body personnel-mobile-cards">
              {isLoading && users.length === 0 && <p className="personnel-mobile-empty">Загрузка…</p>}
              {!isLoading && usersTotal === 0 && (
                <p className="personnel-mobile-empty">
                  {users.length === 0 ? "Сотрудники не найдены" : "Нет сотрудников по выбранным фильтрам"}
                </p>
              )}
              {users.map((u) => (
                <article key={u.id} className="personnel-mobile-card">
                  <div className="personnel-mobile-card__head">
                    <div className="personnel-mobile-card__person">
                      <Link href={profilePath(u.id)} className="personnel-mobile-card__avatar-link">
                        <UserAvatar
                          name={u.name}
                          callsign={u.callsign}
                          avatarUrl={u.avatarUrl ?? null}
                          size={40}
                          avatarFrame={u.cosmetics?.avatarFrame ?? null}
                          bankOverlay={u.cosmetics?.bankOverlay ?? null}
                          topRankBadge={u.cosmetics?.topRankBadge ?? null}
                        />
                      </Link>
                      <div>
                        <Link href={profilePath(u.id)} className="personnel-mobile-card__name">
                          <UserIdentityDisplay
                            name={u.name}
                            cosmetics={
                              u.cosmetics ??
                              (u.nameColor ? { adminNameColor: u.nameColor } : null)
                            }
                            nameClassName="personnel-mobile-card__name-text"
                          />
                        </Link>
                        {u.callsign ? (
                          <p className="personnel-mobile-card__callsign">
                            <UserIdentityDisplay
                              callsign={u.callsign}
                              cosmetics={
                                u.cosmetics ??
                                (u.nameColor ? { adminNameColor: u.nameColor } : null)
                              }
                            />
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className={`pill ${u.dutyLocation === "base" ? "pill-green" : "pill-red"}`}>
                      {dutyLocationLabel[u.dutyLocation]}
                    </span>
                  </div>
                  <div className="personnel-mobile-card__meta">
                    <span>{rotaUnitLabelCompact(u.rotaPlatoon, u.rotaSection, u.rotaModule)}</span>
                    <PersonnelRosterLicenseCell categories={u.licenseCategories} />
                  </div>
                  <div className="personnel-mobile-card__exams">
                    {PERSONNEL_EXAM_TYPES.map((t) => {
                      const st = examMap.get(u.id)?.get(t);
                      return <PersonnelExamRosterIcon key={t} type={t} passed={st === "passed"} />;
                    })}
                  </div>
                  <div className="personnel-mobile-card__stats">
                    <div>
                      <span className="label">Тесты</span>
                      <PersonnelRosterTestCell stats={displayTestStats(u)} />
                    </div>
                    <div>
                      <span className="label">Сбития</span>
                      <strong>{u.uavHitsTotal}</strong>
                    </div>
                    <div>
                      <span className="label">Премии</span>
                      <strong>{u.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
                    </div>
                    <div>
                      <span className="label">Команд.</span>
                      <strong>
                        {u.deploymentsCount} ({u.deploymentDays} дн.)
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!isLoading && usersTotal > 0 && (
              <div className="personnel-roster-footer">
                <span className="personnel-roster-footer__total">Всего: {usersTotal}</span>
                <div className="admin-users-pagination">
                  <button
                    className="btn"
                    type="button"
                    disabled={rosterPage <= 1}
                    onClick={() => setRosterPage((page) => Math.max(1, page - 1))}
                  >
                    ‹
                  </button>
                  <span className="admin-users-page-indicator">
                    {rosterPage} / {rosterPageCount}
                  </span>
                  <button
                    className="btn"
                    type="button"
                    disabled={rosterPage >= rosterPageCount}
                    onClick={() => setRosterPage((page) => Math.min(rosterPageCount, page + 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </article>
        </>
      )}

      {tab === "top" && <PersonnelTopGrid tops={tops} profilePath={profilePath} />}

      <ResetPersonnelExamsModal
        open={resetExamsModal.open}
        saving={resetExamsSaving}
        mode="bulk"
        bulkScope={resetExamsModal.bulkScope}
        filteredCount={usersTotal}
        onBulkScopeChange={resetExamsModal.setBulkScope}
        onClose={() => resetExamsModal.setOpen(false)}
        onConfirm={() => void onResetExamsBulk()}
      />

      <PersonnelExportExcelModal
        open={exportExcelModal.open}
        loading={exportExcelLoading}
        bulkScope={exportExcelModal.bulkScope}
        filteredCount={usersTotal}
        onBulkScopeChange={exportExcelModal.setBulkScope}
        onClose={() => exportExcelModal.setOpen(false)}
        onConfirm={() => void onExportExcel()}
      />
    </section>
  );
}
