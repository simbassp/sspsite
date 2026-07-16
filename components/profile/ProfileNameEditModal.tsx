"use client";

type ProfileNameEditModalProps = {
  open: boolean;
  onClose: () => void;
  name: string;
  callsign: string;
  onNameChange: (value: string) => void;
  onCallsignChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  fieldError?: { name?: string; callsign?: string };
  message?: string;
};

export function ProfileNameEditModal({
  open,
  onClose,
  name,
  callsign,
  onNameChange,
  onCallsignChange,
  onSave,
  saving = false,
  fieldError,
  message,
}: ProfileNameEditModalProps) {
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
              onChange={(e) => onNameChange(e.target.value)}
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
              onChange={(e) => onCallsignChange(e.target.value)}
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
              <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
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
