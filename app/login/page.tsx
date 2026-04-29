"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { SESSION_COOKIE } from "@/lib/seed";
import { mapLoginErrorForDisplay } from "@/lib/login-ui";

async function loadUsersRepo() {
  return import("@/lib/users-repository");
}

/** Запас над одной попыткой loginViaServer (LOGIN_SERVER_TIMEOUT_MS ≈ 55s). */
const AUTH_REQUEST_TIMEOUT_MS = 62000;

const progressLines = (elapsedSec: number) => {
  if (elapsedSec < 3) return "Входим...";
  if (elapsedSec < 10) return "Подключаемся к серверу...";
  return "Соединение медленное, продолжаем попытку...";
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

const spinnerStyle: CSSProperties = {
  display: "inline-block",
  width: 14,
  height: 14,
  marginRight: 8,
  verticalAlign: "middle",
  border: "2px solid rgba(255,255,255,0.35)",
  borderTopColor: "currentColor",
  borderRadius: "50%",
  animation: "login-spin 0.7s linear infinite",
};

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestResetMode, setRequestResetMode] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const inFlightRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const clearProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startProgress = () => {
    clearProgressTimer();
    startedAtRef.current = Date.now();
    setInfo(progressLines(0));
    progressTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setInfo(progressLines(elapsed));
    }, 400);
  };

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

  useEffect(() => {
    if (!showDebug || typeof window === "undefined") return;
    const win = window as Window & { eruda?: { init: () => void } };
    if (win.eruda) {
      win.eruda.init();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.onload = () => {
      win.eruda?.init();
    };
    document.body.appendChild(script);
  }, [showDebug]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadUsersRepo(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const hasSessionCookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!hasSessionCookie) return;
    void fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ online: false }),
    }).catch(() => undefined);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || inFlightRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(mapLoginErrorForDisplay("", "network"));
      setInfo("");
      return;
    }

    inFlightRef.current = true;
    setIsSubmitting(true);
    setError("");
    setInfo("");
    startProgress();

    try {
      const { loginUser, persistSession } = await loadUsersRepo();
      const result = await withTimeout(loginUser(login.trim(), password), AUTH_REQUEST_TIMEOUT_MS, "request_timeout");
      if (!result.ok) {
        clearProgressTimer();
        setInfo("");
        if (result.error === "request_timeout") {
          setError(mapLoginErrorForDisplay("", "timeout"));
        } else {
          setError(mapLoginErrorForDisplay(result.error, "api"));
        }
        return;
      }

      setInfo("Загружаем профиль...");
      clearProgressTimer();
      persistSession(result.session);
      router.push("/dashboard");
    } catch (err) {
      clearProgressTimer();
      setInfo("");
      const message = err instanceof Error ? err.message : "";
      if (message === "request_timeout") {
        setError(mapLoginErrorForDisplay("", "timeout"));
      } else {
        const isNetwork =
          err instanceof TypeError ||
          (err instanceof Error &&
            (/fetch|network|failed to fetch|load failed|aborted/i.test(err.message) ||
              err.message === "NetworkError"));
        setError(mapLoginErrorForDisplay("", isNetwork ? "network" : "api"));
      }
    } finally {
      clearProgressTimer();
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
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
    if (isSendingReset || inFlightRef.current) return;
    setError("");
    setInfo("");
    if (!login.trim()) {
      setError("Введите логин или email для отправки ссылки.");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(mapLoginErrorForDisplay("", "network"));
      return;
    }
    setIsSendingReset(true);
    try {
      const { requestPasswordReset } = await loadUsersRepo();
      const result = await withTimeout(
        requestPasswordReset(login.trim()),
        AUTH_REQUEST_TIMEOUT_MS,
        "request_timeout",
      );
      if (!result.ok) {
        setError(mapLoginErrorForDisplay(result.error, "api"));
        return;
      }
      setInfo("Ссылка на сброс отправлена на почту.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "request_timeout") {
        setError(mapLoginErrorForDisplay("", "timeout"));
      } else {
        setError(mapLoginErrorForDisplay("", "network"));
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="auth-wrap">
      <style dangerouslySetInnerHTML={{ __html: `@keyframes login-spin { to { transform: rotate(360deg); } }` }} />
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Вход в ССП ПВО</h1>
          <p className="page-subtitle">
            Платформа полностью закрыта. Для входа используйте выданные учетные данные.
          </p>

          {!isOnline && (
            <p style={{ color: "#d4a63a", fontSize: 13, marginBottom: 8 }}>
              Нет подключения к интернету. Проверьте сеть и попробуйте снова.
            </p>
          )}

          {!requestResetMode ? (
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
                disabled={isSubmitting}
                autoComplete="username"
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
                disabled={isSubmitting}
                autoComplete="current-password"
              />

              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span style={spinnerStyle} aria-hidden />
                    Входим...
                  </>
                ) : (
                  "Войти"
                )}
              </button>
              <button className="btn" type="button" onClick={openRequestReset} disabled={isSubmitting}>
                Забыли пароль?
              </button>
            </form>
          ) : (
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
                disabled={isSendingReset}
              />
              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit" disabled={isSendingReset}>
                {isSendingReset ? "Отправляем..." : "Отправить ссылку сброса"}
              </button>
              <button className="btn" type="button" onClick={closeRequestReset} disabled={isSendingReset}>
                Назад ко входу
              </button>
            </form>
          )}

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Нет аккаунта?{" "}
            <Link href="/register" prefetch={false}>
              Регистрация сотрудника
            </Link>
          </p>
          {!showDebug && (
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              <button
                type="button"
                onClick={() => setShowDebug(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#888",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: 12,
                }}
              >
                Показать консоль (для отладки)
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
