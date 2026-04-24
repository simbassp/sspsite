"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

function readRecoveryMode() {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return (
    hash.get("type") === "recovery" ||
    search.get("type") === "recovery" ||
    Boolean(search.get("code")) ||
    Boolean(search.get("token_hash"))
  );
}

export default function ResetPasswordPage() {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMode] = useState(() => readRecoveryMode());
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (!recoveryMode) {
      setError("Некорректная ссылка сброса. Запросите новую.");
      return;
    }

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

      window.history.replaceState({}, "", "/reset-password?type=recovery");
    };

    void setupRecovery();
  }, [recoveryMode]);

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
    setNewPassword("");
    setConfirmPassword("");
    setInfo("Пароль обновлен. Войдите с новым паролем.");
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.location.assign("/login");
      }, 500);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Сброс пароля</h1>
          <p className="page-subtitle">Введите новый пароль для продолжения работы.</p>

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

            {!recoveryReady && !error && <p className="page-subtitle">Проверяем ссылку сброса...</p>}
            {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
            {info && <p className="page-subtitle">{info}</p>}
            <button className="btn btn-primary" type="submit">
              Обновить пароль
            </button>
          </form>

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Вспомнили пароль? <Link href="/login">Вернуться ко входу</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
