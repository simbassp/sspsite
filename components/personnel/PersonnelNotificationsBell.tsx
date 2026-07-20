"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
  senderLabel?: string | null;
};

type PersonnelNotificationsBellProps = {
  compact?: boolean;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number;
};

function readPanelPosition(anchor: HTMLElement, compact: boolean): PanelPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 12;
  const width = compact
    ? Math.max(240, window.innerWidth - viewportPadding * 2)
    : Math.min(360, window.innerWidth - viewportPadding * 2);
  const left = compact
    ? viewportPadding
    : Math.min(Math.max(viewportPadding, rect.right - width), window.innerWidth - width - viewportPadding);
  const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
  return { top, left, width };
}

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
  const [portalReady, setPortalReady] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
      let payload: { ok?: boolean; error?: string; sent?: number } = {};
      try {
        payload = (await res.json()) as { ok?: boolean; error?: string; sent?: number };
      } catch {
        payload = {};
      }
      if (!res.ok || !payload.ok) {
        setSendState("error");
        setSendMessage(
          res.status === 504
            ? "Сервер не успел обработать запрос. Примените миграцию broadcast_app_notification и попробуйте снова."
            : payload.error || "Не удалось отправить.",
        );
        return;
      }
      setBroadcastTitle("");
      setBroadcastBody("");
      setBroadcastHref("");
      setComposeOpen(false);
      setSendState("done");
      setSendMessage(`Отправлено ${payload.sent ?? 0} пользователям.`);
      await load();
    } catch {
      setSendState("error");
      setSendMessage("Ошибка сети или таймаут.");
    }
  };

  useEffect(() => {
    setPortalReady(true);
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const updatePosition = () => {
      if (!ref.current) return;
      setPanelPosition(readPanelPosition(ref.current, compact));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const renderNotificationContent = (item: NotificationItem) => (
    <>
      {item.senderLabel ? <span className="personnel-notify-item__from">От: {item.senderLabel}</span> : null}
      <strong className="personnel-notify-item__title">{item.title}</strong>
      {item.body ? <span className="personnel-notify-item__body">{item.body}</span> : null}
    </>
  );

  const panel =
    open && panelPosition ? (
      <div
        ref={panelRef}
        className={`personnel-notify-panel${compact ? " personnel-notify-panel--portal" : ""}`}
        style={{
          position: "fixed",
          top: panelPosition.top,
          left: panelPosition.left,
          width: panelPosition.width,
          right: "auto",
        }}
      >
        <p className="personnel-notify-panel__title">Уведомления</p>

        {canSend ? (
          <div className="personnel-notify-compose personnel-notify-compose--top">
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
              </div>
            )}
            {sendMessage ? (
              <p className={`personnel-notify-compose__msg${sendState === "error" ? " is-error" : ""}`}>{sendMessage}</p>
            ) : null}
          </div>
        ) : null}

        <div className="personnel-notify-panel__list">
          {items.length === 0 ? (
            <p className="personnel-notify-panel__empty">Нет уведомлений</p>
          ) : (
            items.map((item) => {
              if (item.href) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`personnel-notify-item${item.isRead ? "" : " is-unread"}`}
                    onClick={() => setOpen(false)}
                  >
                    {renderNotificationContent(item)}
                  </Link>
                );
              }
              return (
                <div key={item.id} className={`personnel-notify-item${item.isRead ? "" : " is-unread"}`}>
                  {renderNotificationContent(item)}
                </div>
              );
            })
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className={`personnel-notify-wrap${compact ? " personnel-notify-wrap--compact" : ""}`} ref={ref}>
      <button
        type="button"
        className={`personnel-notify-btn${compact ? " mobile-header-icon-btn" : ""}`}
        aria-label="Уведомления"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) {
              if (ref.current) setPanelPosition(readPanelPosition(ref.current, compact));
              void load().then(() => markAllRead());
            } else {
              setPanelPosition(null);
            }
            return next;
          });
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? <span className="personnel-notify-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {portalReady && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
