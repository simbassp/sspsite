"use client";

import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import { fetchUserResults } from "@/lib/tests-repository";
import {
  createInviteCode,
  disableInviteCode,
  fetchInviteCodes,
  InviteCodeRecord,
  removeInviteCode,
} from "@/lib/users-repository";
import { TestResult } from "@/lib/types";

export default function ProfilePage() {
  const session = useMemo(() => readClientSession(), []);
  const [rows, setRows] = useState<TestResult[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCodeRecord[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

  useEffect(() => {
    if (!session) return;
    fetchUserResults(session.id).then(setRows);
    if (session.role === "admin") {
      fetchInviteCodes().then(setInviteCodes);
    }
  }, [session]);

  const stats = useMemo(() => {
    if (!session) return { average: 0, best: 0, total: 0 };
    const total = rows.length;
    const average = total ? Math.round(rows.reduce((acc, r) => acc + r.score, 0) / total) : 0;
    const best = total ? Math.max(...rows.map((r) => r.score)) : 0;
    return { average, best, total };
  }, [rows, session]);

  if (!session) {
    return <p className="page-subtitle">Профиль не найден.</p>;
  }

  const createRandomCode = () => {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInviteInput(`PVO-${new Date().getFullYear()}-${random}`);
  };

  const refreshInvites = async () => {
    if (session.role !== "admin") return;
    const next = await fetchInviteCodes();
    setInviteCodes(next);
  };

  const onCreateInvite = async () => {
    if (session.role !== "admin") return;
    setAdminMessage("");
    const maxUses = maxUsesInput.trim() ? Number(maxUsesInput.trim()) : null;
    const result = await createInviteCode({
      code: inviteInput.trim(),
      maxUses: Number.isFinite(maxUses) && maxUses !== null ? maxUses : null,
    });
    if (!result.ok) {
      setAdminMessage(result.error);
      return;
    }
    setAdminMessage("Код приглашения сохранен.");
    setInviteInput("");
    setMaxUsesInput("");
    await refreshInvites();
  };

  const onDisableInvite = async (code: string) => {
    if (session.role !== "admin") return;
    setAdminMessage("");
    await disableInviteCode(code);
    setAdminMessage(`Код ${code} отключен.`);
    await refreshInvites();
  };

  const onDeleteInvite = async (code: string) => {
    if (session.role !== "admin") return;
    setAdminMessage("");
    await removeInviteCode(code);
    setAdminMessage(`Код ${code} удален.`);
    await refreshInvites();
  };

  return (
    <section>
      <h1 className="page-title">Профиль</h1>
      <article className="card">
        <div className="card-body">
          <h3>{session.name}</h3>
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            {session.callsign} • {session.position}
          </p>
          <div className="grid grid-two">
            <div className="card">
              <div className="card-body">
                <p className="label">Средний балл</p>
                <p className="stat-value">{stats.average}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Лучшая попытка</p>
                <p className="stat-value">{stats.best}%</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">Всего попыток</p>
                <p className="stat-value">{stats.total}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <p className="label">План на будущее</p>
                <p style={{ marginTop: 8 }}>Вход по Face ID / отпечатку / WebAuthn (подготовлено).</p>
              </div>
            </div>
          </div>
        </div>
      </article>

      {session.role === "admin" && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <h3>Коды приглашений для регистрации</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Создайте код, отправьте сотрудникам, потом отключите или удалите его.
            </p>

            <div className="form" style={{ marginTop: 10 }}>
              <label className="label">Код приглашения</label>
              <input
                className="input"
                placeholder="например: PVO-2026-ALPHA"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
              />
              <button className="btn" type="button" onClick={createRandomCode}>
                Сгенерировать код
              </button>

              <label className="label">Лимит регистраций (пусто = без лимита)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
              />

              <button className="btn btn-primary" type="button" onClick={() => void onCreateInvite()}>
                Сохранить код
              </button>
              {adminMessage && <p className="page-subtitle">{adminMessage}</p>}
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {inviteCodes.map((invite) => (
                <article className="card" key={invite.code}>
                  <div className="card-body">
                    <h3>{invite.code}</h3>
                    <div className="meta" style={{ marginTop: 8 }}>
                      <span className={`pill ${invite.isActive ? "pill-green" : "pill-red"}`}>
                        {invite.isActive ? "Активен" : "Отключен"}
                      </span>
                      <span>
                        Использовано: {invite.usedCount}
                        {invite.maxUses ? ` / ${invite.maxUses}` : ""}
                      </span>
                      <span>{formatDate(invite.createdAt)}</span>
                    </div>
                    <div className="form" style={{ marginTop: 10 }}>
                      {invite.isActive && (
                        <button className="btn" type="button" onClick={() => void onDisableInvite(invite.code)}>
                          Отключить
                        </button>
                      )}
                      <button className="btn btn-danger" type="button" onClick={() => void onDeleteInvite(invite.code)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!inviteCodes.length && <p className="page-subtitle">Пока нет кодов приглашений.</p>}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
