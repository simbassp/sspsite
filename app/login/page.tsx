"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { SESSION_COOKIE } from "@/lib/seed";
import { loginUser, persistSession, requestPasswordReset } from "@/lib/users-repository";

const AUTH_REQUEST_TIMEOUT_MS = 18000;

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
    // If a stale session still exists when login page opens, mark presence as offline.
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
    if (isSubmitting) return;
    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      setInfo("Проверяем доступ к серверу...");
      const result = await withTimeout(loginUser(login.trim(), password), AUTH_REQUEST_TIMEOUT_MS, "request_timeout");
      if (!result.ok) {
        setInfo("");
        setError(result.error);
        return;
      }

      setInfo("");
      persistSession(result.session);
      router.push("/dashboard");
    } catch (error) {
      setInfo("");
      const message = error instanceof Error ? error.message : "";
      if (message === "request_timeout") {
        setError("Сервер отвечает слишком долго. Проверьте интернет и попробуйте снова.");
      } else {
        setError("Ошибка сети: не удалось связаться с сервером авторизации. Проверьте интернет и попробуйте снова.");
      }
    } finally {
      setIsSubmitting(false);
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
    if (isSendingReset) return;
    setError("");
    setInfo("");
    if (!login.trim()) {
      setError("Введите логин или email для отправки ссылки.");
      return;
    }
    setIsSendingReset(true);
    try {
      const result = await withTimeout(
        requestPasswordReset(login.trim()),
        AUTH_REQUEST_TIMEOUT_MS,
        "request_timeout",
      );
      setIsSendingReset(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("Ссылка на сброс отправлена на почту.");
    } catch (error) {
      setIsSendingReset(false);
      const message = error instanceof Error ? error.message : "";
      if (message === "request_timeout") {
        setError("Сервер отвечает слишком долго. Повторите попытку через несколько секунд.");
      } else {
        setError("Ошибка сети: не удалось отправить запрос на сброс. Проверьте интернет и попробуйте снова.");
      }
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Вход в ССП ПВО</h1>
          <p className="page-subtitle">
            Платформа полностью закрыта. Для входа используйте выданные учетные данные.
          </p>

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
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Входим..." : "Войти"}
              </button>
              <button className="btn" type="button" onClick={openRequestReset}>
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
              />
              {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}
              {info && <p className="page-subtitle">{info}</p>}
              <button className="btn btn-primary" type="submit" disabled={isSendingReset}>
                {isSendingReset ? "Отправляем..." : "Отправить ссылку сброса"}
              </button>
              <button className="btn" type="button" onClick={closeRequestReset}>
                Назад ко входу
              </button>
            </form>
          )}

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Нет аккаунта? <Link href="/register">Регистрация сотрудника</Link>
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
