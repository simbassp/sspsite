"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  confirmRecoverySessionViaApi,
  getResetPasswordSupabaseClient,
} from "@/lib/reset-password-client";
import {
  hasRecoveryUrlParams,
  mapRecoveryLinkError,
  readRecoveryErrorFromQuery,
  readRecoveryUrlParams,
  type RecoveryUrlParams,
} from "@/lib/reset-password-client-errors";

type RecoveryStatus = "checking" | "ready" | "error";

export default function ResetPasswordPage() {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("checking");

  useEffect(() => {
    if (!isSupabaseConfigured || typeof window === "undefined") {
      setRecoveryStatus("error");
      setError("Сброс пароля доступен только через Supabase.");
      return;
    }

    let cancelled = false;
    const presetError = readRecoveryErrorFromQuery();
    if (presetError) {
      setRecoveryStatus("error");
      setError(mapRecoveryLinkError(presetError));
      return;
    }

    const params: RecoveryUrlParams = readRecoveryUrlParams();

    if (!hasRecoveryUrlParams(params)) {
      setRecoveryStatus("error");
      setError("Некорректная ссылка сброса. Запросите новую.");
      return;
    }

    const supabase = getResetPasswordSupabaseClient();

    const finish = () => {
      if (cancelled) return;
      setRecoveryStatus("ready");
      setError("");
      window.history.replaceState({}, "", "/reset-password?type=recovery");
    };

    const fail = (message: string) => {
      if (cancelled) return;
      setRecoveryStatus("error");
      setError(mapRecoveryLinkError(message));
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        finish();
      }
    });

    const setupRecovery = async () => {
      await supabase.auth.signOut().catch(() => undefined);

      try {
        await confirmRecoverySessionViaApi(params);
        finish();
        return;
      } catch (apiError) {
        const message = apiError instanceof Error ? apiError.message : "";
        const { accessToken, refreshToken, code, tokenHash } = params;

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!sessionError) {
            finish();
            return;
          }
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) {
            finish();
            return;
          }
        }

        if (tokenHash) {
          const verify = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (!verify.error) {
            finish();
            return;
          }
        }

        fail(message || "Некорректная ссылка сброса. Запросите новую.");
      }
    };

    void setupRecovery();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

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
    if (recoveryStatus !== "ready") {
      setError("Сессия сброса еще не готова. Откройте ссылку из письма заново.");
      return;
    }

    const supabase = getResetPasswordSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(mapRecoveryLinkError(updateError.message));
      return;
    }

    await supabase.auth.signOut();
    setNewPassword("");
    setConfirmPassword("");
    setInfo("Пароль обновлен. Войдите с новым паролем.");
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 500);
  };

  const recoveryReady = recoveryStatus === "ready";

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
              disabled={!recoveryReady}
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
              disabled={!recoveryReady}
            />

            {recoveryStatus === "checking" && !error && (
              <p className="page-subtitle">Проверяем ссылку сброса...</p>
            )}
            {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
            {info && <p className="page-subtitle">{info}</p>}
            <button className="btn btn-primary" type="submit" disabled={!recoveryReady}>
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
