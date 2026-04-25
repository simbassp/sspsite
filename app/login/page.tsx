"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginUser, persistSession, requestPasswordReset } from "@/lib/users-repository";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [requestResetMode, setRequestResetMode] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      const result = await loginUser(login.trim(), password);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      persistSession(result.session);
      router.push("/dashboard");
    } catch {
      setError("Ошибка сети: не удалось связаться с сервером авторизации. Проверьте интернет и попробуйте снова.");
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
      const result = await requestPasswordReset(login.trim());
      setIsSendingReset(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("Ссылка на сброс отправлена на почту.");
    } catch {
      setIsSendingReset(false);
      setError("Ошибка сети: не удалось отправить запрос на сброс. Проверьте интернет и попробуйте снова.");
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
              <button className="btn btn-primary" type="submit">
                Войти
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
        </div>
      </div>
    </div>
  );
}
