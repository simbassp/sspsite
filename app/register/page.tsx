"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { getPositions } from "@/lib/storage";
import { registerUser } from "@/lib/users-repository";

export default function RegisterPage() {
  const router = useRouter();
  const positions = useMemo(() => getPositions(), []);
  const [form, setForm] = useState({
    email: "",
    confirmEmail: "",
    login: "",
    name: "",
    callsign: "",
    password: "",
    position: positions[0],
  });
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
      setError("Email и подтверждение email не совпадают.");
      return;
    }

    const result = await registerUser({
      email: form.email.trim(),
      login: form.login.trim(),
      name: form.name.trim(),
      callsign: form.callsign.trim(),
      password: form.password,
      position: form.position,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/login");
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

            <label className="label">Подтверждение Email</label>
            <input
              type="email"
              className="input"
              value={form.confirmEmail}
              onChange={(e) => setForm((p) => ({ ...p, confirmEmail: e.target.value }))}
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
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />

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

            <button className="btn btn-primary" type="submit">
              Создать аккаунт
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
