"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

type PersonnelNotificationsBellProps = {
  compact?: boolean;
};

export function PersonnelNotificationsBell({ compact = false }: PersonnelNotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [canSend, setCanSend] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastHref, setBroadcastHref] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const [navRes, listRes] = await Promise.all([
        fetch("/api/notifications/nav", { cache: "no-store" }),
        fetch("/api/notifications", { cache: "no-store" }),
      ]);
      const nav = (await navRes.json()) as { unreadNotifications?: number; canSendNotifications?: boolean };
      if (navRes.ok) {
        setUnread(nav.unreadNotifications ?? 0);
        setCanSend(nav.canSendNotifications === true);
      }
      const list = (await listRes.json()) as { ok?: boolean; items?: NotificationItem[] };
      if (listRes.ok && list.items) setItems(list.items);
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnread(0);
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch {
      /* ignore */
    }
  };

  const sendBroadcast = async () => {
    const title = broadcastTitle.trim();
    const text = broadcastBody.trim();
    if (!title) {
      setSendState("error");
      setSendMessage("Укажите заголовок.");
      return;
    }
    setSendState("sending");
    setSendMessage("");
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "all",
          title,
          body: text,
          href: broadcastHref.trim() || null,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; sent?: number };
      if (!res.ok || !payload.ok) {
        setSendState("error");
        setSendMessage(payload.error || "Не удалось отправить.");
        return;
      }
      setSendState("done");
      setSendMessage(`Отправлено ${payload.sent ?? 0} пользователям.`);
      setBroadcastTitle("");
      setBroadcastBody("");
      setBroadcastHref("");
      setComposeOpen(false);
    } catch {
      setSendState("error");
      setSendMessage("Ошибка сети.");
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`personnel-notify-wrap${compact ? " personnel-notify-wrap--compact" : ""}`} ref={ref}>
      <button
        type="button"
        className={`personnel-notify-btn${compact ? " mobile-header-icon-btn" : ""}`}
        aria-label="Уведомления"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              void load().then(() => markAllRead());
            }
            return next;
          });
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="personnel-notify-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="personnel-notify-panel">
          <p className="personnel-notify-panel__title">Уведомления</p>
          {items.length === 0 ? (
            <p className="personnel-notify-panel__empty">Нет уведомлений</p>
          ) : (
            items.map((item) => {
              const inner = (
                <>
                  <strong className="personnel-notify-item__title">{item.title}</strong>
                  {item.body ? <span className="personnel-notify-item__body">{item.body}</span> : null}
                </>
              );
              if (item.href) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`personnel-notify-item${item.isRead ? "" : " is-unread"}`}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <div key={item.id} className={`personnel-notify-item${item.isRead ? "" : " is-unread"}`}>
                  {inner}
                </div>
              );
            })
          )}

          {canSend ? (
            <div className="personnel-notify-compose">
              {!composeOpen ? (
                <button type="button" className="btn btn-primary personnel-notify-compose__toggle" onClick={() => setComposeOpen(true)}>
                  Отправить сообщение всем
                </button>
              ) : (
                <div className="personnel-notify-compose__form">
                  <p className="personnel-notify-compose__label">Сообщение всем пользователям</p>
                  <input
                    className="input"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Заголовок"
                    maxLength={120}
                  />
                  <textarea
                    className="input"
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    placeholder="Текст (необязательно)"
                    rows={3}
                    maxLength={500}
                  />
                  <input
                    className="input"
                    value={broadcastHref}
                    onChange={(e) => setBroadcastHref(e.target.value)}
                    placeholder="Ссылка (необязательно), например /news"
                    maxLength={200}
                  />
                  <div className="personnel-notify-compose__actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={sendState === "sending"}
                      onClick={() => void sendBroadcast()}
                    >
                      {sendState === "sending" ? "Отправка…" : "Отправить всем"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={sendState === "sending"}
                      onClick={() => {
                        setComposeOpen(false);
                        setSendState("idle");
                        setSendMessage("");
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                  {sendMessage ? (
                    <p className={`personnel-notify-compose__msg${sendState === "error" ? " is-error" : ""}`}>{sendMessage}</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
