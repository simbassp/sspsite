"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { PersonnelMedalBadge } from "@/components/personnel/PersonnelMedalBadge";
import { PersonnelModActions, postPersonnelManage } from "@/components/personnel/PersonnelModerationTools";
import { PersonnelPreviewBanner } from "@/components/personnel/PersonnelPreviewBanner";
import {
  postResetPersonnelExams,
  ResetPersonnelExamsButton,
  ResetPersonnelExamsModal,
  useResetPersonnelExamsModal,
} from "@/components/personnel/ResetPersonnelExamsModal";
import { readClientSession } from "@/lib/client-auth";
import { canResetTestResults } from "@/lib/permissions";
import {
  ExamStatusIcon,
  ExamTypeIcon,
  examTypeIconTone,
  IconCalendarRange,
  IconDays,
  IconDeployment,
  IconMedal,
  IconPremium,
  IconUavHit,
  PersonnelMiniBarChart,
  PersonnelPieChart,
  PersonnelStackedBarChart,
  PersonnelActivityLegend,
  personnelActivityPieData,
  filterPersonnelActivityByMonth,
  filterPersonnelActivitySummary,
  type PersonnelActivityMonth,
  type PersonnelActivitySegment,
} from "@/components/personnel/PersonnelIcons";
import { formatDate } from "@/lib/format";
import {
  PERSONNEL_EXAM_TYPES,
  PERSONNEL_MEDAL_PRESETS,
  PERSONNEL_MEDAL_SVO_TYPE,
  getMedalDisplayTitle,
  personnelExamLabel,
  personnelRequestTypeLabel,
  PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE,
} from "@/lib/personnel-catalog";
import type { Position } from "@/lib/types";

type Tab = "overview" | "exams" | "deployments" | "medals" | "premiums";
type RequestType = "medal" | "deployment" | "exam" | "premium";

const DEPLOYMENTS_PER_PAGE = 3;

function PersonnelListPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <div className="personnel-list-pagination">
      <button className="btn" type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
        ‹
      </button>
      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
        <button
          key={pageNum}
          className="btn"
          type="button"
          onClick={() => onPageChange(pageNum)}
          style={
            pageNum === safePage
              ? {
                  borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))",
                  background: "color-mix(in srgb, var(--accent) 12%, var(--panel))",
                }
              : undefined
          }
        >
          {pageNum}
        </button>
      ))}
      <button
        className="btn"
        type="button"
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(safePage + 1)}
      >
        ›
      </button>
    </div>
  );
}

type DeploymentRow = {
  id: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  uavHits: number;
  premiumAmount: number;
};

type ProfilePayload = {
  id: string;
  name: string;
  callsign: string;
  position: Position;
  rotaPlatoon: number | null;
  rotaSection: number | null;
  daysInSystem: number | null;
  employmentDate: string | null;
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  exams: Array<{ id?: string; examType: string; status: string; passedAt: string | null; expiresAt: string | null }>;
  deployments: DeploymentRow[];
  medals: Array<{ id: string; medalType?: string; title: string; awardedAt: string }>;
  premiums: Array<{
    id: string;
    title: string;
    amount: number;
    awardedAt: string;
    source?: "standalone" | "deployment";
    deploymentId?: string;
  }>;
  licenseCategories: string[];
  activityByMonth: PersonnelActivityMonth[];
  activitySummary: PersonnelActivitySegment[];
  pendingRequests: number;
};

type EditModal =
  | { kind: "deployment"; record: DeploymentRow }
  | { kind: "premium"; record: ProfilePayload["premiums"][number] }
  | { kind: "medal"; record: ProfilePayload["medals"][number] }
  | { kind: "exam"; examType: string; status: string; passedAt: string | null }
  | { kind: "deploySummaryPremium" };

function formatPeriod(from: string, to: string) {
  return `${formatDate(from)} — ${formatDate(to)}`;
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export type PersonnelActivityData = {
  activityByMonth: PersonnelActivityMonth[];
  activitySummary: PersonnelActivitySegment[];
};

export type PersonnelProfileInitialPayload = {
  profile: ProfilePayload;
  isPreview: boolean;
  canEditOwn: boolean;
  canModerate: boolean;
};

export function PersonnelProfileStats({
  userId,
  onActivityData,
  reloadToken = 0,
  initialPayload = null,
}: {
  userId: string;
  onActivityData?: (data: PersonnelActivityData) => void;
  reloadToken?: number;
  initialPayload?: PersonnelProfileInitialPayload | null;
}) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [canEditOwn, setCanEditOwn] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [hidden, setHidden] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>("deployment");
  const [requestMsg, setRequestMsg] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [manageMsg, setManageMsg] = useState("");
  const [deploymentsPage, setDeploymentsPage] = useState(1);
  const session = useMemo(() => readClientSession(), []);
  const canResetExams = useMemo(() => (session ? canResetTestResults(session) : false), [session]);
  const resetExamsModal = useResetPersonnelExamsModal("filter");
  const [resetExamsSaving, setResetExamsSaving] = useState(false);
  const [resetExamsMsg, setResetExamsMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/personnel/profile/${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (res.status === 403) {
        setHidden(true);
        return;
      }
      const payload = (await res.json()) as {
        ok?: boolean;
        profile?: ProfilePayload;
        isPreview?: boolean;
        canEditOwn?: boolean;
        canModerate?: boolean;
      };
      if (!res.ok || !payload.ok || !payload.profile) {
        setHidden(true);
        return;
      }
      setProfile(payload.profile);
      setIsPreview(payload.isPreview === true);
      setCanEditOwn(payload.canEditOwn === true);
      setCanModerate(payload.canModerate === true);
      setHidden(false);
      onActivityData?.({
        activityByMonth: payload.profile.activityByMonth,
        activitySummary: payload.profile.activitySummary,
      });
    } catch {
      setHidden(true);
    }
  }, [userId, onActivityData]);

  useEffect(() => {
    if (initialPayload && reloadToken === 0) {
      setProfile(initialPayload.profile);
      setIsPreview(initialPayload.isPreview);
      setCanEditOwn(initialPayload.canEditOwn);
      setCanModerate(initialPayload.canModerate);
      setHidden(false);
      onActivityData?.({
        activityByMonth: initialPayload.profile.activityByMonth,
        activitySummary: initialPayload.profile.activitySummary,
      });
      return;
    }
    void load();
  }, [load, reloadToken, initialPayload, onActivityData]);

  const examByType = useMemo(() => {
    const m = new Map<string, ProfilePayload["exams"][number]>();
    for (const e of profile?.exams ?? []) m.set(e.examType, e);
    return m;
  }, [profile?.exams]);

  const failedExamsCount = useMemo(() => {
    return PERSONNEL_EXAM_TYPES.filter((t) => examByType.get(t)?.status !== "passed").length;
  }, [examByType]);

  const deploymentPremiumsTotal = useMemo(
    () => profile?.deployments.reduce((sum, d) => sum + d.premiumAmount, 0) ?? 0,
    [profile?.deployments],
  );

  const serviceActivitySummary = useMemo(
    () => filterPersonnelActivitySummary(profile?.activitySummary ?? [], "service"),
    [profile?.activitySummary],
  );

  const serviceActivityByMonth = useMemo(
    () => filterPersonnelActivityByMonth(profile?.activityByMonth ?? [], "service"),
    [profile?.activityByMonth],
  );

  const deploymentsTotalPages = useMemo(
    () => Math.max(1, Math.ceil((profile?.deployments.length ?? 0) / DEPLOYMENTS_PER_PAGE)),
    [profile?.deployments.length],
  );
  const safeDeploymentsPage = Math.min(deploymentsPage, deploymentsTotalPages);
  const visibleDeployments = useMemo(() => {
    const list = profile?.deployments ?? [];
    const start = (safeDeploymentsPage - 1) * DEPLOYMENTS_PER_PAGE;
    return list.slice(start, start + DEPLOYMENTS_PER_PAGE);
  }, [profile?.deployments, safeDeploymentsPage]);

  useEffect(() => {
    if (deploymentsPage > deploymentsTotalPages) {
      setDeploymentsPage(deploymentsTotalPages);
    }
  }, [deploymentsPage, deploymentsTotalPages]);

  useEffect(() => {
    setDeploymentsPage(1);
  }, [reloadToken, profile?.deployments.length]);

  const onResetExams = async () => {
    if (!profile || resetExamsSaving) return;
    setResetExamsSaving(true);
    setResetExamsMsg("");
    try {
      const affected = await postResetPersonnelExams({ scope: "single", userId: profile.id });
      resetExamsModal.setOpen(false);
      setResetExamsMsg(
        affected > 0 ? `Зачёты сброшены (${affected} сотр.).` : "Записей зачётов не было.",
      );
      await load();
    } catch {
      setResetExamsMsg("Не удалось сбросить зачёты.");
    } finally {
      setResetExamsSaving(false);
    }
  };

  const saveSummaryPremiumTotal = async (totalPremium: number) => {
    if (!profile) return;
    if (!Number.isFinite(totalPremium) || totalPremium < 0) {
      throw new Error("Введите сумму от 0 ₽");
    }

    for (const premium of profile.premiums) {
      await postPersonnelManage({ action: "delete", entity: "premium", userId, id: premium.id });
    }

    const standaloneNeeded = Math.max(0, totalPremium - deploymentPremiumsTotal);
    if (standaloneNeeded === 0) return;

    await postPersonnelManage({
      action: "create",
      entity: "premium",
      userId,
      data: {
        title: PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE,
        amount: standaloneNeeded,
        awardedAt: new Date().toISOString().slice(0, 10),
      },
    });
  };

  const onDelete = async (
    entity: "deployment" | "premium" | "medal" | "exam",
    id?: string,
    examType?: string,
    label?: string,
  ) => {
    if (!canModerate) return;
    if (!window.confirm(`Удалить ${label ?? "запись"}?`)) return;
    setManageMsg("");
    try {
      await postPersonnelManage({ action: "delete", entity, userId, id, examType });
      void load();
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Ошибка удаления.");
    }
  };

  const onEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editModal || editSaving) return;
    setEditSaving(true);
    setManageMsg("");
    try {
      const form = new FormData(e.target as HTMLFormElement);
      if (editModal.kind === "deployment") {
        await postPersonnelManage({
          action: "update",
          entity: "deployment",
          userId,
          id: editModal.record.id,
          data: {
            dateFrom: form.get("dateFrom"),
            dateTo: form.get("dateTo"),
            uavHits: Number(form.get("uavHits") || 0),
            premiumAmount: Number(form.get("premiumAmount") || 0),
          },
        });
      } else if (editModal.kind === "premium") {
        await postPersonnelManage({
          action: "update",
          entity: "premium",
          userId,
          id: editModal.record.id,
          data: {
            title: form.get("title"),
            amount: Number(form.get("amount") || 0),
            awardedAt: form.get("awardedAt"),
          },
        });
      } else if (editModal.kind === "medal") {
        await postPersonnelManage({
          action: "update",
          entity: "medal",
          userId,
          id: editModal.record.id,
          data: {
            title: form.get("title"),
            awardedAt: form.get("awardedAt"),
          },
        });
      } else if (editModal.kind === "deploySummaryPremium") {
        await saveSummaryPremiumTotal(Number(form.get("totalPremium") || 0));
      } else {
        await postPersonnelManage({
          action: "update",
          entity: "exam",
          userId,
          examType: editModal.examType,
          data: {
            status: form.get("status"),
            passedAt: form.get("passedAt") || null,
          },
        });
      }
      setEditModal(null);
      void load();
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Ошибка сохранения.");
    } finally {
      setEditSaving(false);
    }
  };

  const onRequestSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditOwn || requestSaving) return;
    setRequestSaving(true);
    setRequestMsg("");
    try {
      const form = new FormData(e.target as HTMLFormElement);
      let payload: Record<string, unknown> = {};
      if (requestType === "medal") {
        const medalType = String(form.get("medalType") ?? "");
        const preset = PERSONNEL_MEDAL_PRESETS.find((m) => m.type === medalType);
        payload = { medalType, title: preset?.title ?? "Медаль", awardedAt: form.get("awardedAt") };
      } else if (requestType === "deployment") {
        payload = {
          dateFrom: form.get("dateFrom"),
          dateTo: form.get("dateTo"),
          uavHits: Number(form.get("uavHits") || 0),
          premiumAmount: Number(form.get("premiumAmount") || 0),
        };
      } else if (requestType === "premium") {
        payload = {
          title: form.get("title"),
          amount: Number(form.get("amount") || 0),
          awardedAt: form.get("awardedAt"),
        };
      } else {
        payload = {
          examType: form.get("examType"),
          status: form.get("status") || "passed",
          passedAt: form.get("passedAt"),
        };
      }
      const res = await fetch("/api/personnel/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestType, payload }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setRequestMsg(data.error || "Не удалось отправить заявку.");
        return;
      }
      setRequestMsg("Заявка отправлена на модерацию.");
      setRequestOpen(false);
      void load();
    } finally {
      setRequestSaving(false);
    }
  };

  const renderDeploymentActions = (d: DeploymentRow) =>
    canModerate ? (
      <PersonnelModActions
        onEdit={() => setEditModal({ kind: "deployment", record: d })}
        onDelete={() => void onDelete("deployment", d.id, undefined, "командировку")}
      />
    ) : null;

  if (hidden || !profile) return null;

  return (
    <section className="personnel-profile-stats" style={{ marginTop: 12 }}>
      {isPreview && <PersonnelPreviewBanner />}
      {canModerate && !canEditOwn && (
        <p className="personnel-mod-banner">Режим модератора: можно изменять или удалять записи в личном деле.</p>
      )}
      {manageMsg && <p className="page-subtitle">{manageMsg}</p>}

      <div className="personnel-stat-grid personnel-stat-grid--hero">
        <div className="personnel-stat-card personnel-stat-card--icon">
          <span className="personnel-stat-card__icon personnel-stat-card__icon--blue">
            <IconDays size={18} />
          </span>
          <div>
            <p className="label">Трудоустройство</p>
            {profile.employmentDate ? (
              <>
                <strong>{profile.daysInSystem} дней</strong>
                <p className="personnel-stat-card__sub">{formatDate(profile.employmentDate)}</p>
              </>
            ) : (
              <strong>Не указано</strong>
            )}
          </div>
        </div>
        <div className="personnel-stat-card personnel-stat-card--icon">
          <span className="personnel-stat-card__icon personnel-stat-card__icon--green">
            <IconDeployment size={18} />
          </span>
          <div>
            <p className="label">В командировках</p>
            <strong>{profile.deploymentsCount} раз</strong>
          </div>
        </div>
        <div className="personnel-stat-card personnel-stat-card--icon">
          <span className="personnel-stat-card__icon personnel-stat-card__icon--red">
            <IconUavHit size={18} />
          </span>
          <div>
            <p className="label">Сбитий БПЛА</p>
            <strong>{profile.uavHitsTotal}</strong>
          </div>
        </div>
        <div className="personnel-stat-card personnel-stat-card--icon">
          <span className="personnel-stat-card__icon personnel-stat-card__icon--gold">
            <IconPremium size={18} />
          </span>
          <div>
            <p className="label">Премии</p>
            <strong>{profile.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
          </div>
        </div>
      </div>

      <div className="personnel-tabs" style={{ marginTop: 12 }}>
        {(
          [
            ["overview", "Обзор"],
            ["exams", "Зачёты"],
            ["deployments", "Командировки"],
            ["medals", "Медали"],
            ["premiums", "Премии"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        {canEditOwn && (
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setRequestOpen(true)}>
            Подать заявку
          </button>
        )}
      </div>

      {(tab === "overview" || tab === "deployments") && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <IconCalendarRange />
              <h3 style={{ margin: 0 }}>Командировки</h3>
            </div>

            <div className="personnel-deploy-summary personnel-deploy-summary--mobile">
              <div>
                <span className="label">Всего командировок</span>
                <strong>{profile.deploymentsCount}</strong>
              </div>
              <div>
                <span className="label">Общее количество дней</span>
                <strong>{profile.deploymentDays}</strong>
              </div>
              <div>
                <span className="label">Сбитий БПЛА</span>
                <strong>{profile.uavHitsTotal}</strong>
              </div>
              <div>
                <span className="label">Премии</span>
                <div className="personnel-deploy-summary__value">
                  <strong>{profile.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
                  {canModerate && (
                    <button
                      type="button"
                      className="btn personnel-deploy-summary__edit"
                      title="Редактировать итоговую премию"
                      aria-label="Редактировать итоговую премию"
                      onClick={() => setEditModal({ kind: "deploySummaryPremium" })}
                    >
                      <Pencil width={16} height={16} strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="personnel-table-wrap personnel-deploy-table-wrap" style={{ marginTop: 12 }}>
              <table className="personnel-table personnel-table--deployments">
                <colgroup>
                  <col className="personnel-deploy-col-period" />
                  <col className="personnel-deploy-col-num" />
                  <col className="personnel-deploy-col-num" />
                  <col className="personnel-deploy-col-money" />
                  {canModerate && <col className="personnel-deploy-col-actions" />}
                </colgroup>
                <thead>
                  <tr className="personnel-deploy-totals">
                    <th scope="col">
                      <span className="label">Всего командировок</span>
                      <strong>{profile.deploymentsCount}</strong>
                    </th>
                    <th scope="col" className="personnel-table__num">
                      <span className="label">Общее количество дней</span>
                      <strong>{profile.deploymentDays}</strong>
                    </th>
                    <th scope="col" className="personnel-table__num">
                      <span className="label">Сбитий БПЛА</span>
                      <strong>{profile.uavHitsTotal}</strong>
                    </th>
                    <th scope="col" className="personnel-table__money">
                      <span className="label">Премии</span>
                      <div className="personnel-deploy-summary__value">
                        <strong>{profile.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
                        {canModerate && (
                          <button
                            type="button"
                            className="btn personnel-deploy-summary__edit"
                            title="Редактировать итоговую премию"
                            aria-label="Редактировать итоговую премию"
                            onClick={() => setEditModal({ kind: "deploySummaryPremium" })}
                          >
                            <Pencil width={16} height={16} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                      </div>
                    </th>
                    {canModerate && <th scope="col" className="personnel-table__actions" aria-hidden="true" />}
                  </tr>
                  <tr className="personnel-deploy-columns">
                    <th scope="col">Период</th>
                    <th scope="col" className="personnel-table__num">
                      Дней
                    </th>
                    <th scope="col" className="personnel-table__num">
                      Сбитий
                    </th>
                    <th scope="col" className="personnel-table__money">
                      Премия
                    </th>
                    {canModerate && <th scope="col" className="personnel-table__actions" />}
                  </tr>
                </thead>
                <tbody>
                  {visibleDeployments.map((d) => (
                    <tr key={d.id}>
                      <td>{formatPeriod(d.dateFrom, d.dateTo)}</td>
                      <td className="personnel-table__num">{d.days}</td>
                      <td className="personnel-table__num">{d.uavHits}</td>
                      <td className="personnel-table__money">{d.premiumAmount.toLocaleString("ru-RU")} ₽</td>
                      {canModerate && <td className="personnel-table__actions">{renderDeploymentActions(d)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="personnel-mobile-cards">
              {visibleDeployments.map((d) => (
                <article key={d.id} className="card">
                  <div className="card-body">
                    <p style={{ margin: 0, fontWeight: 700 }}>{formatPeriod(d.dateFrom, d.dateTo)}</p>
                    <p className="page-subtitle" style={{ margin: "6px 0" }}>
                      {d.days} дн. · {d.uavHits} сбитий · {d.premiumAmount.toLocaleString("ru-RU")} ₽
                    </p>
                    {renderDeploymentActions(d)}
                  </div>
                </article>
              ))}
            </div>
            {profile.deployments.length === 0 && (
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                Командировок пока нет
              </p>
            )}
            <PersonnelListPagination
              page={safeDeploymentsPage}
              totalPages={deploymentsTotalPages}
              onPageChange={setDeploymentsPage}
            />
          </div>
        </article>
      )}

      {(tab === "overview" || tab === "exams") && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div className="personnel-section-head">
              <div>
                <h3 style={{ marginTop: 0, marginBottom: failedExamsCount > 0 ? 8 : 0 }}>Зачёты</h3>
                {failedExamsCount > 0 && (
                  <p className="personnel-exam-alert" style={{ margin: 0 }}>
                    <ExamStatusIcon passed={false} /> Не сдано: {failedExamsCount}
                  </p>
                )}
              </div>
              {canResetExams && (
                <ResetPersonnelExamsButton
                  compact
                  busy={resetExamsSaving}
                  onClick={() => {
                    setResetExamsMsg("");
                    resetExamsModal.setOpen(true);
                  }}
                />
              )}
            </div>
            {resetExamsMsg && (
              <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 8 }}>
                {resetExamsMsg}
              </p>
            )}
            <div className="personnel-exam-grid">
              {PERSONNEL_EXAM_TYPES.map((t) => {
                const row = examByType.get(t);
                const passed = row?.status === "passed";
                return (
                  <div key={t} className={`personnel-exam-card ${passed ? "is-passed" : "is-failed"}`}>
                    <div className="personnel-exam-card__head">
                      <span className={`personnel-exam-card__type-icon personnel-exam-card__type-icon--${examTypeIconTone(t)}`}>
                        <ExamTypeIcon type={t} size={12} />
                      </span>
                      <ExamStatusIcon passed={passed} />
                    </div>
                    <strong className="personnel-exam-card__title">{personnelExamLabel[t]}</strong>
                    <p className="personnel-exam-card__status">{passed ? "Сдан" : "Не сдан"}</p>
                    {row?.passedAt && (
                      <p className="page-subtitle personnel-exam-card__date">{formatDate(row.passedAt)}</p>
                    )}
                    {canModerate && (
                      <PersonnelModActions
                        compact
                        onEdit={() =>
                          setEditModal({
                            kind: "exam",
                            examType: t,
                            status: row?.status ?? "failed",
                            passedAt: row?.passedAt ?? null,
                          })
                        }
                        onDelete={() => void onDelete("exam", row?.id, t, `зачёт «${personnelExamLabel[t]}»`)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      )}

      {tab === "overview" && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <IconMedal size={20} /> Медали
            </h3>
            <div className="personnel-medals-row">
              {profile.medals.slice(0, 3).map((m) => (
                <PersonnelMedalBadge key={m.id} medalType={m.medalType} title={m.title} awardedAt={m.awardedAt} size={40} />
              ))}
              {profile.medals.length === 0 && <p className="page-subtitle">Нет медалей</p>}
            </div>
            {profile.medals.length > 0 && (
              <button type="button" className="personnel-link-btn" onClick={() => setTab("medals")}>
                Все медали
              </button>
            )}
          </div>
        </article>
      )}

      {tab === "overview" && (
        <>
          <div className="grid-two" style={{ marginTop: 12 }}>
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Активность по месяцам</h3>
                <PersonnelStackedBarChart data={serviceActivityByMonth} />
                <PersonnelActivityLegend segments={serviceActivitySummary} />
              </div>
            </article>
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Общая статистика</h3>
                <PersonnelPieChart data={personnelActivityPieData(serviceActivitySummary)} />
              </div>
            </article>
          </div>
          {serviceActivitySummary.some((item) => item.value > 0) && (
            <div className="personnel-activity-mini-grid" style={{ marginTop: 12 }}>
              {serviceActivitySummary
                .filter((item) => item.value > 0)
                .map((item) => (
                  <article key={item.key} className="card personnel-activity-mini-card">
                    <div className="card-body">
                      <p className="label" style={{ margin: 0 }}>
                        {item.label}
                      </p>
                      <strong style={{ fontSize: 20 }}>{item.value}</strong>
                      <PersonnelMiniBarChart
                        color={item.color}
                        data={serviceActivityByMonth.map((month) => ({
                          month: month.month,
                          value: month.segments.find((seg) => seg.key === item.key)?.value ?? 0,
                        }))}
                      />
                    </div>
                  </article>
                ))}
            </div>
          )}
        </>
      )}

      {tab === "medals" && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div className="personnel-medals-row personnel-medals-row--badges">
              {profile.medals.map((m) => (
                <PersonnelMedalBadge
                  key={m.id}
                  medalType={m.medalType}
                  title={m.title}
                  awardedAt={formatDate(m.awardedAt)}
                  size={44}
                  showFullTitle
                />
              ))}
            </div>
            <ul style={{ marginTop: 12, listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {profile.medals.map((m) => (
                <li key={m.id} style={{ marginBottom: 8 }}>
                  {getMedalDisplayTitle(m.medalType, m.title)} — {formatDate(m.awardedAt)}
                  {canModerate && (
                    <PersonnelModActions
                      onEdit={() => setEditModal({ kind: "medal", record: m })}
                      onDelete={() => void onDelete("medal", m.id, undefined, `медаль «${m.title}»`)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {tab === "premiums" && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            {profile.premiums.length > 0 ? (
              <div className="personnel-table-wrap personnel-table-wrap--fit">
                <table className="personnel-table personnel-table--compact">
                  <thead>
                    <tr>
                      <th>За что</th>
                      <th className="personnel-table__money">Дата</th>
                      <th className="personnel-table__money">Премия</th>
                      {canModerate && <th className="personnel-table__actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {profile.premiums.map((p) => (
                      <tr key={p.id}>
                        <td>{p.title}</td>
                        <td className="personnel-table__money">{formatDate(p.awardedAt)}</td>
                        <td className="personnel-table__money">{p.amount.toLocaleString("ru-RU")} ₽</td>
                        {canModerate && (
                          <td className="personnel-table__actions">
                            {p.source === "deployment" && p.deploymentId ? (
                              <PersonnelModActions
                                onEdit={() => {
                                  const deployment = profile.deployments.find((d) => d.id === p.deploymentId);
                                  if (deployment) setEditModal({ kind: "deployment", record: deployment });
                                }}
                                onDelete={() =>
                                  void onDelete("deployment", p.deploymentId, undefined, "премию в командировке")
                                }
                              />
                            ) : (
                              <PersonnelModActions
                                onEdit={() => setEditModal({ kind: "premium", record: p })}
                                onDelete={() => void onDelete("premium", p.id, undefined, `премию «${p.title}»`)}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="page-subtitle">Премий пока нет</p>
            )}
          </div>
        </article>
      )}

      {profile.pendingRequests > 0 && (
        <p className="page-subtitle" style={{ marginTop: 8 }}>
          На модерации: {profile.pendingRequests} заявок
        </p>
      )}

      {requestOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="personnel-modal-backdrop"
          onClick={() => setRequestOpen(false)}
        >
          <article className="card personnel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Заявка: {personnelRequestTypeLabel[requestType]}</h3>
              <label className="label">Тип</label>
              <select
                className="select"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as RequestType)}
              >
                <option value="deployment">Командировка</option>
                <option value="medal">Медаль</option>
                <option value="premium">Премия</option>
                <option value="exam">Зачёт</option>
              </select>
              <form className="form" onSubmit={onRequestSubmit} style={{ marginTop: 12 }}>
                {requestType === "deployment" && (
                  <>
                    <label className="label">С</label>
                    <input className="input" type="date" name="dateFrom" required />
                    <label className="label">По</label>
                    <input className="input" type="date" name="dateTo" required />
                    <label className="label">Сбития</label>
                    <input className="input" type="number" name="uavHits" min={0} defaultValue={0} />
                    <label className="label">Премия, ₽</label>
                    <input className="input" type="number" name="premiumAmount" min={0} defaultValue={0} />
                  </>
                )}
                {requestType === "medal" && (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <PersonnelMedalBadge
                        medalType={PERSONNEL_MEDAL_SVO_TYPE}
                        title={PERSONNEL_MEDAL_PRESETS[0].title}
                        size={52}
                        showFullTitle
                      />
                    </div>
                    <input type="hidden" name="medalType" value={PERSONNEL_MEDAL_SVO_TYPE} />
                    <label className="label">Дата награждения</label>
                    <input className="input" type="date" name="awardedAt" required />
                  </>
                )}
                {requestType === "premium" && (
                  <>
                    <label className="label">За что премия</label>
                    <input className="input" name="title" placeholder="Например: за сбитие БПЛА" required />
                    <label className="label">Дата</label>
                    <input className="input" type="date" name="awardedAt" required />
                    <label className="label">Премия, ₽</label>
                    <input className="input" type="number" name="amount" min={0} defaultValue={0} required />
                  </>
                )}
                {requestType === "exam" && (
                  <>
                    <label className="label">Зачёт</label>
                    <select className="select" name="examType" required>
                      {PERSONNEL_EXAM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {personnelExamLabel[t]}
                        </option>
                      ))}
                    </select>
                    <label className="label">Результат</label>
                    <select className="select" name="status">
                      <option value="passed">Сдал</option>
                      <option value="failed">Не сдал</option>
                    </select>
                    <label className="label">Дата</label>
                    <input className="input" type="date" name="passedAt" />
                  </>
                )}
                {requestMsg && <p className="page-subtitle">{requestMsg}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={requestSaving}>
                    {requestSaving ? "Отправка…" : "Отправить на модерацию"}
                  </button>
                  <button type="button" className="btn" onClick={() => setRequestOpen(false)}>
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </article>
        </div>
      )}

      {editModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="personnel-modal-backdrop"
          onClick={() => setEditModal(null)}
        >
          <article className="card personnel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>
                {editModal.kind === "deploySummaryPremium" ? "Итоговые премии" : "Изменить запись"}
              </h3>
              <form className="form" onSubmit={onEditSubmit}>
                {editModal.kind === "deploySummaryPremium" && (
                  <>
                    <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 0 }}>
                      По командировкам: {deploymentPremiumsTotal.toLocaleString("ru-RU")} ₽
                    </p>
                    <label className="label">Итого премии, ₽</label>
                    <input
                      className="input"
                      type="number"
                      name="totalPremium"
                      min={0}
                      defaultValue={profile.premiumsTotal}
                      required
                    />
                  </>
                )}
                {editModal.kind === "deployment" && (
                  <>
                    <label className="label">С</label>
                    <input
                      className="input"
                      type="date"
                      name="dateFrom"
                      defaultValue={toDateInput(editModal.record.dateFrom)}
                      required
                    />
                    <label className="label">По</label>
                    <input
                      className="input"
                      type="date"
                      name="dateTo"
                      defaultValue={toDateInput(editModal.record.dateTo)}
                      required
                    />
                    <label className="label">Сбития</label>
                    <input
                      className="input"
                      type="number"
                      name="uavHits"
                      min={0}
                      defaultValue={editModal.record.uavHits}
                    />
                    <label className="label">Премия, ₽</label>
                    <input
                      className="input"
                      type="number"
                      name="premiumAmount"
                      min={0}
                      defaultValue={editModal.record.premiumAmount}
                    />
                  </>
                )}
                {editModal.kind === "premium" && (
                  <>
                    <label className="label">За что премия</label>
                    <input className="input" name="title" defaultValue={editModal.record.title} required />
                    <label className="label">Премия, ₽</label>
                    <input className="input" type="number" name="amount" min={0} defaultValue={editModal.record.amount} />
                    <label className="label">Дата</label>
                    <input
                      className="input"
                      type="date"
                      name="awardedAt"
                      defaultValue={toDateInput(editModal.record.awardedAt)}
                      required
                    />
                  </>
                )}
                {editModal.kind === "medal" && (
                  <>
                    <label className="label">Название</label>
                    <input className="input" name="title" defaultValue={editModal.record.title} required />
                    <label className="label">Дата</label>
                    <input
                      className="input"
                      type="date"
                      name="awardedAt"
                      defaultValue={toDateInput(editModal.record.awardedAt)}
                      required
                    />
                  </>
                )}
                {editModal.kind === "exam" && (
                  <>
                    <p className="label">Зачёт: {personnelExamLabel[editModal.examType as keyof typeof personnelExamLabel]}</p>
                    <label className="label">Результат</label>
                    <select className="select" name="status" defaultValue={editModal.status}>
                      <option value="passed">Сдан</option>
                      <option value="failed">Не сдан</option>
                    </select>
                    <label className="label">Дата</label>
                    <input
                      className="input"
                      type="date"
                      name="passedAt"
                      defaultValue={toDateInput(editModal.passedAt)}
                    />
                  </>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary" disabled={editSaving}>
                    {editSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditModal(null)}>
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </article>
        </div>
      )}

      <ResetPersonnelExamsModal
        open={resetExamsModal.open}
        saving={resetExamsSaving}
        mode="single"
        userLabel={
          profile?.callsign?.trim()
            ? `${profile.name} (${profile.callsign})`
            : profile?.name || undefined
        }
        onClose={() => resetExamsModal.setOpen(false)}
        onConfirm={() => void onResetExams()}
      />
    </section>
  );
}
