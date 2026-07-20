"use client";

import { useState } from "react";

type SendUserNotificationCardProps = {
  userId: string;
  userLabel: string;
};

export function SendUserNotificationCard({ userId, userLabel }: SendUserNotificationCardProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

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
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setMessage(payload.error || "Не удалось отправить уведомление.");
        setError(true);
        return;
      }
      setTitle("");
      setBody("");
      setHref("");
      setMessage("Уведомление отправлено.");
      setError(false);
    } catch {
      setMessage("Ошибка сети.");
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card profile-admin-notify-card" style={{ marginTop: 12 }}>
      <div className="card-body">
        <h4 style={{ margin: 0 }}>Уведомление пользователю</h4>
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
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSubmit()}>
            {saving ? "Отправка…" : "Отправить в колокольчик"}
          </button>
          {message ? (
            <p className="page-subtitle" style={{ margin: "8px 0 0", color: error ? "var(--bad)" : "var(--muted)" }}>
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
