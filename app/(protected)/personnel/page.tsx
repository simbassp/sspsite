"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserIdentityText } from "@/components/profile/UserIdentityText";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { withTimeout } from "@/lib/async-utils";
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

type ExamFilterStatus = "all" | "passed" | "failed";
type TriState = "all" | "yes" | "no";
type TestFilter = "all" | "passed" | "failed";

type RosterFilters = {
  examType: "all" | PersonnelExamType;
  examStatus: ExamFilterStatus;
  license: "all" | PersonnelLicenseCategory;
  trialTest: TestFilter;
  finalTest: TestFilter;
  hits: TriState;
  premiums: TriState;
  dutyStatus: "all" | "base" | "deployment";
};

const EMPTY_ROSTER_FILTERS: RosterFilters = {
  examType: "all",
  examStatus: "all",
  license: "all",
  trialTest: "all",
  finalTest: "all",
  hits: "all",
  premiums: "all",
  dutyStatus: "all",
};

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

function hasActiveRosterFilters(filters: RosterFilters, testDate: string) {
  return (
    testDate !== "" ||
    filters.examType !== "all" ||
    filters.examStatus !== "all" ||
    filters.license !== "all" ||
    filters.trialTest !== "all" ||
    filters.finalTest !== "all" ||
    filters.hits !== "all" ||
    filters.premiums !== "all" ||
    filters.dutyStatus !== "all"
  );
}

function userMatchesRosterFilters(
  user: UserRow,
  filters: RosterFilters,
  examMap: Map<string, Map<string, string>>,
  testDate: string,
) {
  if (filters.examType !== "all" && filters.examStatus !== "all") {
    const passed = examMap.get(user.id)?.get(filters.examType) === "passed";
    if (filters.examStatus === "passed" && !passed) return false;
    if (filters.examStatus === "failed" && passed) return false;
  }

  if (filters.license !== "all" && !user.licenseCategories.includes(filters.license)) return false;

  const ts = resolveUserTestStats(user, testDate);
  if (filters.trialTest === "passed" && ts.trialPassed === 0) return false;
  if (filters.trialTest === "failed") {
    if (testDate ? ts.trialFailed === 0 : ts.trialPassed > 0) return false;
  }
  if (filters.finalTest === "passed" && ts.finalPassed === 0) return false;
  if (filters.finalTest === "failed") {
    if (testDate ? ts.finalFailed === 0 : ts.finalPassed > 0) return false;
  }

  if (filters.hits === "yes" && user.uavHitsTotal === 0) return false;
  if (filters.hits === "no" && user.uavHitsTotal > 0) return false;
  if (filters.premiums === "yes" && user.premiumsTotal === 0) return false;
  if (filters.premiums === "no" && user.premiumsTotal > 0) return false;
  if (filters.dutyStatus !== "all" && user.dutyLocation !== filters.dutyStatus) return false;

  return true;
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

function calcFilteredStats(list: UserRow[]) {
  const totals = list.reduce(
    (acc, user) => {
      acc.totalEmployees += 1;
      if (user.dutyLocation === "deployment") acc.deployedNow += 1;
      acc.totalDays += user.deploymentDays;
      acc.totalHits += user.uavHitsTotal;
      acc.totalPremiums += user.premiumsTotal;
      return acc;
    },
    { totalEmployees: 0, deployedNow: 0, totalDays: 0, totalHits: 0, totalPremiums: 0 },
  );
  return {
    ...totals,
    avgDays: totals.totalEmployees ? Math.round(totals.totalDays / totals.totalEmployees) : 0,
  };
}

type UserRow = {
  id: string;
  name: string;
  callsign: string;
  nameColor?: ProfileNameColorId | null;
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
const SEARCH_DEBOUNCE_MS = 350;

export default function PersonnelListPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const session = useMemo(() => (isHydrated ? readClientSession() : null), [isHydrated]);
  const [tab, setTab] = useState<Tab>("all");
  const [platoon, setPlatoon] = useState<"all" | "1" | "2">("all");
  const [section, setSection] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const [module, setModule] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [testDateFilter, setTestDateFilter] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState({ totalEmployees: 0, deployedNow: 0, avgDays: 0, totalHits: 0, totalPremiums: 0 });
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
  const [rosterFilters, setRosterFilters] = useState<RosterFilters>(EMPTY_ROSTER_FILTERS);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++loadSeqRef.current;

    setIsLoading(true);
    setLoadError("");
    try {
      const q = new URLSearchParams();
      if (platoon !== "all") q.set("platoon", platoon);
      if (section !== "all") q.set("section", section);
      if (module !== "all") q.set("module", module);
      if (debouncedSearch) q.set("search", debouncedSearch);
      if (testDateFilter) q.set("testDate", testDateFilter);
      const res = await withTimeout(
        fetch(`/api/personnel/roster?${q.toString()}`, { cache: "no-store", signal: controller.signal }),
        ROSTER_FETCH_TIMEOUT_MS,
        "roster_timeout",
      );
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        users?: UserRow[];
        stats?: typeof stats;
        tops?: typeof tops;
        isPreview?: boolean;
      };
      if (seq !== loadSeqRef.current) return;
      if (!res.ok || !payload.ok) {
        setLoadError(payload.error || "Не удалось загрузить список.");
        return;
      }
      setUsers(payload.users ?? []);
      if (payload.stats) setStats(payload.stats);
      if (payload.tops) setTops(payload.tops);
      setIsPreview(payload.isPreview === true);
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
  }, [platoon, section, module, debouncedSearch, testDateFilter]);

  const examMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const u of users) {
      const inner = new Map<string, string>();
      for (const e of u.exams) inner.set(e.examType, e.status);
      m.set(u.id, inner);
    }
    return m;
  }, [users]);

  const filteredUsers = useMemo(
    () => users.filter((user) => userMatchesRosterFilters(user, rosterFilters, examMap, testDateFilter)),
    [users, rosterFilters, examMap, testDateFilter],
  );

  const tableStats = useMemo(() => calcFilteredStats(filteredUsers), [filteredUsers]);
  const displayStats = users.length === 0 && isLoading ? stats : tableStats;
  const rosterFiltersActive = hasActiveRosterFilters(rosterFilters, testDateFilter);
  const displayTestStats = (user: UserRow) => resolveUserTestStats(user, testDateFilter);

  const setRosterFilter = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => {
    setRosterFilters((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [isHydrated, load]);

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
          userIds: filteredUsers.map((user) => user.id),
          testDate: testDateFilter || undefined,
          examType: rosterFilters.examType,
          examStatus: rosterFilters.examStatus,
          license: rosterFilters.license,
          trialTest: rosterFilters.trialTest,
          finalTest: rosterFilters.finalTest,
          hits: rosterFilters.hits,
          premiums: rosterFilters.premiums,
          dutyStatus: rosterFilters.dutyStatus,
          filterLines: buildExportFilterLines({
            platoon,
            section,
            module,
            search: debouncedSearch,
            testDate: testDateFilter,
            filters: rosterFilters,
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
              platoon,
              section,
              search: debouncedSearch,
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
                  <select className="select" value={platoon} onChange={(e) => setPlatoon(e.target.value as typeof platoon)}>
                    <option value="all">Все</option>
                    <option value="1">1 взвод</option>
                    <option value="2">2 взвод</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Отделение</p>
                  <select className="select" value={section} onChange={(e) => setSection(e.target.value as typeof section)}>
                    <option value="all">Все</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="personnel-filters__field">
                  <p className="label">Модуль</p>
                  <select className="select" value={module} onChange={(e) => setModule(e.target.value)}>
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
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                    />
                  </div>
                  <div className="personnel-filters__field personnel-filters__field--date">
                    <p className="label">Дата тестов</p>
                    <input
                      className="input"
                      type="date"
                      value={testDateFilter}
                      onChange={(e) => setTestDateFilter(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="personnel-filters__row personnel-filters__row--secondary">
                <div className="personnel-filters__field">
                  <p className="label">Зачёт</p>
                  <select
                    className="select"
                    value={rosterFilters.examType}
                    onChange={(e) => {
                      const nextType = e.target.value as RosterFilters["examType"];
                      setRosterFilters((prev) => ({
                        ...prev,
                        examType: nextType,
                        examStatus: nextType === "all" ? "all" : prev.examStatus,
                      }));
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
                    value={rosterFilters.examStatus}
                    onChange={(e) => setRosterFilter("examStatus", e.target.value as ExamFilterStatus)}
                    disabled={rosterFilters.examType === "all"}
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
                    value={rosterFilters.license}
                    onChange={(e) => setRosterFilter("license", e.target.value as RosterFilters["license"])}
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
                    value={rosterFilters.hits}
                    onChange={(e) => setRosterFilter("hits", e.target.value as TriState)}
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
                    value={rosterFilters.premiums}
                    onChange={(e) => setRosterFilter("premiums", e.target.value as TriState)}
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
                    value={rosterFilters.trialTest}
                    onChange={(e) => setRosterFilter("trialTest", e.target.value as TestFilter)}
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
                    value={rosterFilters.finalTest}
                    onChange={(e) => setRosterFilter("finalTest", e.target.value as TestFilter)}
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
                    value={rosterFilters.dutyStatus}
                    onChange={(e) => setRosterFilter("dutyStatus", e.target.value as RosterFilters["dutyStatus"])}
                  >
                    <option value="all">Все</option>
                    <option value="base">На базе</option>
                    <option value="deployment">В командировке</option>
                  </select>
                </div>
              </div>
            </div>
          </article>

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
              Показано {filteredUsers.length} из {users.length}
              {" · "}
              <button
                type="button"
                className="personnel-table-filter-reset"
                onClick={() => {
                  setRosterFilters(EMPTY_ROSTER_FILTERS);
                  setTestDateFilter("");
                }}
              >
                Сбросить фильтры
              </button>
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
                    <th className="personnel-table__sticky">Сотрудник</th>
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
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="personnel-table__sticky">
                        <Link href={profilePath(u.id)} className="personnel-roster-person">
                          <UserIdentityText
                            as="div"
                            name={u.name}
                            callsign={u.callsign}
                            nameColor={u.nameColor ?? null}
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
                  {!isLoading && filteredUsers.length === 0 && (
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
              {!isLoading && filteredUsers.length === 0 && (
                <p className="personnel-mobile-empty">
                  {users.length === 0 ? "Сотрудники не найдены" : "Нет сотрудников по выбранным фильтрам"}
                </p>
              )}
              {filteredUsers.map((u) => (
                <article key={u.id} className="personnel-mobile-card">
                  <div className="personnel-mobile-card__head">
                    <div>
                      <Link href={profilePath(u.id)} className="personnel-mobile-card__name">
                        <UserIdentityText
                          name={u.name}
                          nameColor={u.nameColor ?? null}
                          nameClassName="personnel-mobile-card__name-text"
                        />
                      </Link>
                      {u.callsign ? (
                        <p className="personnel-mobile-card__callsign">
                          <UserIdentityText callsign={u.callsign} nameColor={u.nameColor ?? null} />
                        </p>
                      ) : null}
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
          </article>
        </>
      )}

      {tab === "top" && <PersonnelTopGrid tops={tops} profilePath={profilePath} />}

      <ResetPersonnelExamsModal
        open={resetExamsModal.open}
        saving={resetExamsSaving}
        mode="bulk"
        bulkScope={resetExamsModal.bulkScope}
        filteredCount={users.length}
        onBulkScopeChange={resetExamsModal.setBulkScope}
        onClose={() => resetExamsModal.setOpen(false)}
        onConfirm={() => void onResetExamsBulk()}
      />

      <PersonnelExportExcelModal
        open={exportExcelModal.open}
        loading={exportExcelLoading}
        bulkScope={exportExcelModal.bulkScope}
        filteredCount={filteredUsers.length}
        onBulkScopeChange={exportExcelModal.setBulkScope}
        onClose={() => exportExcelModal.setOpen(false)}
        onConfirm={() => void onExportExcel()}
      />
    </section>
  );
}
