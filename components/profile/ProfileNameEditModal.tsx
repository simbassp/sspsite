"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarCropField } from "@/components/profile/AvatarCropField";

type AvatarPending = { blob: Blob | null; remove: boolean } | null;

type ProfileNameEditModalProps = {
  open: boolean;
  onClose: () => void;
  initialName: string;
  initialCallsign: string;
  initialAvatarUrl?: string | null;
  enableAvatarEditor?: boolean;
  onSave: (values: {
    name: string;
    callsign: string;
    avatarPending?: AvatarPending;
  }) => void | Promise<void>;
  saving?: boolean;
  fieldError?: { name?: string; callsign?: string };
  message?: string;
};

export function ProfileNameEditModal({
  open,
  onClose,
  initialName,
  initialCallsign,
  initialAvatarUrl = null,
  enableAvatarEditor = false,
  onSave,
  saving = false,
  fieldError,
  message,
}: ProfileNameEditModalProps) {
  const [name, setName] = useState(initialName);
  const [callsign, setCallsign] = useState(initialCallsign);
  const avatarPendingRef = useRef<AvatarPending>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCallsign(initialCallsign);
    avatarPendingRef.current = null;
  }, [open, initialName, initialCallsign, initialAvatarUrl]);

  const onPendingChange = useCallback((payload: AvatarPending) => {
    avatarPendingRef.current = payload;
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="personnel-modal-backdrop"
      onClick={onClose}
    >
      <article className="card personnel-modal profile-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-body">
          <h3 style={{ marginTop: 0 }}>Редактировать профиль</h3>
          <div className="form">
            {enableAvatarEditor ? (
              <AvatarCropField
                name={name}
                callsign={callsign}
                currentAvatarUrl={initialAvatarUrl}
                disabled={saving}
                onPendingChange={onPendingChange}
              />
            ) : null}

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
            {!!message && (
              <p className="page-subtitle" style={{ margin: 0, color: "var(--bad)" }}>
                {message}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void onSave({
                    name,
                    callsign,
                    avatarPending: enableAvatarEditor ? avatarPendingRef.current : undefined,
                  })
                }
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
