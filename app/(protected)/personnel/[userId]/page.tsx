"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PersonnelMedalBadge } from "@/components/personnel/PersonnelMedalBadge";
import { PersonnelPreviewBanner } from "@/components/personnel/PersonnelPreviewBanner";
import {
  ExamStatusIcon,
  IconDeployment,
  IconLicense,
  IconPremium,
  IconUavHit,
  PersonnelMiniBarChart,
  PersonnelPieChart,
  PersonnelStackedBarChart,
  PersonnelActivityLegend,
  type PersonnelActivityMonth,
  type PersonnelActivitySegment,
} from "@/components/personnel/PersonnelIcons";
import { dutyLocationLabel } from "@/lib/duty-location";
import { formatDate } from "@/lib/format";
import {
  PERSONNEL_EXAM_TYPES,
  PERSONNEL_MEDAL_PRESETS,
  PERSONNEL_MEDAL_SVO_TYPE,
  getMedalDisplayTitle,
  personnelExamLabel,
  personnelRequestTypeLabel,
  rotaUnitLabel,
} from "@/lib/personnel-catalog";
import { getPositionBadgeClass } from "@/lib/position-ui";
import type { Position } from "@/lib/types";

type Tab = "overview" | "exams" | "deployments" | "medals" | "premiums";

type Profile = {
  id: string;
  name: string;
  callsign: string;
  position: Position;
  dutyLocation: "base" | "deployment";
  rotaPlatoon: number | null;
  rotaSection: number | null;
  daysInSystem: number;
  deploymentsCount: number;
  deploymentDays: number;
  uavHitsTotal: number;
  premiumsTotal: number;
  medalsCount: number;
  licenseCategories: string[];
  exams: Array<{ examType: string; status: string; passedAt: string | null; expiresAt: string | null }>;
  deployments: Array<{
    id: string;
    dateFrom: string;
    dateTo: string;
    days: number;
    uavHits: number;
    premiumAmount: number;
  }>;
  medals: Array<{ id: string; medalType?: string; title: string; awardedAt: string }>;
  premiums: Array<{ id: string; title: string; amount: number; awardedAt: string }>;
  activityByMonth: PersonnelActivityMonth[];
  activitySummary: PersonnelActivitySegment[];
  pendingRequests: number;
};

export default function PersonnelProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [tab, setTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [canEditOwn, setCanEditOwn] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<"medal" | "deployment" | "exam">("deployment");
  const [requestMsg, setRequestMsg] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`/api/personnel/profile/${userId}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: Profile;
        isPreview?: boolean;
        canEditOwn?: boolean;
      };
      if (!res.ok || !payload.ok || !payload.profile) {
        setLoadError(payload.error || "Не удалось загрузить профиль.");
        return;
      }
      setProfile(payload.profile);
      setIsPreview(payload.isPreview === true);
      setCanEditOwn(payload.canEditOwn === true);
    } catch {
      setLoadError("Ошибка сети.");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const examByType = useMemo(() => {
    const m = new Map<string, Profile["exams"][number]>();
    for (const e of profile?.exams ?? []) m.set(e.examType, e);
    return m;
  }, [profile?.exams]);

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
        payload = {
          medalType,
          title: preset?.title ?? "Медаль",
          awardedAt: form.get("awardedAt"),
        };
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
          expiresAt: form.get("expiresAt"),
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

  if (loadError) {
    return (
      <section className="screen">
        <p style={{ color: "var(--bad)" }}>{loadError}</p>
        <Link href="/personnel">← К списку</Link>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="screen">
        <p className="page-subtitle">Загрузка профиля…</p>
      </section>
    );
  }

  return (
    <section className="screen personnel-page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <Link href="/personnel" className="page-subtitle" style={{ textDecoration: "none" }}>
            ← Сотрудники
          </Link>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            Профиль сотрудника
          </h1>
        </div>
        {canEditOwn && (
          <button type="button" className="btn btn-primary" onClick={() => setRequestOpen(true)}>
            Подать заявку
          </button>
        )}
      </div>

      {isPreview && <PersonnelPreviewBanner />}
      {profile.pendingRequests > 0 && (
        <p className="page-subtitle">На модерации: {profile.pendingRequests} заявок</p>
      )}

      <article className="card">
        <div className="card-body personnel-hero">
          <div className="personnel-hero-avatar" aria-hidden>
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 22 }}>{profile.name}</p>
            <p className="page-subtitle" style={{ margin: "4px 0" }}>
              Позывной: <strong>{profile.callsign}</strong>
            </p>
            <div className={`admin-users-position-badge ${getPositionBadgeClass(profile.position)}`}>
              {profile.position}
            </div>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              {rotaUnitLabel(profile.rotaPlatoon, profile.rotaSection)} ·{" "}
              <span className={`pill ${profile.dutyLocation === "base" ? "pill-green" : "pill-red"}`}>
                {dutyLocationLabel[profile.dutyLocation]}
              </span>
            </p>
          </div>
        </div>
      </article>

      <div className="personnel-stat-grid">
        <div className="personnel-stat-card">
          <p className="label">В системе</p>
          <strong>{profile.daysInSystem} дн.</strong>
        </div>
        <div className="personnel-stat-card">
          <p className="label">Командировки</p>
          <strong>{profile.deploymentsCount}</strong>
        </div>
        <div className="personnel-stat-card">
          <p className="label">Сбитий БПЛА</p>
          <strong>{profile.uavHitsTotal}</strong>
        </div>
        <div className="personnel-stat-card">
          <p className="label">Премии</p>
          <strong>{profile.premiumsTotal.toLocaleString("ru-RU")} ₽</strong>
        </div>
      </div>

      <div className="personnel-tabs">
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
      </div>

      {tab === "overview" && (
        <>
          <article className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Зачёты</h3>
              <div className="personnel-exam-grid">
                {PERSONNEL_EXAM_TYPES.map((t) => {
                  const row = examByType.get(t);
                  const passed = row?.status === "passed";
                  return (
                    <div key={t} className={`personnel-exam-card ${passed ? "is-passed" : "is-failed"}`}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{personnelExamLabel[t]}</strong>
                        <ExamStatusIcon passed={passed} />
                      </div>
                      <p className="page-subtitle" style={{ margin: "8px 0 0" }}>
                        {passed ? "Сдал" : "Не сдал"}
                        {row?.passedAt ? ` · ${formatDate(row.passedAt)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>

          <div className="grid-two">
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Медали</h3>
                <div className="personnel-medals-row">
                  {profile.medals.slice(0, 3).map((m) => (
                    <PersonnelMedalBadge key={m.id} medalType={m.medalType} title={m.title} awardedAt={m.awardedAt} size={40} />
                  ))}
                  {profile.medals.length === 0 && <p className="page-subtitle">Нет медалей</p>}
                </div>
              </div>
            </article>
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Категории прав</h3>
                <div className="personnel-license-row">
                  {profile.licenseCategories.length ? (
                    profile.licenseCategories.map((c) => <IconLicense key={c} label={c} />)
                  ) : (
                    <p className="page-subtitle">Не указаны</p>
                  )}
                </div>
              </div>
            </article>
          </div>

          <div className="grid-two">
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Активность по месяцам</h3>
                <PersonnelStackedBarChart data={profile.activityByMonth} />
                <PersonnelActivityLegend segments={profile.activitySummary} />
              </div>
            </article>
            <article className="card">
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Общая статистика</h3>
                <PersonnelPieChart
                  data={profile.activitySummary.map((item) => ({
                    label: item.label,
                    value: item.value,
                    color: item.color,
                  }))}
                />
              </div>
            </article>
          </div>
          {profile.activitySummary.some((item) => item.key !== "empty") && (
            <div className="personnel-activity-mini-grid" style={{ marginTop: 12 }}>
              {profile.activitySummary
                .filter((item) => item.key !== "empty")
                .map((item) => (
                  <article key={item.key} className="card personnel-activity-mini-card">
                    <div className="card-body">
                      <p className="label" style={{ margin: 0 }}>
                        {item.label}
                      </p>
                      <strong style={{ fontSize: 20 }}>{item.value}</strong>
                      <PersonnelMiniBarChart
                        color={item.color}
                        data={profile.activityByMonth.map((month) => ({
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

      {tab === "exams" && (
        <article className="card">
          <div className="card-body personnel-exam-grid">
            {PERSONNEL_EXAM_TYPES.map((t) => {
              const row = examByType.get(t);
              const passed = row?.status === "passed";
              return (
                <div key={t} className={`personnel-exam-card ${passed ? "is-passed" : "is-failed"}`}>
                  <strong>{personnelExamLabel[t]}</strong>
                  <p style={{ margin: "8px 0" }}>{passed ? "Сдал" : "Не сдал"}</p>
                  {row?.passedAt && <p className="page-subtitle">Дата: {formatDate(row.passedAt)}</p>}
                  {row?.expiresAt && <p className="page-subtitle">До: {formatDate(row.expiresAt)}</p>}
                </div>
              );
            })}
          </div>
        </article>
      )}

      {tab === "deployments" && (
        <article className="card">
          <div className="card-body personnel-table-wrap">
            <table className="personnel-table">
              <thead>
                <tr>
                  <th>Период</th>
                  <th>Дней</th>
                  <th>Сбития</th>
                  <th>Премия</th>
                </tr>
              </thead>
              <tbody>
                {profile.deployments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {formatDate(d.dateFrom)} — {formatDate(d.dateTo)}
                    </td>
                    <td>{d.days}</td>
                    <td>{d.uavHits}</td>
                    <td>{d.premiumAmount.toLocaleString("ru-RU")} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {profile.deployments.length === 0 && <p className="page-subtitle">Командировок пока нет</p>}
          </div>
        </article>
      )}

      {tab === "medals" && (
        <article className="card">
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
            <ul style={{ marginTop: 12 }}>
              {profile.medals.map((m) => (
                <li key={m.id}>
                  {getMedalDisplayTitle(m.medalType, m.title)} — {formatDate(m.awardedAt)}
                </li>
              ))}
            </ul>
          </div>
        </article>
      )}

      {tab === "premiums" && (
        <article className="card">
          <div className="card-body">
            <ul>
              {profile.premiums.map((p) => (
                <li key={p.id}>
                  {p.title}: {p.amount.toLocaleString("ru-RU")} ₽ ({formatDate(p.awardedAt)})
                </li>
              ))}
            </ul>
            {profile.premiums.length === 0 && <p className="page-subtitle">Премий пока нет</p>}
          </div>
        </article>
      )}

      {requestOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => setRequestOpen(false)}
        >
          <article className="card" style={{ width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Заявка: {personnelRequestTypeLabel[requestType]}</h3>
              <label className="label">Тип</label>
              <select
                className="select"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as typeof requestType)}
              >
                <option value="deployment">Командировка</option>
                <option value="medal">Медаль</option>
                <option value="exam">Зачёт</option>
              </select>
              <form className="form" onSubmit={onRequestSubmit} style={{ marginTop: 12 }}>
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
    </section>
  );
}
