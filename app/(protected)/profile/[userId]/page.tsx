"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDateTime, formatTotalTestDuration } from "@/lib/format";
import { dutyLocationLabel } from "@/lib/duty-location";
import { getPositionBadgeClass } from "@/lib/position-ui";
import { canManageUsers, canViewUserList } from "@/lib/permissions";
import { DutyLocation, TestResult } from "@/lib/types";

type InspectUser = {
  id: string;
  name: string;
  callsign: string;
  position: string;
  login: string;
  role: "admin" | "employee";
  status: "active" | "inactive";
  is_online: boolean;
  duty_location: DutyLocation;
};

function mapRows(payload: { results?: Array<Record<string, unknown>> }): TestResult[] {
  const raw = payload.results || [];
  return raw.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    type: r.type === "final" ? "final" : "trial",
    status: r.status === "passed" ? "passed" : "failed",
    score: Number(r.score || 0),
    createdAt: String(r.created_at),
    startedAt: r.started_at ? String(r.started_at) : null,
    finishedAt: r.finished_at ? String(r.finished_at) : null,
    durationSeconds:
      r.duration_seconds === null || r.duration_seconds === undefined ? null : Number(r.duration_seconds),
    isCompleted: r.is_completed === null || r.is_completed === undefined ? null : Boolean(r.is_completed),
    questionsTotal: r.questions_total === null || r.questions_total === undefined ? null : Number(r.questions_total),
    questionsCorrect:
      r.questions_correct === null || r.questions_correct === undefined ? null : Number(r.questions_correct),
    finalAttemptIndex:
      r.final_attempt_index === null || r.final_attempt_index === undefined ? null : Number(r.final_attempt_index),
  }));
}

export default function ProfileUserInspectPage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.userId === "string" ? params.userId : "";

  const session = useMemo(() => readClientSession(), []);
  const canOpen = session ? canManageUsers(session) || canViewUserList(session) : false;
  const canEditDutyForOthers = session ? canManageUsers(session) : false;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inspectUser, setInspectUser] = useState<InspectUser | null>(null);
  const [rows, setRows] = useState<TestResult[]>([]);
  const [showAllAttempts, setShowAllAttempts] = useState(false);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [dutySaving, setDutySaving] = useState(false);
  const [dutyMessage, setDutyMessage] = useState("");

  useEffect(() => {
    if (!session || !userId || !canOpen) return;
    if (session.id === userId) {
      router.replace("/profile");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/profile/user/${encodeURIComponent(userId)}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          user?: InspectUser & { duty_location?: string };
          results?: Array<Record<string, unknown>>;
        };
        if (cancelled) return;
        if (!response.ok || !payload.ok || !payload.user) {
          setError(payload.error || "load_failed");
          setInspectUser(null);
          setRows([]);
          return;
        }
        const u = payload.user;
        const duty_location: DutyLocation = u.duty_location === "deployment" ? "deployment" : "base";
        setInspectUser({ ...u, duty_location });
        setRows(mapRows({ results: payload.results }).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
      } catch {
        if (!cancelled) setError("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const response = await fetch(`/api/profile/user/${encodeURIComponent(userId)}`, { cache: "no-store" });
          const payload = (await response.json()) as {
            ok?: boolean;
            user?: InspectUser & { duty_location?: string };
            results?: Array<Record<string, unknown>>;
          };
          if (cancelled || !response.ok || !payload.ok || !payload.user) return;
          const u = payload.user;
          const duty_location: DutyLocation =
            u.duty_location === "deployment" ? "deployment" : "base";
          setInspectUser({ ...u, duty_location });
        } catch {
          /* ignore */
        }
      })();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [session, userId, router, canOpen]);

  const stats = useMemo(() => {
    const trialRows = rows.filter((r) => r.type === "trial");
    const total = trialRows.length;
    const passed = trialRows.filter((r) => r.status === "passed").length;
    const successRate = total ? Math.round((passed / total) * 100) : 0;
    const lastAttempt = trialRows[0] ?? null;
    const completedWithDuration = trialRows.filter(
      (item) =>
        item.isCompleted !== false &&
        item.durationSeconds != null &&
        Number.isFinite(Number(item.durationSeconds)) &&
        Number(item.durationSeconds) > 0,
    );
    const totalTimeSec = completedWithDuration.length
      ? Math.round(completedWithDuration.reduce((acc, item) => acc + Number(item.durationSeconds || 0), 0))
      : null;
    return { total, passed, successRate, totalTimeSec, lastAttempt };
  }, [rows]);

  const averageDurationByType = useMemo(() => {
    const byType: Record<"trial" | "final", number[]> = { trial: [], final: [] };
    for (const row of rows) {
      if (row.isCompleted === false) continue;
      const duration = Number(row.durationSeconds ?? 0);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      byType[row.type].push(duration);
    }
    const toAvg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((acc, v) => acc + v, 0) / arr.length) : null);
    return { trial: toAvg(byType.trial), final: toAvg(byType.final) } as const;
  }, [rows]);

  const ATTEMPTS_PER_PAGE = 10;
  const attemptsTotalPages = Math.max(1, Math.ceil(rows.length / ATTEMPTS_PER_PAGE));
  const safeAttemptsPage = Math.min(attemptsPage, attemptsTotalPages);
  const pagedAttempts = rows.slice((safeAttemptsPage - 1) * ATTEMPTS_PER_PAGE, safeAttemptsPage * ATTEMPTS_PER_PAGE);
  const visibleAttempts = showAllAttempts ? pagedAttempts : rows.slice(0, 3);
  const canExpandAttempts = rows.length > 3;
  const canPaginateAttempts = showAllAttempts && attemptsTotalPages > 1;

  useEffect(() => {
    if (!showAllAttempts && attemptsPage !== 1) {
      setAttemptsPage(1);
      return;
    }
    if (attemptsPage > attemptsTotalPages) {
      setAttemptsPage(attemptsTotalPages);
    }
  }, [attemptsPage, attemptsTotalPages, showAllAttempts]);

  const iconBubble = (bg: string) =>
    ({
      width: 28,
      height: 28,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      fontSize: 14,
      marginRight: 8,
      flex: "0 0 auto",
    }) as const;

  const iconStroke = (color: string) =>
    ({
      width: 14,
      height: 14,
      color,
      stroke: "currentColor",
      fill: "none",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      display: "block",
    }) as const;

  const ListIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <line x1="9" y1="7" x2="20" y2="7" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="17" x2="20" y2="17" />
      <circle cx="5" cy="7" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="17" r="1" />
    </svg>
  );

  const CheckIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 10" />
    </svg>
  );

  const ClockIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );

  const CalendarIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );

  const UserIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ ...iconStroke(color), width: size, height: size }}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.8-3.6 4.2-5 8-5s6.2 1.4 8 5" />
    </svg>
  );

  const StatusDotIcon = ({ online }: { online: boolean }) => (
    <svg viewBox="0 0 16 16" width={10} height={10} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <circle cx="8" cy="8" r="5" fill={online ? "var(--ok)" : "var(--muted)"} />
    </svg>
  );

  if (!session) {
    return <p className="page-subtitle">Загружаем...</p>;
  }

  const onDutyChangeForUser = async (next: DutyLocation) => {
    if (!canEditDutyForOthers || !inspectUser || next === inspectUser.duty_location || dutySaving) return;
    const snapshot = inspectUser;
    const prev = snapshot.duty_location;
    setDutyMessage("");
    setInspectUser({ ...snapshot, duty_location: next });
    setDutySaving(true);
    try {
      const response = await fetch(`/api/profile/user/${encodeURIComponent(userId)}/duty-location`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dutyLocation: next }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setInspectUser({ ...snapshot, duty_location: prev });
        setDutyMessage(payload.error || "Не удалось сохранить место положения.");
        return;
      }
    } catch {
      setInspectUser({ ...snapshot, duty_location: prev });
      setDutyMessage("Ошибка сети. Повторите попытку.");
    } finally {
      setDutySaving(false);
    }
  };

  if (!canOpen) {
    return (
      <section className="profile-page">
        <h1 className="page-title">Профиль пользователя</h1>
        <p className="page-subtitle">Нет прав для просмотра профилей других пользователей.</p>
        <Link className="btn" href="/dashboard" prefetch={false}>
          На главную
        </Link>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/users" prefetch={false} className="page-subtitle" style={{ textDecoration: "none", fontWeight: 600 }}>
          ← К списку пользователей
        </Link>
      </div>

      <h1 className="page-title">Профиль пользователя</h1>
      {loading && <p className="page-subtitle">Загрузка...</p>}
      {!loading && error && (
        <p className="page-subtitle">
          {error === "not_found"
            ? "Пользователь не найден."
            : error === "forbidden" || error === "use_own_profile"
              ? "Доступ запрещён."
              : "Не удалось загрузить данные профиля."}
        </p>
      )}

      {!loading && !error && inspectUser && (
        <>
          <article className="card profile-hero-card">
            <div className="card-body">
              <div className="profile-hero">
                <div className="profile-hero-avatar" aria-hidden="true">
                  <UserIcon color="#c42b2b" size={36} />
                </div>
                <div className="profile-hero-main">
                  <p className="profile-hero-kicker">Пользовательский профиль</p>
                  <p className="profile-hero-name">{inspectUser.name || "—"}</p>
                  <p className="profile-hero-callsign">
                    Позывной: <strong>{inspectUser.callsign.trim() || "—"}</strong>
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                    @{inspectUser.login}
                    {inspectUser.status === "inactive" ? (
                      <span className="pill pill-red" style={{ marginLeft: 8 }}>
                        Неактивен
                      </span>
                    ) : null}
                  </p>
                  <div
                    className={`admin-users-position-badge ${getPositionBadgeClass(inspectUser.position)}`}
                    title="Должность"
                  >
                    {inspectUser.position}
                  </div>
                </div>
                <div className="profile-hero-duty">
                  <p className="label profile-hero-duty-label">Место положения</p>
                  {canEditDutyForOthers ? (
                    <>
                      <div className="profile-duty-toggle" role="group" aria-label="Место положения сотрудника">
                        <button
                          type="button"
                          className={`profile-duty-option${inspectUser.duty_location === "base" ? " profile-duty-option--active" : " profile-duty-option--inactive"}`}
                          onClick={() => void onDutyChangeForUser("base")}
                          disabled={dutySaving}
                        >
                          На базе
                        </button>
                        <button
                          type="button"
                          className={`profile-duty-option${inspectUser.duty_location === "deployment" ? " profile-duty-option--active" : " profile-duty-option--inactive"}`}
                          onClick={() => void onDutyChangeForUser("deployment")}
                          disabled={dutySaving}
                        >
                          В командировке
                        </button>
                      </div>
                      {!!dutyMessage && (
                        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0, color: "var(--bad)" }}>
                          {dutyMessage}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className={`duty-location-badge duty-location-badge--${inspectUser.duty_location}`}>
                      {dutyLocationLabel[inspectUser.duty_location]}
                    </span>
                  )}
                </div>
                <div className="profile-hero-divider" aria-hidden="true" />
                <div className="profile-hero-status">
                  <p className="label" style={{ margin: 0 }}>
                    Статус
                  </p>
                  <p className="profile-hero-status-value">
                    <StatusDotIcon online={inspectUser.is_online} />
                    {inspectUser.is_online ? "Онлайн" : "Офлайн"}
                  </p>
                  <span className={`profile-duty-status-badge profile-duty-status-badge--${inspectUser.duty_location}`}>
                    {dutyLocationLabel[inspectUser.duty_location]}
                  </span>
                </div>
              </div>
            </div>
          </article>

          <article className="card" style={{ marginTop: 12 }}>
            <div className="card-body">
              <h3>Активность</h3>
              {!rows.length ? (
                <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                  Нет данных по тестам.
                </p>
              ) : (
                <>
                  <div className="grid" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                    <div className="card">
                      <div className="card-body">
                        <p className="label">Всего тестов пройдено</p>
                        <p className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={iconBubble("rgba(59, 130, 246, 0.12)")}>
                            <ListIcon color="#3b82f6" />
                          </span>
                          {stats.total}
                        </p>
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-body">
                        <p className="label">Успешных попыток</p>
                        <p className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={iconBubble("rgba(35, 147, 92, 0.14)")}>
                            <CheckIcon color="#23935c" />
                          </span>
                          {stats.passed}
                        </p>
                        <p className="page-subtitle" style={{ marginBottom: 0 }}>
                          {stats.successRate}%
                        </p>
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-body">
                        <p className="label">Общее время</p>
                        <p className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={iconBubble("rgba(234, 179, 8, 0.14)")}>
                            <ClockIcon color="#b88319" />
                          </span>
                          {stats.totalTimeSec !== null ? formatTotalTestDuration(stats.totalTimeSec) : "Нет данных"}
                        </p>
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-body">
                        <p className="label">Последний тест</p>
                        <p style={{ marginTop: 10, fontWeight: 700, display: "flex", alignItems: "center" }}>
                          <span style={iconBubble("rgba(168, 85, 247, 0.14)")}>
                            <CalendarIcon color="#8b5cf6" />
                          </span>
                          {stats.lastAttempt ? formatDateTime(stats.lastAttempt.createdAt) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </article>

          <article className="card" style={{ marginTop: 12 }}>
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3>Последние попытки</h3>
                {canExpandAttempts && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setShowAllAttempts((prev) => !prev);
                      setAttemptsPage(1);
                    }}
                  >
                    {showAllAttempts ? "Показать последние 3" : "Показать все"}
                  </button>
                )}
              </div>
              {!rows.length ? (
                <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                  Пока нет попыток.
                </p>
              ) : (
                <>
                  <div className="list" style={{ marginTop: 10 }}>
                    {visibleAttempts.map((item) => {
                      const statusText = item.status === "passed" ? "Сдан" : "Не сдан";
                      const testName = item.type === "final" ? "Итоговый тест" : "Пробный тест";
                      const avgTypeDuration = averageDurationByType[item.type];
                      const avgDurationText = avgTypeDuration != null ? `${avgTypeDuration} сек` : "Нет данных";
                      const dateText = formatDateTime(item.createdAt);
                      return (
                        <article className="card" key={item.id}>
                          <div className="card-body">
                            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                              <div>
                                <p className="label">Тест</p>
                                <p style={{ marginTop: 6, fontWeight: 700 }}>{testName}</p>
                              </div>
                              <div>
                                <p className="label">Результат</p>
                                <p style={{ marginTop: 6 }}>
                                  <span className={`pill ${item.status === "passed" ? "pill-green" : "pill-red"}`}>{statusText}</span>
                                </p>
                                <p style={{ marginTop: 6, fontWeight: 700 }}>{item.score}%</p>
                              </div>
                              <div>
                                <p className="label">Сред. время</p>
                                <p style={{ marginTop: 6, fontWeight: 700 }}>{avgDurationText}</p>
                              </div>
                              <div>
                                <p className="label">Дата и время</p>
                                <p style={{ marginTop: 6, fontWeight: 700, wordBreak: "break-word" }}>{dateText}</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {canPaginateAttempts && (
                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn"
                        type="button"
                        disabled={safeAttemptsPage <= 1}
                        onClick={() => setAttemptsPage((prev) => Math.max(1, prev - 1))}
                      >
                        ‹
                      </button>
                      {Array.from({ length: attemptsTotalPages }, (_, idx) => idx + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          className="btn"
                          type="button"
                          onClick={() => setAttemptsPage(pageNum)}
                          style={
                            pageNum === safeAttemptsPage
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
                        disabled={safeAttemptsPage >= attemptsTotalPages}
                        onClick={() => setAttemptsPage((prev) => Math.min(attemptsTotalPages, prev + 1))}
                      >
                        ›
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
