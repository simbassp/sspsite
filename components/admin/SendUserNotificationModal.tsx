"use client";

import { useEffect, useState } from "react";

type SendUserNotificationModalProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
  userLabel: string;
};

export function SendUserNotificationModal({ open, onClose, userId, userLabel }: SendUserNotificationModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setHref("");
    setMessage("");
    setError(false);
    setSaving(false);
  }, [open, userId]);

  const onSubmit = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setMessage("Укажите заголовок.");
      setError(true);
      return;
    }
    setSaving(true);
    setMessage("");
    setError(false);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: userId,
          title: nextTitle,
          body: body.trim(),
          href: href.trim() || null,
        }),
      });
      let payload: { ok?: boolean; error?: string } = {};
      try {
        payload = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        payload = {};
      }
      if (!res.ok || !payload.ok) {
        setMessage(
          res.status === 504
            ? "Сервер не успел обработать запрос. Попробуйте снова."
            : payload.error || "Не удалось отправить уведомление.",
        );
        setError(true);
        return;
      }
      onClose();
    } catch {
      setMessage("Ошибка сети или таймаут.");
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="personnel-modal-backdrop" onClick={onClose}>
      <article className="card personnel-modal profile-admin-notify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-body">
          <h3 style={{ marginTop: 0 }}>Уведомление пользователю</h3>
          <p className="page-subtitle" style={{ margin: "6px 0 12px" }}>
            Сообщение придёт в колокольчик у {userLabel}.
          </p>
          <div className="profile-admin-notify-form">
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок"
              maxLength={120}
            />
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Текст (необязательно)"
              rows={3}
              maxLength={500}
            />
            <input
              className="input"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="Ссылка (необязательно), например /news"
              maxLength={200}
            />
            <div className="profile-admin-notify-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSubmit()}>
                {saving ? "Отправка…" : "Отправить в колокольчик"}
              </button>
              <button type="button" className="btn" disabled={saving} onClick={onClose}>
                Отмена
              </button>
            </div>
            {message ? (
              <p className="page-subtitle" style={{ margin: "8px 0 0", color: error ? "var(--bad)" : "var(--muted)" }}>
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </div>
  );
}
