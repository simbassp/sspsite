"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { loginUser, persistSession, requestPasswordReset } from "@/lib/users-repository";

function readRecoveryMode() {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || search.get("type") === "recovery";
}

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(() => readRecoveryMode());
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [requestResetMode, setRequestResetMode] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (!recoveryMode) return;

    const supabase = getSupabaseBrowserClient();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);

    const setupRecovery = async () => {
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = search.get("code");
      const tokenHash = search.get("token_hash");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setError(error.message);
          return;
        }
        setRecoveryReady(true);
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        setRecoveryReady(true);
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (error) {
          setError(error.message);
          return;
        }
        setRecoveryReady(true);
      } else {
        setError("Некорректная ссылка сброса. Запросите новую.");
        return;
      }

      window.history.replaceState({}, "", "/login?type=recovery");
    };

    setupRecovery();
  }, [recoveryMode]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const result = await loginUser(login.trim(), password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    persistSession(result.session);
    router.push("/dashboard");
  };

  const openRequestReset = () => {
    setRequestResetMode(true);
    setError("");
    setInfo("");
  };

  const closeRequestReset = () => {
    setRequestResetMode(false);
    setError("");
    setInfo("");
  };

  const onRequestReset = async () => {
    setError("");
    setInfo("");
    if (!login.trim()) {
      setError("Введите логин или email для отправки ссылки.");
      return;
    }
    const result = await requestPasswordReset(login.trim());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo("Ссылка на сброс отправлена на почту.");
  };

  const onResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!isSupabaseConfigured) {
      setError("Сброс пароля доступен только через Supabase.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    if (!recoveryReady) {
      setError("Сессия сброса еще не готова. Откройте ссылку из письма заново.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/login");
    }
    setRecoveryMode(false);
    setRecoveryReady(false);
    setNewPassword("");
    setConfirmPassword("");
    setInfo("Пароль обновлен. Войдите с новым паролем.");
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">{recoveryMode ? "Сброс пароля" : "Вход в ССП ПВО"}</h1>
          <p className="page-subtitle">
            {recoveryMode
              ? "Введите новый пароль для продолжения работы."
              : "Платформа полностью закрыта. Для входа используйте выданные учетные данные."}
          </p>

          {!recoveryMode && !requestResetMode ? (
            <form className="form" onSubmit={onSubmit}>
              <label className="label" htmlFor="login">
                Логин или Email
              </label>
              <input
                id="login"
                className="input"
                placeholder="например: simba или user@mail.ru"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
              />

              <label className="label" htmlFor="password">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit">
                Войти
              </button>
              <button className="btn" type="button" onClick={openRequestReset}>
                Забыли пароль?
              </button>
            </form>
          ) : !recoveryMode && requestResetMode ? (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void onRequestReset();
              }}
            >
              <label className="label" htmlFor="reset-login">
                Логин или Email
              </label>
              <input
                id="reset-login"
                className="input"
                placeholder="например: simba или user@mail.ru"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
              />
              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit">
                Отправить ссылку сброса
              </button>
              <button className="btn" type="button" onClick={closeRequestReset}>
                Назад ко входу
              </button>
            </form>
          ) : (
            <form className="form" onSubmit={onResetPassword}>
              <label className="label" htmlFor="newPassword">
                Новый пароль
              </label>
              <input
                id="newPassword"
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />

              <label className="label" htmlFor="confirmPassword">
                Повторите пароль
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {!recoveryReady && <p className="page-subtitle">Проверяем ссылку сброса...</p>}
              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit">
                Обновить пароль
              </button>
            </form>
          )}

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Нет аккаунта? <Link href="/register">Регистрация сотрудника</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
