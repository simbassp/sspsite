"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthPasswordInput } from "@/components/AuthPasswordInput";
import { UnitFieldLabel } from "@/components/profile/UnitFieldLabel";
import { getPositions } from "@/lib/storage";
import { positionDisplayLabel } from "@/lib/position-ui";
import { ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS, rotaPlatoonLabel, rotaSectionLabel } from "@/lib/personnel-catalog";
import { UNIT_ASSIGNMENT_OPTIONS, unitAssignmentLabel } from "@/lib/unit-assignment";
import type { UnitAssignment } from "@/lib/types";
import { normalizeRotaPlatoon, normalizeRotaSection, type RotaPlatoon, type RotaSection } from "@/lib/rota-unit";
import { registerUser } from "@/lib/users-repository";

/** Один signUp + при сбое сети — перепроверка входом; на мобильном цепочка дольше, чем 15–20 с. */
const REGISTER_REQUEST_TIMEOUT_MS = 90000;

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
    unitAssignment: "" as "" | UnitAssignment,
    rotaPlatoon: "" as "" | `${RotaPlatoon}`,
    rotaSection: "" as "" | `${RotaSection}`,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [fieldHints, setFieldHints] = useState<{ email?: string; login?: string }>({});
  const [availChecking, setAvailChecking] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [redirectSec, setRedirectSec] = useState(5);
  const successIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToLogin = () => {
    if (successIntervalRef.current) {
      clearInterval(successIntervalRef.current);
      successIntervalRef.current = null;
    }
    router.push("/login");
  };

  useEffect(() => {
    if (!successOpen) return;
    setRedirectSec(5);
    let n = 5;
    successIntervalRef.current = setInterval(() => {
      n -= 1;
      setRedirectSec(n);
      if (n <= 0) {
        if (successIntervalRef.current) clearInterval(successIntervalRef.current);
        successIntervalRef.current = null;
        router.push("/login");
      }
    }, 1000);
    return () => {
      if (successIntervalRef.current) {
        clearInterval(successIntervalRef.current);
        successIntervalRef.current = null;
      }
    };
  }, [successOpen, router]);

  useEffect(() => {
    const email = form.email.trim();
    const login = form.login.trim();
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      if (!email && !login) {
        setFieldHints({});
        setAvailChecking(false);
        return;
      }
      setAvailChecking(true);
      void (async () => {
        try {
          const res = await fetch("/api/register/availability", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, login }),
            signal: ac.signal,
            cache: "no-store",
          });
          const payload = (await res.json()) as {
            ok?: boolean;
            emailTaken?: boolean;
            loginTaken?: boolean;
          };
          if (!res.ok || !payload.ok) return;
          setFieldHints({
            email: payload.emailTaken ? "Этот email уже зарегистрирован." : undefined,
            login: payload.loginTaken ? "Этот логин уже занят." : undefined,
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        } finally {
          setAvailChecking(false);
        }
      })();
    }, 420);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [form.email, form.login]);

  const availabilityBlocksSubmit = Boolean(fieldHints.email || fieldHints.login);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || availabilityBlocksSubmit) return;
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
    if (!form.unitAssignment) {
      setError("Выберите подразделение.");
      return;
    }
    if (form.unitAssignment === "company_4" && (!form.rotaPlatoon || !form.rotaSection)) {
      setError("Для 4 роты укажите взвод и отделение.");
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
          unitAssignment: form.unitAssignment,
          rotaPlatoon: form.unitAssignment === "company_4" ? normalizeRotaPlatoon(form.rotaPlatoon) : null,
          rotaSection: form.unitAssignment === "company_4" ? normalizeRotaSection(form.rotaSection) : null,
        }),
        REGISTER_REQUEST_TIMEOUT_MS,
        "request_timeout",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "request_timeout") {
        setError(
          "Ожидание ответа заняло слишком много времени. Проверьте интернет. Если вы уже вводили данные — попробуйте войти: аккаунт мог создаться.",
        );
      } else {
        setError("Ошибка сети: не удалось создать аккаунт. Проверьте интернет и попробуйте снова.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-wrap">
      {successOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-success-title"
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
          <article className="card" style={{ width: "min(420px, 100%)", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
            <div className="card-body">
              <h3 id="register-success-title" style={{ marginTop: 0 }}>
                Аккаунт создан
              </h3>
              <p className="page-subtitle" style={{ marginBottom: 16 }}>
                Регистрация прошла успешно. Войдите на сайт, указав email и пароль, которые вы только что задали.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="btn btn-primary" type="button" onClick={goToLogin}>
                  Перейти ко входу
                </button>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, textAlign: "center" }}>
                  {redirectSec > 0 ? `Автоматический переход через ${redirectSec} с…` : "Переход…"}
                </p>
              </div>
            </div>
          </article>
        </div>
      )}

      <div className="card auth-card">
        <div className="card-body">
          <h1 className="page-title">Регистрация сотрудника</h1>
          <p className="page-subtitle">Создание учетной записи сотрудника.</p>

          <form className="form" onSubmit={onSubmit}>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="user@mail.ru"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            {fieldHints.email && <p style={{ color: "#ff8d8d", fontSize: 13, marginTop: 4 }}>{fieldHints.email}</p>}

            <label className="label">Персональный код приглашения</label>
            <input
              className="input"
              placeholder="Выдаёт администратор"
              value={form.inviteCode}
              onChange={(e) => setForm((p) => ({ ...p, inviteCode: e.target.value }))}
              required
            />

            <label className="label">Логин</label>
            <input
              className="input input-hint-danger"
              placeholder="Например: Simba (на английском)"
              value={form.login}
              onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
              required
            />
            {fieldHints.login && <p style={{ color: "#ff8d8d", fontSize: 13, marginTop: 4 }}>{fieldHints.login}</p>}
            {availChecking && (form.email.trim().length > 0 || form.login.trim().length > 0) && (
              <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>Проверяем логин и email…</p>
            )}

            <label className="label">Имя</label>
            <input
              className="input input-hint-danger"
              placeholder="Например: Иван (на русском)"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />

            <label className="label">Позывной</label>
            <input
              className="input input-hint-danger"
              placeholder="Например: Симба (на русском)"
              value={form.callsign}
              onChange={(e) => setForm((p) => ({ ...p, callsign: e.target.value }))}
              required
            />

            <AuthPasswordInput
              id="register-password"
              label="Пароль"
              placeholder="Внимательно заполняйте пароль"
              value={form.password}
              onChange={(v) => {
                setForm((p) => ({ ...p, password: v }));
                if (passwordMismatch) setPasswordMismatch(false);
              }}
              required
              disabled={isSubmitting}
              autoComplete="new-password"
            />

            <AuthPasswordInput
              id="register-password-repeat"
              label="Повторите пароль"
              value={form.repeatPassword}
              onChange={(v) => {
                setForm((p) => ({ ...p, repeatPassword: v }));
                if (passwordMismatch) setPasswordMismatch(false);
              }}
              required
              disabled={isSubmitting}
              autoComplete="new-password"
            />
            {passwordMismatch && <p style={{ color: "#ff8d8d", fontSize: 13 }}>Пароль в этих двух строках должен совпадать.</p>}

            <UnitFieldLabel kind="unit" />
            <select
              className="select"
              value={form.unitAssignment}
              onChange={(e) => {
                const unitAssignment = e.target.value as typeof form.unitAssignment;
                setForm((p) => ({
                  ...p,
                  unitAssignment,
                  rotaPlatoon: unitAssignment === "company_4" ? p.rotaPlatoon : "",
                  rotaSection: unitAssignment === "company_4" ? p.rotaSection : "",
                }));
              }}
              required
            >
              <option value="">—</option>
              {UNIT_ASSIGNMENT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unitAssignmentLabel[unit]}
                </option>
              ))}
            </select>

            {form.unitAssignment === "company_4" && (
              <>
                <UnitFieldLabel kind="platoon" />
                <select
                  className="select"
                  value={form.rotaPlatoon}
                  onChange={(e) => setForm((p) => ({ ...p, rotaPlatoon: e.target.value as typeof p.rotaPlatoon }))}
                  required
                >
                  <option value="">—</option>
                  {ROTA_PLATOON_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {rotaPlatoonLabel(value)}
                    </option>
                  ))}
                </select>

                <UnitFieldLabel kind="section" />
                <select
                  className="select"
                  value={form.rotaSection}
                  onChange={(e) => setForm((p) => ({ ...p, rotaSection: e.target.value as typeof p.rotaSection }))}
                  required
                >
                  <option value="">—</option>
                  {ROTA_SECTION_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {rotaSectionLabel(value)}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="label">Должность</label>
            <select
              className="select"
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value as typeof p.position }))}
            >
              {positions.map((item) => (
                <option key={item} value={item}>
                  {positionDisplayLabel(item)}
                </option>
              ))}
            </select>

            {error && <p style={{ color: "#ff8d8d", fontSize: 13 }}>{error}</p>}

            <button className="btn btn-primary" type="submit" disabled={isSubmitting || availabilityBlocksSubmit}>
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
