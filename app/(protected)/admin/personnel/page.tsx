"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonnelPreviewBanner } from "@/components/personnel/PersonnelPreviewBanner";
import { personnelRequestTypeLabel } from "@/lib/personnel-catalog";

type PendingRow = {
  id: string;
  request_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  app_users?: { name?: string; callsign?: string };
};

export default function AdminPersonnelPage() {
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [msg, setMsg] = useState("");
  const [isPreview, setIsPreview] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/personnel", { cache: "no-store" });
    const data = (await res.json()) as {
      ok?: boolean;
      settings?: { moduleEnabled: boolean; moderationEnabled: boolean };
      pending?: PendingRow[];
    };
    if (res.ok && data.settings) {
      setModuleEnabled(data.settings.moduleEnabled);
      setModerationEnabled(data.settings.moderationEnabled);
      setIsPreview(!data.settings.moduleEnabled);
    }
    if (data.pending) setPending(data.pending);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setMsg("");
    const res = await fetch("/api/admin/personnel", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleEnabled, moderationEnabled }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setMsg(data.error || "Ошибка сохранения");
      return;
    }
    setMsg("Настройки сохранены.");
    void load();
  };

  const review = async (id: string, approve: boolean) => {
    await fetch(`/api/personnel/requests/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    void load();
  };

  return (
    <section className="screen personnel-page">
      <h1 className="page-title">Личное дело — 4 рота</h1>
      <p className="page-subtitle">Настройки модуля и модерация заявок</p>
      {isPreview && <PersonnelPreviewBanner />}

      <article className="card">
        <div className="card-body">
          <h3 style={{ marginTop: 0 }}>Включение модуля</h3>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input type="checkbox" checked={moduleEnabled} onChange={(e) => setModuleEnabled(e.target.checked)} />
            Показывать модуль сотрудникам 4 роты
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={moderationEnabled}
              onChange={(e) => setModerationEnabled(e.target.checked)}
            />
            Заявки через модерацию
          </label>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => void saveSettings()}>
            Сохранить
          </button>
          {msg && <p className="page-subtitle">{msg}</p>}
        </div>
      </article>

      <article className="card">
        <div className="card-body">
          <h3 style={{ marginTop: 0 }}>Заявки на модерации ({pending.length})</h3>
          {pending.length === 0 && <p className="page-subtitle">Нет заявок</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {pending.map((row) => {
              const who = row.app_users?.name
                ? `${row.app_users.name}${row.app_users.callsign ? ` (${row.app_users.callsign})` : ""}`
                : "Сотрудник";
              const type =
                personnelRequestTypeLabel[row.request_type as keyof typeof personnelRequestTypeLabel] ??
                row.request_type;
              return (
                <li key={row.id} className="card">
                  <div className="card-body">
                    <strong>{who}</strong> — {type}
                    <pre
                      style={{
                        margin: "8px 0",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                        color: "var(--muted)",
                      }}
                    >
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn btn-primary" onClick={() => void review(row.id, true)}>
                        Одобрить
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => void review(row.id, false)}>
                        Отклонить
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    </section>
  );
}
