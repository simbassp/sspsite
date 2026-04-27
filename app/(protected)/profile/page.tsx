"use client";

import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createInviteCode,
  disableInviteCode,
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
  const session = useMemo(() => readClientSession(), []);
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
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
  const [onlineError, setOnlineError] = useState("");

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
        })) as TestResult[];
        setRows(mappedRows);
        if (typeof payload.email === "string" && payload.email) {
          setEmailInput(payload.email);
        } else {
          const emailResult = await fetchCurrentAuthEmail();
          if (!cancelled && emailResult.ok) setEmailInput(emailResult.email);
        }
        if (session.role === "admin") {
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
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (session.role !== "admin" && session.permissions.online !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/presence/online", { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; names?: unknown; error?: string };
        if (!response.ok || payload.ok !== true || !Array.isArray(payload.names)) {
          if (!cancelled) setOnlineError(payload.error || "online_load_failed");
          return;
        }
        if (!cancelled) {
          setOnlineError("");
          setOnlineNames(payload.names.map((x) => String(x)));
        }
      } catch {
        if (!cancelled) setOnlineError("online_load_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const stats = useMemo(() => {
    if (!session) return { average: 0, best: 0, total: 0 };
    const total = rows.length;
    const average = total ? Math.round(rows.reduce((acc, r) => acc + r.score, 0) / total) : 0;
    const best = total ? Math.max(...rows.map((r) => r.score)) : 0;
    return { average, best, total };
  }, [rows, session]);

  if (!session) {
    return <p className="page-subtitle">Профиль не найден.</p>;
  }

  const createRandomCode = () => {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInviteInput(`PVO-${new Date().getFullYear()}-${random}`);
  };

  const refreshInvites = async () => {
    if (session.role !== "admin") return;
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
    if (session.role !== "admin") return;
    setAdminMessage("");
    const maxUses = maxUsesInput.trim() ? Number(maxUsesInput.trim()) : null;
    const result = await createInviteCode({
      code: inviteInput.trim(),
      maxUses: Number.isFinite(maxUses) && maxUses !== null ? maxUses : null,
    });
    if (!result.ok) {
      setAdminMessage(result.error);
      return;
    }
    setAdminMessage("Код приглашения сохранен.");
    setInviteInput("");
    setMaxUsesInput("");
    await refreshInvites();
  };

  const onDisableInvite = async (code: string) => {
    if (session.role !== "admin") return;
    setAdminMessage("");
    await disableInviteCode(code);
    setAdminMessage(`Код ${code} отключен.`);
    await refreshInvites();
  };

  const onDeleteInvite = async (code: string) => {
    if (session.role !== "admin") return;
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
    const result = await updateCurrentUserProfile({
      name: profileNameInput,
      callsign: profileCallsignInput,
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
    setSettingsMessage("Профиль обновлен.");
  };

  return (
    <section>
      <h1 className="page-title">Профиль</h1>
      {isInitialLoading && <p className="page-subtitle">Загружаем профиль...</p>}
      {!!initialLoadError && <p className="page-subtitle">{initialLoadError}</p>}
      {(session.role === "admin" || session.permissions.online === true) && (
        <article className="card" style={{ marginBottom: 12 }}>
          <div className="card-body">
            <p className="label">Пользователи онлайн</p>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              {onlineNames.length > 0
                ? onlineNames.join(", ")
                : onlineError
                  ? "Не удалось загрузить онлайн-статус."
                  : "Сейчас никого нет онлайн"}
            </p>
          </div>
        </article>
      )}
      <article className="card">
        <div className="card-body">
          <h3>{profileNameInput || session.name}</h3>
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            {(profileCallsignInput || session.callsign) + " • " + session.position}
          </p>
          <div className="grid grid-two">
            <div className="card">
              <div className="card-body">
                <p className="label">Средний балл</p>
                <p className="stat-value">{stats.average}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Лучшая попытка</p>
                <p className="stat-value">{stats.best}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Всего попыток</p>
                <p className="stat-value">{stats.total}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">План на будущее</p>
                <p style={{ marginTop: 8 }}>Вход по Face ID / отпечатку / WebAuthn (подготовлено).</p>
              </div>
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
            <label className="label">Имя</label>
            <input
              className="input"
              value={profileNameInput}
              onChange={(e) => setProfileNameInput(e.target.value)}
              placeholder="Ваше имя"
            />
            <label className="label">Позывной</label>
            <input
              className="input"
              value={profileCallsignInput}
              onChange={(e) => setProfileCallsignInput(e.target.value)}
              placeholder="Ваш позывной"
            />
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

      {session.role === "admin" && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <h3>Коды приглашений для регистрации</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Создайте код, отправьте сотрудникам, потом отключите или удалите его.
            </p>

            <div className="form" style={{ marginTop: 10 }}>
              <label className="label">Код приглашения</label>
              <input
                className="input"
                placeholder="например: PVO-2026-ALPHA"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
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
                    <h3>{invite.code}</h3>
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
                      {invite.isActive && (
                        <button className="btn" type="button" onClick={() => void onDisableInvite(invite.code)}>
                          Отключить
                        </button>
                      )}
                      <button className="btn btn-danger" type="button" onClick={() => void onDeleteInvite(invite.code)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!inviteCodes.length && <p className="page-subtitle">Пока нет кодов приглашений.</p>}
              {isInviteLoading && <p className="page-subtitle">Загружаем коды приглашений...</p>}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
