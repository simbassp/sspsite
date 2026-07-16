"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { PersonnelMedalBadge } from "@/components/personnel/PersonnelMedalBadge";
import { PersonnelModActions, postPersonnelManage } from "@/components/personnel/PersonnelModerationTools";
import { PersonnelPreviewBanner } from "@/components/personnel/PersonnelPreviewBanner";
import {
  ExamStatusIcon,
  ExamTypeIcon,
  examTypeIconTone,
  IconCalendarRange,
  IconCar,
  IconDays,
  IconDeployment,
  IconLicense,
  IconMedal,
  IconPremium,
  IconRank,
  IconUavHit,
  PersonnelBarChart,
  PersonnelPieChart,
} from "@/components/personnel/PersonnelIcons";
import { formatDate } from "@/lib/format";
import {
  PERSONNEL_EXAM_TYPES,
  PERSONNEL_LICENSE_CATEGORIES,
  PERSONNEL_MEDAL_PRESETS,
  PERSONNEL_MEDAL_SVO_TYPE,
  getMedalDisplayTitle,
  personnelExamLabel,
  personnelRequestTypeLabel,
  PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE,
  rotaUnitLabel,
} from "@/lib/personnel-catalog";
import type { Position } from "@/lib/types";

type Tab = "overview" | "exams" | "deployments" | "medals" | "premiums";
type RequestType = "medal" | "deployment" | "exam";

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
  daysInSystem: number;
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  exams: Array<{ id?: string; examType: string; status: string; passedAt: string | null; expiresAt: string | null }>;
  deployments: DeploymentRow[];
  medals: Array<{ id: string; medalType?: string; title: string; awardedAt: string }>;
  premiums: Array<{ id: string; title: string; amount: number; awardedAt: string }>;
  licenseCategories: string[];
  activityByMonth: Array<{ month: string; days: number }>;
  hitsByUavType: Array<{ label: string; value: number }>;
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

export function PersonnelProfileStats({ userId }: { userId: string }) {
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
  const [licenseDraft, setLicenseDraft] = useState<string[]>([]);
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [manageMsg, setManageMsg] = useState("");

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
      setLicenseDraft(payload.profile.licenseCategories);
      setIsPreview(payload.isPreview === true);
      setCanEditOwn(payload.canEditOwn === true);
      setCanModerate(payload.canModerate === true);
      setHidden(false);
    } catch {
      setHidden(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const otherStandalonePremiumsTotal = useMemo(
    () =>
      profile?.premiums
        .filter((p) => p.title !== PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE)
        .reduce((sum, p) => sum + p.amount, 0) ?? 0,
    [profile?.premiums],
  );

  const minSummaryPremiumTotal = deploymentPremiumsTotal + otherStandalonePremiumsTotal;

  const saveSummaryPremiumTotal = async (totalPremium: number) => {
    if (!profile) return;
    const adjustment = profile.premiums.find((p) => p.title === PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE);
    const neededAdjustment = totalPremium - minSummaryPremiumTotal;

    if (neededAdjustment < 0) {
      throw new Error(
        `Итого не может быть меньше ${minSummaryPremiumTotal.toLocaleString("ru-RU")} ₽ (сумма по командировкам и другим премиям).`,
      );
    }

    if (neededAdjustment === 0) {
      if (adjustment) {
        await postPersonnelManage({ action: "delete", entity: "premium", userId, id: adjustment.id });
      }
      return;
    }

    if (adjustment) {
      await postPersonnelManage({
        action: "update",
        entity: "premium",
        userId,
        id: adjustment.id,
        data: {
          title: PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE,
          amount: neededAdjustment,
          awardedAt: toDateInput(adjustment.awardedAt) || new Date().toISOString().slice(0, 10),
        },
      });
      return;
    }

    await postPersonnelManage({
      action: "create",
      entity: "premium",
      userId,
      data: {
        title: PERSONNEL_SUMMARY_ADJUSTMENT_PREMIUM_TITLE,
        amount: neededAdjustment,
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

  const onSaveLicenses = async () => {
    if (!canModerate || licenseSaving) return;
    setLicenseSaving(true);
    setManageMsg("");
    try {
      await postPersonnelManage({
        action: "update",
        entity: "licenses",
        userId,
        data: { categories: licenseDraft },
      });
      void load();
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Ошибка сохранения.");
    } finally {
      setLicenseSaving(false);
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
            <p className="label">Всего в системе</p>
            <strong>{profile.daysInSystem} дней</strong>
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
            <p className="label">Премия за сбитие</p>
            <strong>{profile.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
          </div>
        </div>
        <div className="personnel-stat-card personnel-stat-card--icon personnel-stat-card--rank">
          <span className="personnel-stat-card__icon personnel-stat-card__icon--purple">
            <IconRank size={20} />
          </span>
          <div>
            <p className="label">Должность</p>
            <strong style={{ fontSize: 16 }}>{profile.position}</strong>
            <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
              {rotaUnitLabel(profile.rotaPlatoon, profile.rotaSection)}
            </p>
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

            <div className="personnel-deploy-summary">
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
                <span className="label">Премия за сбитие</span>
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

            <div className="personnel-table-wrap" style={{ marginTop: 12 }}>
              <table className="personnel-table">
                <thead>
                  <tr>
                    <th>Период</th>
                    <th>Дней</th>
                    <th>Сбитий</th>
                    <th>Премия</th>
                    {canModerate && <th />}
                  </tr>
                </thead>
                <tbody>
                  {profile.deployments.map((d) => (
                    <tr key={d.id}>
                      <td>{formatPeriod(d.dateFrom, d.dateTo)}</td>
                      <td>{d.days}</td>
                      <td>{d.uavHits}</td>
                      <td>{d.premiumAmount.toLocaleString("ru-RU")} ₽</td>
                      {canModerate && <td>{renderDeploymentActions(d)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="personnel-mobile-cards">
              {profile.deployments.map((d) => (
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
            {profile.deployments.length > 0 && tab === "overview" && (
              <button type="button" className="personnel-link-btn" onClick={() => setTab("deployments")}>
                Смотреть все командировки
              </button>
            )}
          </div>
        </article>
      )}

      {(tab === "overview" || tab === "exams") && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>Зачёты</h3>
            {failedExamsCount > 0 && (
              <p className="personnel-exam-alert">
                <ExamStatusIcon passed={false} /> Не сдано: {failedExamsCount}
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
                        <ExamTypeIcon type={t} size={20} />
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
        <div className="grid-two" style={{ marginTop: 12 }}>
          <article className="card">
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
          <article className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <IconCar size={20} /> Категории прав
              </h3>
              <div className="personnel-license-row">
                {!canModerate && profile.licenseCategories.length ? (
                  profile.licenseCategories.map((c) => <IconLicense key={c} label={c} />)
                ) : !canModerate ? (
                  <p className="page-subtitle">Не указаны</p>
                ) : null}
              </div>
              {canModerate && (
                <>
                  <div className="personnel-license-edit">
                    {PERSONNEL_LICENSE_CATEGORIES.map((c) => (
                      <label key={c}>
                        <input
                          type="checkbox"
                          checked={licenseDraft.includes(c)}
                          onChange={(e) => {
                            setLicenseDraft((prev) =>
                              e.target.checked ? [...prev, c] : prev.filter((x) => x !== c),
                            );
                          }}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 10 }}
                    disabled={licenseSaving}
                    onClick={() => void onSaveLicenses()}
                  >
                    {licenseSaving ? "Сохранение…" : "Сохранить категории"}
                  </button>
                </>
              )}
            </div>
          </article>
        </div>
      )}

      {tab === "overview" && (
        <div className="grid-two" style={{ marginTop: 12 }}>
          <article className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Активность по месяцам</h3>
              <PersonnelBarChart data={profile.activityByMonth} />
            </div>
          </article>
          <article className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Сбития по типам БПЛА</h3>
              <PersonnelPieChart data={profile.hitsByUavType} />
            </div>
          </article>
        </div>
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
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {profile.premiums.map((p) => (
                <li key={p.id} style={{ marginBottom: 8 }}>
                  {p.title}: {p.amount.toLocaleString("ru-RU")} ₽ ({formatDate(p.awardedAt)})
                  {canModerate && (
                    <PersonnelModActions
                      onEdit={() => setEditModal({ kind: "premium", record: p })}
                      onDelete={() => void onDelete("premium", p.id, undefined, `премию «${p.title}»`)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {profile.premiums.length === 0 && <p className="page-subtitle">Премий пока нет</p>}
            <p className="page-subtitle" style={{ marginTop: 12 }}>
              Отдельные премии отображаются здесь. Премия внутри командировки редактируется в таблице командировок.
            </p>
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
                {editModal.kind === "deploySummaryPremium" ? "Итоговая премия за сбитие" : "Изменить запись"}
              </h3>
              <form className="form" onSubmit={onEditSubmit}>
                {editModal.kind === "deploySummaryPremium" && (
                  <>
                    <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 0 }}>
                      По командировкам: {deploymentPremiumsTotal.toLocaleString("ru-RU")} ₽
                      {otherStandalonePremiumsTotal > 0
                        ? ` · Другие премии: ${otherStandalonePremiumsTotal.toLocaleString("ru-RU")} ₽`
                        : ""}
                    </p>
                    <label className="label">Итого премия за сбитие, ₽</label>
                    <input
                      className="input"
                      type="number"
                      name="totalPremium"
                      min={minSummaryPremiumTotal}
                      defaultValue={profile.premiumsTotal}
                      required
                    />
                    <p className="page-subtitle" style={{ margin: 0 }}>
                      Минимум: {minSummaryPremiumTotal.toLocaleString("ru-RU")} ₽
                    </p>
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
                    <label className="label">Название</label>
                    <input className="input" name="title" defaultValue={editModal.record.title} required />
                    <label className="label">Сумма, ₽</label>
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
    </section>
  );
}
