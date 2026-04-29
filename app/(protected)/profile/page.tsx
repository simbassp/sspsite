"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createInviteCode,
  disableInviteCode,
  enableInviteCode,
  fetchCurrentAuthEmail,
  InviteCodeRecord,
  persistSession,
  removeInviteCode,
  requestPasswordReset,
  updateCurrentUserProfile,
  updateCurrentUserEmail,
  updateCurrentUserPassword,
  updateCurrentUserPasswordWithOldPassword,
} from "@/lib/users-repository";
import { TestResult } from "@/lib/types";

export default function ProfilePage() {
  const [session, setSession] = useState<ReturnType<typeof readClientSession>>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [rows, setRows] = useState<TestResult[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCodeRecord[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [oldEmailInput, setOldEmailInput] = useState("");
  const [newEmailInput, setNewEmailInput] = useState("");
  const [newEmailRepeat, setNewEmailRepeat] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState("");
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState(() => session?.name ?? "");
  const [profileCallsignInput, setProfileCallsignInput] = useState(() => session?.callsign ?? "");
  const [isOnline, setIsOnline] = useState(true);
  const [fieldError, setFieldError] = useState<{ name?: string; callsign?: string }>({});
  const [isResettingStats, setIsResettingStats] = useState(false);
  const canManageInvites = session?.role === "admin" || session?.permissions.users === true;

  useEffect(() => {
    setSession(readClientSession());
    setSessionResolved(true);
  }, []);

  useEffect(() => {
    if (!session) return;
    setProfileNameInput(session.name ?? "");
    setProfileCallsignInput(session.callsign ?? "");
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setIsInitialLoading(true);
      setInitialLoadError("");
      try {
        const response = await fetch("/api/profile/bootstrap", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          email?: string;
          results?: Array<Record<string, unknown>>;
          inviteCodes?: Array<Record<string, unknown>>;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "profile_bootstrap_failed");
        }
        if (cancelled) return;
        const mappedRows = (payload.results || []).map((r) => ({
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
        })) as TestResult[];
        setRows(mappedRows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
        if (typeof payload.email === "string" && payload.email) {
          setEmailInput(payload.email);
        } else {
          const emailResult = await fetchCurrentAuthEmail();
          if (!cancelled && emailResult.ok) setEmailInput(emailResult.email);
        }
        if (canManageInvites) {
          setIsInviteLoading(true);
          const mappedInvites = (payload.inviteCodes || []).map((x) => ({
            code: String(x.code),
            isActive: Boolean(x.is_active),
            maxUses: x.max_uses === null || x.max_uses === undefined ? null : Number(x.max_uses),
            usedCount: Number(x.used_count || 0),
            createdAt: String(x.created_at || ""),
          })) as InviteCodeRecord[];
          if (!cancelled) setInviteCodes(mappedInvites);
          if (!cancelled) setIsInviteLoading(false);
        }
      } catch {
        if (!cancelled) setInitialLoadError("Не удалось загрузить часть данных профиля. Попробуйте обновить страницу.");
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, canManageInvites]);

  useEffect(() => {
    const sync = () => setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const stats = useMemo(() => {
    if (!session) return { total: 0, passed: 0, successRate: 0, averageTimeSec: null as number | null, lastAttempt: null as TestResult | null };
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
    const averageTimeSec = completedWithDuration.length
      ? Math.round(
          completedWithDuration.reduce((acc, item) => acc + Number(item.durationSeconds || 0), 0) /
            completedWithDuration.length,
        )
      : null;
    return { total, passed, successRate, averageTimeSec, lastAttempt };
  }, [rows, session]);

  const attemptMeta = useMemo(() => {
    const byType = new Map<"trial" | "final", TestResult[]>();
    for (const row of rows) {
      const list = byType.get(row.type) || [];
      list.push(row);
      byType.set(row.type, list);
    }
    const totalByType = new Map<"trial" | "final", number>();
    const indexById = new Map<string, number>();
    for (const [type, list] of byType.entries()) {
      const asc = [...list].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      totalByType.set(type, asc.length);
      asc.forEach((item, idx) => indexById.set(item.id, idx + 1));
    }
    return { totalByType, indexById };
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
    return {
      trial: toAvg(byType.trial),
      final: toAvg(byType.final),
    } as const;
  }, [rows]);

  if (!sessionResolved) {
    return <p className="page-subtitle">Загружаем профиль...</p>;
  }

  if (!session) {
    return <p className="page-subtitle">Профиль не найден.</p>;
  }

  const createRandomCode = () => {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInviteInput(`PVO-${new Date().getFullYear()}-${random}`);
  };

  const refreshInvites = async () => {
    if (!canManageInvites) return;
    const response = await fetch("/api/profile/bootstrap", { cache: "no-store" });
    const payload = (await response.json()) as { ok?: boolean; inviteCodes?: Array<Record<string, unknown>> };
    if (!response.ok || !payload.ok || !Array.isArray(payload.inviteCodes)) return;
    const mapped = payload.inviteCodes.map((x) => ({
      code: String(x.code),
      isActive: Boolean(x.is_active),
      maxUses: x.max_uses === null || x.max_uses === undefined ? null : Number(x.max_uses),
      usedCount: Number(x.used_count || 0),
      createdAt: String(x.created_at || ""),
    })) as InviteCodeRecord[];
    setInviteCodes(mapped);
  };  

  const onCreateInvite = async () => {
    if (!canManageInvites) return;
    setAdminMessage("");
    const normalizedCode = inviteInput.trim().toUpperCase();
    if (!normalizedCode) {
      setAdminMessage("Введите код приглашения");
      return;
    }
    if (!/^[A-Z0-9-]{3,40}$/.test(normalizedCode)) {
      setAdminMessage("Используйте только латинские буквы, цифры и дефисы");
      return;
    }
    const maxUses = maxUsesInput.trim() ? Number(maxUsesInput.trim()) : null;
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      setAdminMessage("Введите положительное число");
      return;
    }
    const result = await createInviteCode({
      code: normalizedCode,
      maxUses: Number.isFinite(maxUses) && maxUses !== null ? maxUses : null,
    });
    if (!result.ok) {
      setAdminMessage(result.error);
      return;
    }
    setAdminMessage("Код приглашения создан.");
    setInviteInput("");
    setMaxUsesInput("");
    await refreshInvites();
  };

  const onDisableInvite = async (code: string) => {
    if (!canManageInvites) return;
    setAdminMessage("");
    await disableInviteCode(code);
    setAdminMessage(`Код ${code} отключен.`);
    await refreshInvites();
  };

  const onEnableInvite = async (code: string) => {
    if (!canManageInvites) return;
    setAdminMessage("");
    await enableInviteCode(code);
    setAdminMessage(`Код ${code} включен.`);
    await refreshInvites();
  };

  const onDeleteInvite = async (code: string) => {
    if (!canManageInvites) return;
    if (!window.confirm(`Удалить код ${code}?`)) return;
    setAdminMessage("");
    await removeInviteCode(code);
    setAdminMessage(`Код ${code} удален.`);
    await refreshInvites();
  };

  const onChangeEmail = async () => {
    setSettingsMessage("");
    const oldEmail = oldEmailInput.trim().toLowerCase();
    const currentEmail = emailInput.trim().toLowerCase();
    if (!oldEmail || !currentEmail) {
      setSettingsMessage("Укажите текущий email.");
      return;
    }
    if (oldEmail !== currentEmail) {
      setSettingsMessage("Текущий email введен неверно.");
      return;
    }
    const nextEmail = newEmailInput.trim();
    if (!nextEmail) {
      setSettingsMessage("Введите новый email.");
      return;
    }
    if (nextEmail.toLowerCase() !== newEmailRepeat.trim().toLowerCase()) {
      setSettingsMessage("Новый email и подтверждение не совпадают.");
      return;
    }
    const result = await updateCurrentUserEmail(nextEmail);
    if (!result.ok) {
      setSettingsMessage(result.error);
      return;
    }
    setSettingsMessage(result.message);
    setEmailModalOpen(false);
    setOldEmailInput("");
    setNewEmailInput("");
    setNewEmailRepeat("");
    window.alert("Запрос на смену почты отправлен. Подтвердите новый email по ссылке в письме.");
  };

  const onChangePassword = async () => {
    setSettingsMessage("");
    if (!oldPasswordInput.trim()) {
      setSettingsMessage("Введите текущий пароль.");
      return;
    }
    if (passwordInput.length < 6) {
      setSettingsMessage("Новый пароль должен быть не короче 6 символов.");
      return;
    }
    if (passwordInput !== passwordRepeat) {
      setSettingsMessage("Пароли не совпадают.");
      return;
    }
    const result = isSupabaseConfigured
      ? await updateCurrentUserPasswordWithOldPassword({
          oldPassword: oldPasswordInput,
          nextPassword: passwordInput,
        })
      : await updateCurrentUserPassword(passwordInput);
    if (!result.ok) {
      setSettingsMessage(result.error);
      return;
    }
    setSettingsMessage(result.message);
    window.alert("Пароль успешно изменен.");
    setPasswordModalOpen(false);
    setOldPasswordInput("");
    setPasswordInput("");
    setPasswordRepeat("");
  };

  const onForgotPassword = async () => {
    setSettingsMessage("");
    if (!emailInput.trim()) {
      setSettingsMessage("Не удалось определить email. Введите email и повторите.");
      return;
    }
    const result = await requestPasswordReset(emailInput.trim());
    if (!result.ok) {
      setSettingsMessage(result.error);
      return;
    }
    setSettingsMessage("Ссылка для сброса пароля отправлена на email.");
    setPasswordModalOpen(false);
    window.alert("Ссылка для сброса пароля отправлена на email.");
  };

  const onSaveProfile = async () => {
    setSettingsMessage("");
    setFieldError({});
    const trimmedName = profileNameInput.trim();
    const trimmedCallsign = profileCallsignInput.trim();
    const nextError: { name?: string; callsign?: string } = {};
    if (trimmedName.length < 2) nextError.name = "Минимум 2 символа";
    if (trimmedCallsign.length < 2) nextError.callsign = "Минимум 2 символа";
    if (nextError.name || nextError.callsign) {
      setFieldError(nextError);
      return;
    }
    const result = await updateCurrentUserProfile({
      name: trimmedName,
      callsign: trimmedCallsign,
    });
    if (!result.ok) {
      setSettingsMessage(result.error);
      return;
    }
    persistSession({
      ...session,
      name: result.name,
      callsign: result.callsign,
    });
    setSettingsMessage("Профиль сохранён");
  };

  const visibleAttempts = rows;
  const onResetStats = async () => {
    if (isResettingStats) return;
    if (
      !window.confirm(
        "Сбросить статистику профиля? Итоговые попытки (лимит и окно итогового теста) НЕ будут сброшены.",
      )
    ) {
      return;
    }
    setIsResettingStats(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/profile/reset-stats", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setSettingsMessage(payload.error || "Не удалось сбросить статистику.");
        return;
      }
      setSettingsMessage("Статистика профиля сброшена (без сброса итоговых попыток).");
      const refreshed = await fetch("/api/profile/bootstrap", { cache: "no-store" });
      const refreshedPayload = (await refreshed.json()) as { ok?: boolean; results?: Array<Record<string, unknown>> };
      if (refreshed.ok && refreshedPayload.ok && Array.isArray(refreshedPayload.results)) {
        const mappedRows = refreshedPayload.results.map((r) => ({
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
        })) as TestResult[];
        setRows(mappedRows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
      }
    } finally {
      setIsResettingStats(false);
    }
  };

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

  const UserIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.8-3.6 4.2-5 8-5s6.2 1.4 8 5" />
    </svg>
  );

  const ShieldIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStroke(color)}>
      <path d="M12 3l7 3v6c0 4.2-2.8 7.8-7 9-4.2-1.2-7-4.8-7-9V6l7-3z" />
    </svg>
  );

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

  return (
    <section className="profile-page">
      <h1 className="page-title">Профиль</h1>
      {isInitialLoading && <p className="page-subtitle">Загружаем профиль...</p>}
      {!!initialLoadError && <p className="page-subtitle">{initialLoadError}</p>}

      <article className="card">
        <div className="card-body">
          <h3>Пользовательский профиль</h3>
          <div className="grid" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <p className="label">Пользователь</p>
              <p style={{ fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center" }}>
                <span style={iconBubble("rgba(196, 43, 43, 0.10)")}>
                  <UserIcon color="#c42b2b" />
                </span>
                {profileNameInput || session.name}
              </p>
            </div>
            <div>
              <p className="label">Роль</p>
              <p style={{ fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center" }}>
                <span style={iconBubble("rgba(59, 130, 246, 0.12)")}>
                  <ShieldIcon color="#3b82f6" />
                </span>
                {session.role === "admin" ? "Администратор" : session.position || "Специалист"}
              </p>
            </div>
            <div>
              <p className="label">Статус</p>
              <p style={{ fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: isOnline ? "var(--ok)" : "var(--muted)",
                    display: "inline-block",
                  }}
                />
                {isOnline ? "Онлайн" : "Офлайн"}
                <button className="btn" type="button" onClick={() => void onResetStats()} disabled={isResettingStats}>
                  {isResettingStats ? "Сбрасываю..." : "Сброс статистики"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </article>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>Настройки аккаунта</h3>
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            Здесь можно обновить почту и пароль для входа.
          </p>

          <div className="form" style={{ marginTop: 10 }}>
            <div className="grid grid-two">
              <div>
                <label className="label">Имя</label>
                <input
                  className="input"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  placeholder="Ваше имя"
                />
                {!!fieldError.name && (
                  <p className="page-subtitle" style={{ marginTop: 4, marginBottom: 0, color: "var(--bad)" }}>
                    {fieldError.name}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Позывной</label>
                <input
                  className="input"
                  value={profileCallsignInput}
                  onChange={(e) => setProfileCallsignInput(e.target.value)}
                  placeholder="Ваш позывной"
                />
                {!!fieldError.callsign && (
                  <p className="page-subtitle" style={{ marginTop: 4, marginBottom: 0, color: "var(--bad)" }}>
                    {fieldError.callsign}
                  </p>
                )}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => void onSaveProfile()}>
              Сохранить профиль
            </button>

            <label className="label">Email для входа</label>
            <input
              className="input"
              type="email"
              value={emailInput || "не определен"}
              readOnly
              placeholder="name@example.com"
            />
            <button className="btn" type="button" onClick={() => setEmailModalOpen(true)}>
              Сменить почту
            </button>

            <button className="btn btn-primary" type="button" onClick={() => setPasswordModalOpen(true)}>
              Сменить пароль
            </button>

            {settingsMessage && <p className="page-subtitle">{settingsMessage}</p>}
          </div>
        </div>
      </article>

      {emailModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <article className="card" style={{ width: "min(560px, 100%)" }}>
            <div className="card-body">
              <h3>Смена почты</h3>
              <div className="form" style={{ marginTop: 10 }}>
                <label className="label">Текущая почта</label>
                <input
                  className="input"
                  type="email"
                  value={oldEmailInput}
                  onChange={(e) => setOldEmailInput(e.target.value)}
                  placeholder="Введите текущую почту"
                />
                <label className="label">Новая почта</label>
                <input
                  className="input"
                  type="email"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="Введите новую почту"
                />
                <label className="label">Повторите новую почту</label>
                <input
                  className="input"
                  type="email"
                  value={newEmailRepeat}
                  onChange={(e) => setNewEmailRepeat(e.target.value)}
                  placeholder="Повторите новую почту"
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" type="button" onClick={() => void onChangeEmail()}>
                    Подтвердить смену почты
                  </button>
                  <button className="btn" type="button" onClick={() => setEmailModalOpen(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {passwordModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <article className="card" style={{ width: "min(560px, 100%)" }}>
            <div className="card-body">
              <h3>Смена пароля</h3>
              <div className="form" style={{ marginTop: 10 }}>
                <label className="label">Текущий пароль</label>
                <input
                  className="input"
                  type="password"
                  value={oldPasswordInput}
                  onChange={(e) => setOldPasswordInput(e.target.value)}
                  placeholder="Введите текущий пароль"
                />
                <label className="label">Новый пароль</label>
                <input
                  className="input"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Минимум 6 символов"
                />
                <label className="label">Повторите новый пароль</label>
                <input
                  className="input"
                  type="password"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  placeholder="Повторите пароль"
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" type="button" onClick={() => void onChangePassword()}>
                    Подтвердить смену пароля
                  </button>
                  <button className="btn" type="button" onClick={() => setPasswordModalOpen(false)}>
                    Отмена
                  </button>
                </div>
                <button className="btn" type="button" onClick={() => void onForgotPassword()}>
                  Не помню текущий пароль (сброс по email)
                </button>
              </div>
            </div>
          </article>
        </div>
      )}

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>Ваша активность</h3>
          {!rows.length ? (
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Статистика появится после прохождения первого теста.
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
                    <p className="label">Среднее время</p>
                    <p className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={iconBubble("rgba(234, 179, 8, 0.14)")}>
                        <ClockIcon color="#b88319" />
                      </span>
                      {stats.averageTimeSec !== null ? `${stats.averageTimeSec} сек` : "Нет данных"}
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
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "color-mix(in srgb, var(--panel2) 70%, transparent)",
                  padding: "10px 12px",
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                Статистика обновляется после каждой попытки прохождения теста.
              </div>
            </>
          )}
        </div>
      </article>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3>Последние попытки</h3>
            <Link href="/tests" className="btn">
              Перейти к тестам
            </Link>
          </div>
          {!rows.length ? (
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Пока нет попыток прохождения тестов.
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
            </>
          )}
        </div>
      </article>

      {canManageInvites && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <h3>Персональные коды приглашений</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Создавайте персональные коды регистрации, управляйте статусом и лимитами.
            </p>

            <div className="form" style={{ marginTop: 10 }}>
              <label className="label">Код приглашения</label>
              <input
                className="input"
                placeholder="например: PVO-2026-ALPHA"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              />
              <button className="btn" type="button" onClick={createRandomCode}>
                Сгенерировать код
              </button>

              <label className="label">Лимит регистраций (пусто = без лимита)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
              />

              <button className="btn btn-primary" type="button" onClick={() => void onCreateInvite()}>
                Сохранить код
              </button>
              {adminMessage && <p className="page-subtitle">{adminMessage}</p>}
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {inviteCodes.map((invite) => (
                <article className="card" key={invite.code}>
                  <div className="card-body">
                    <h3 style={{ marginBottom: 0 }}>{invite.code}</h3>
                    {(() => {
                      const exhausted = invite.maxUses !== null && invite.usedCount >= invite.maxUses;
                      return (
                        <div className="meta" style={{ marginTop: 8 }}>
                          <span className={`pill ${invite.isActive && !exhausted ? "pill-green" : "pill-red"}`}>
                            {invite.isActive ? (exhausted ? "Лимит исчерпан" : "Активен") : "Отключен"}
                          </span>
                          <span style={exhausted ? { color: "#ff8d8d", fontWeight: 700 } : undefined}>
                            Использовано: {invite.usedCount}
                            {invite.maxUses ? ` / ${invite.maxUses}` : ""}
                          </span>
                          <span>{formatDate(invite.createdAt)}</span>
                        </div>
                      );
                    })()}
                    <div className="form" style={{ marginTop: 10 }}>
                      {invite.isActive ? (
                        <button className="btn" type="button" onClick={() => void onDisableInvite(invite.code)}>
                          Отключить
                        </button>
                      ) : (
                        <button className="btn" type="button" onClick={() => void onEnableInvite(invite.code)}>
                          Включить
                        </button>
                      )}
                      <button className="btn btn-danger" type="button" onClick={() => void onDeleteInvite(invite.code)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!inviteCodes.length && <p className="page-subtitle">Коды приглашений ещё не созданы.</p>}
              {isInviteLoading && <p className="page-subtitle">Загружаем коды приглашений...</p>}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
