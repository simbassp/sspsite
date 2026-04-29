"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
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
  const [showAllAttempts, setShowAllAttempts] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [fieldError, setFieldError] = useState<{ name?: string; callsign?: string }>({});
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
    const total = rows.length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const successRate = total ? Math.round((passed / total) * 100) : 0;
    const lastAttempt = rows[0] ?? null;
    return { total, passed, successRate, averageTimeSec: null, lastAttempt };
  }, [rows, session]);

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

  const visibleAttempts = showAllAttempts ? rows : rows.slice(0, 5);
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
                <span style={iconBubble("rgba(196, 43, 43, 0.10)")}>👤</span>
                {profileNameInput || session.name}
              </p>
            </div>
            <div>
              <p className="label">Роль</p>
              <p style={{ fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center" }}>
                <span style={iconBubble("rgba(59, 130, 246, 0.12)")}>🛡️</span>
                {session.role === "admin" ? "Администратор" : session.position || "Специалист"}
              </p>
            </div>
            <div>
              <p className="label">Статус</p>
              <p style={{ fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
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
                      <span style={iconBubble("rgba(59, 130, 246, 0.12)")}>📋</span>
                      {stats.total}
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body">
                    <p className="label">Успешных попыток</p>
                    <p className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={iconBubble("rgba(35, 147, 92, 0.14)")}>✅</span>
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
                      <span style={iconBubble("rgba(234, 179, 8, 0.14)")}>⏱️</span>
                      {stats.averageTimeSec !== null ? `${stats.averageTimeSec} сек` : "—"}
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body">
                    <p className="label">Последний тест</p>
                    <p style={{ marginTop: 10, fontWeight: 700, display: "flex", alignItems: "center" }}>
                      <span style={iconBubble("rgba(168, 85, 247, 0.14)")}>📅</span>
                      {stats.lastAttempt ? formatDate(stats.lastAttempt.createdAt) : "—"}
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
                  const finalAttempt = item.type === "final" ? item.finalAttemptIndex : null;
                  const attemptText = finalAttempt ? `${finalAttempt} из 3` : item.type === "trial" ? "—" : "—";
                  const dateText = formatDate(item.createdAt);
                  return (
                    <article className="card" key={item.id}>
                      <div className="card-body">
                        <div className="grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
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
                            <p className="label">Попытка</p>
                            <p style={{ marginTop: 6, fontWeight: 700 }}>{attemptText}</p>
                          </div>
                          <div>
                            <p className="label">Дата и время</p>
                            <p style={{ marginTop: 6, fontWeight: 700 }}>{dateText}</p>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {rows.length > 5 && (
                <button className="btn" style={{ marginTop: 10 }} type="button" onClick={() => setShowAllAttempts((v) => !v)}>
                  {showAllAttempts ? "Скрыть" : "Показать все"}
                </button>
              )}
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
