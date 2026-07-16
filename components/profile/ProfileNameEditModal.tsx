"use client";

import { useEffect, useState } from "react";

type ProfileNameEditModalProps = {
  open: boolean;
  onClose: () => void;
  initialName: string;
  initialCallsign: string;
  onSave: (values: { name: string; callsign: string }) => void | Promise<void>;
  saving?: boolean;
  fieldError?: { name?: string; callsign?: string };
  message?: string;
};

export function ProfileNameEditModal({
  open,
  onClose,
  initialName,
  initialCallsign,
  onSave,
  saving = false,
  fieldError,
  message,
}: ProfileNameEditModalProps) {
  const [name, setName] = useState(initialName);
  const [callsign, setCallsign] = useState(initialCallsign);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCallsign(initialCallsign);
  }, [open, initialName, initialCallsign]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="personnel-modal-backdrop"
      onClick={onClose}
    >
      <article className="card personnel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-body">
          <h3 style={{ marginTop: 0 }}>Редактировать профиль</h3>
          <div className="form">
            <label className="label" htmlFor="profile-edit-name">
              Имя
            </label>
            <input
              id="profile-edit-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              disabled={saving}
            />
            {!!fieldError?.name && (
              <p className="page-subtitle" style={{ margin: 0, color: "var(--bad)" }}>
                {fieldError.name}
              </p>
            )}
            <label className="label" htmlFor="profile-edit-callsign">
              Позывной
            </label>
            <input
              id="profile-edit-callsign"
              className="input"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="Ваш позывной"
              disabled={saving}
            />
            {!!fieldError?.callsign && (
              <p className="page-subtitle" style={{ margin: 0, color: "var(--bad)" }}>
                {fieldError.callsign}
              </p>
            )}
            {!!message && <p className="page-subtitle" style={{ margin: 0 }}>{message}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onSave({ name, callsign })}
                disabled={saving}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              <button type="button" className="btn" onClick={onClose} disabled={saving}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
