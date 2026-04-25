"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { getPositions } from "@/lib/storage";
import { registerUser } from "@/lib/users-repository";

const REGISTER_REQUEST_TIMEOUT_MS = 45000;

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

export default function RegisterPage() {
  const router = useRouter();
  const positions = useMemo(() => getPositions(), []);
  const [form, setForm] = useState({
    email: "",
    inviteCode: "",
    login: "",
    name: "",
    callsign: "",
    password: "",
    repeatPassword: "",
    position: positions[0],
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setPasswordMismatch(false);
    if (form.password.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (form.password !== form.repeatPassword) {
      setPasswordMismatch(true);
      setError("В строках пароля есть ошибка: пароли не совпадают.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await withTimeout(
        registerUser({
          email: form.email.trim(),
          login: form.login.trim(),
          name: form.name.trim(),
          callsign: form.callsign.trim(),
          password: form.password,
          position: form.position,
          inviteCode: form.inviteCode,
        }),
        REGISTER_REQUEST_TIMEOUT_MS,
        "request_timeout",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "request_timeout") {
        setError("Сервер отвечает слишком долго. Проверьте интернет и попробуйте снова.");
      } else {
        setError("Ошибка сети: не удалось создать аккаунт. Проверьте интернет и попробуйте снова.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Регистрация сотрудника</h1>
          <p className="page-subtitle">Создание учетной записи сотрудника (роль: employee).</p>

          <form className="form" onSubmit={onSubmit}>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />

            <label className="label">Персональный код приглашения</label>
            <input
              className="input"
              value={form.inviteCode}
              onChange={(e) => setForm((p) => ({ ...p, inviteCode: e.target.value }))}
              required
            />

            <label className="label">Логин</label>
            <input
              className="input"
              value={form.login}
              onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
              required
            />

            <label className="label">Имя</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />

            <label className="label">Позывной</label>
            <input
              className="input"
              value={form.callsign}
              onChange={(e) => setForm((p) => ({ ...p, callsign: e.target.value }))}
              required
            />

            <label className="label">Пароль</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => {
                setForm((p) => ({ ...p, password: e.target.value }));
                if (passwordMismatch) setPasswordMismatch(false);
              }}
              required
            />

            <label className="label">Повторите пароль</label>
            <input
              type="password"
              className="input"
              value={form.repeatPassword}
              onChange={(e) => {
                setForm((p) => ({ ...p, repeatPassword: e.target.value }));
                if (passwordMismatch) setPasswordMismatch(false);
              }}
              required
            />
            {passwordMismatch && <p style={{ color: "#ff8d8d", fontSize: 13 }}>Пароль в этих двух строках должен совпадать.</p>}

            <label className="label">Должность</label>
            <select
              className="select"
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value as typeof p.position }))}
            >
              {positions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}

            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Создаем аккаунт..." : "Создать аккаунт"}
            </button>
          </form>

          <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
