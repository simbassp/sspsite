"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginUser, persistSession } from "@/lib/users-repository";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Вход в ССП ПВО</h1>
          <p className="page-subtitle">
            Платформа полностью закрыта. Для входа используйте выданные учетные данные.
          </p>

          <form className="form" onSubmit={onSubmit}>
            <label className="label" htmlFor="login">
              Логин
            </label>
            <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />

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
            <button className="btn btn-primary" type="submit">
              Войти
            </button>
          </form>

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Нет аккаунта? <Link href="/register">Регистрация сотрудника</Link>
          </p>
          <p className="label" style={{ marginTop: 8 }}>
            Демо-админ: admin / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
