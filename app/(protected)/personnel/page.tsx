"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  IconUavHit,
  PersonnelExamRosterIcon,
  PersonnelRosterLicenseCell,
  PersonnelRosterTestCell,
  type PersonnelTestRosterStats,
} from "@/components/personnel/PersonnelIcons";
import { readClientSession } from "@/lib/client-auth";
import { canManageUsers, canResetTestResults } from "@/lib/permissions";
import { dutyLocationLabel } from "@/lib/duty-location";
import { resolvePersonnelProfilePath } from "@/lib/personnel-profile-path";
import { PERSONNEL_EXAM_TYPES, rotaUnitLabel } from "@/lib/personnel-catalog";
import type { Position } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  callsign: string;
  position: Position;
  dutyLocation: "base" | "deployment";
  rotaPlatoon: number | null;
  rotaSection: number | null;
  exams: Array<{ examType: string; status: string }>;
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  licenseCategories: string[];
  testStats: PersonnelTestRosterStats;
};

type Tab = "all" | "top";

export default function PersonnelListPage() {
  const session = useMemo(() => readClientSession(), []);
  const [tab, setTab] = useState<Tab>("all");
  const [platoon, setPlatoon] = useState<"all" | "1" | "2">("all");
  const [section, setSection] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState({ totalEmployees: 0, deployedNow: 0, avgDays: 0, totalHits: 0, totalPremiums: 0 });
  const [tops, setTops] = useState<{
    hits: UserRow[];
    premiums: UserRow[];
    days: UserRow[];
  }>({ hits: [], premiums: [], days: [] });
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

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const q = new URLSearchParams();
      if (platoon !== "all") q.set("platoon", platoon);
      if (section !== "all") q.set("section", section);
      if (search.trim()) q.set("search", search.trim());
      const res = await fetch(`/api/personnel/roster?${q.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        users?: UserRow[];
        stats?: typeof stats;
        tops?: typeof tops;
        isPreview?: boolean;
      };
      if (!res.ok || !payload.ok) {
        setLoadError(payload.error || "Не удалось загрузить список.");
        return;
      }
      setUsers(payload.users ?? []);
      setStats(payload.stats ?? stats);
      setTops(payload.tops ?? tops);
      setIsPreview(payload.isPreview === true);
    } catch {
      setLoadError("Ошибка сети.");
    } finally {
      setIsLoading(false);
    }
  }, [platoon, section, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const examMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const u of users) {
      const inner = new Map<string, string>();
      for (const e of u.exams) inner.set(e.examType, e.status);
      m.set(u.id, inner);
    }
    return m;
  }, [users]);

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
          platoon,
          section,
          search: search.trim(),
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
              search: search.trim(),
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
              <div>
                <p className="label">Взвод</p>
                <select className="select" value={platoon} onChange={(e) => setPlatoon(e.target.value as typeof platoon)}>
                  <option value="all">Все</option>
                  <option value="1">1 взвод</option>
                  <option value="2">2 взвод</option>
                </select>
              </div>
              <div>
                <p className="label">Отделение</p>
                <select className="select" value={section} onChange={(e) => setSection(e.target.value as typeof section)}>
                  <option value="all">Все</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <p className="label">Поиск</p>
                <input
                  className="input"
                  placeholder="Имя или позывной"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </article>

          <div className="personnel-stat-grid">
            <div className="personnel-stat-card">
              <p className="label">Всего</p>
              <strong>{stats.totalEmployees}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">В командировке</p>
              <strong>{stats.deployedNow}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Ср. дней</p>
              <strong>{stats.avgDays}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Сбитий</p>
              <strong>{stats.totalHits}</strong>
            </div>
            <div className="personnel-stat-card">
              <p className="label">Премии</p>
              <strong>{stats.totalPremiums.toLocaleString("ru-RU")} ₽</strong>
            </div>
          </div>

          {loadError && <p style={{ color: "var(--bad)" }}>{loadError}</p>}
          {isLoading && <p className="page-subtitle">Загрузка…</p>}

          <article className="card">
            <div className="card-body">
              <p className="personnel-table-scroll-hint">Прокрутите таблицу вбок, чтобы увидеть все колонки</p>
              <PersonnelTableDualScroll>
              <table className="personnel-table">
                <thead>
                  <tr>
                    <th className="personnel-table__sticky">Сотрудник</th>
                    <th className="personnel-table__compact" title="Взвод / отделение">
                      Взвод/отд.
                    </th>
                    <th className="personnel-table__compact">Зачёты</th>
                    <th className="personnel-table__compact" title="Пробные и итоговые: сданы / не сданы">
                      Тесты
                    </th>
                    <th className="personnel-table__compact" title="Категории прав">
                      Права
                    </th>
                    <th className="personnel-table__compact" title="Командировки">
                      Команд.
                    </th>
                    <th className="personnel-table__compact">Сбития</th>
                    <th className="personnel-table__compact">Премии</th>
                    <th className="personnel-table__compact">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="personnel-table__sticky">
                        <Link href={profilePath(u.id)} style={{ fontWeight: 700, color: "inherit" }}>
                          {u.name}
                        </Link>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>{u.callsign}</div>
                      </td>
                      <td className="personnel-table__compact">{rotaUnitLabel(u.rotaPlatoon, u.rotaSection)}</td>
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
                        <PersonnelRosterTestCell stats={u.testStats} />
                      </td>
                      <td className="personnel-table__compact">
                        <PersonnelRosterLicenseCell categories={u.licenseCategories} />
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
                    </tr>
                  ))}
                </tbody>
              </table>
              </PersonnelTableDualScroll>
            </div>
            <div className="card-body personnel-mobile-cards">
              {users.map((u) => (
                <article key={u.id} className="card">
                  <div className="card-body">
                    <Link href={profilePath(u.id)} style={{ fontWeight: 700 }}>
                      {u.name} ({u.callsign})
                    </Link>
                    <p className="page-subtitle" style={{ margin: "6px 0" }}>
                      {rotaUnitLabel(u.rotaPlatoon, u.rotaSection)}
                    </p>
                    <p style={{ margin: "8px 0 0" }}>
                      <PersonnelRosterTestCell stats={u.testStats} />
                      {" · "}
                      <PersonnelRosterLicenseCell categories={u.licenseCategories} />
                    </p>
                    <p style={{ margin: "8px 0 0" }}>
                      <IconUavHit /> {u.uavHitsTotal} · {u.premiumsTotal.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </>
      )}

      {tab === "top" && (
        <div className="personnel-top-grid">
          {(
            [
              ["Топ по сбитиям", tops.hits, (u: UserRow) => u.uavHitsTotal],
              ["Топ по премиям", tops.premiums, (u: UserRow) => `${u.premiumsTotal.toLocaleString("ru-RU")} ₽`],
              ["Топ по дням в командировке", tops.days, (u: UserRow) => `${u.deploymentDays} дн.`],
            ] as const
          ).map(([title, list, fmt]) => (
            <article key={title} className="card personnel-top-card">
              <div className="card-body">
                <h3 style={{ margin: 0 }}>{title}</h3>
                <ol>
                  {list.map((u, idx) => (
                    <li key={u.id}>
                      <Link href={profilePath(u.id)}>{idx + 1}. {u.name}</Link> — {fmt(u)}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      )}

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
        filteredCount={users.length}
        onBulkScopeChange={exportExcelModal.setBulkScope}
        onClose={() => exportExcelModal.setOpen(false)}
        onConfirm={() => void onExportExcel()}
      />
    </section>
  );
}
