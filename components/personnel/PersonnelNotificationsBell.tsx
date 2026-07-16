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

export function PersonnelNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const [navRes, listRes] = await Promise.all([
        fetch("/api/personnel/nav", { cache: "no-store" }),
        fetch("/api/personnel/requests", { cache: "no-store" }),
      ]);
      const nav = (await navRes.json()) as { unreadNotifications?: number };
      if (navRes.ok) setUnread(nav.unreadNotifications ?? 0);
      const list = (await listRes.json()) as { ok?: boolean; items?: NotificationItem[] };
      if (listRes.ok && list.items) setItems(list.items);
    } catch {
      /* ignore */
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
    <div className="personnel-notify-wrap" ref={ref}>
      <button
        type="button"
        className="personnel-notify-btn"
        aria-label="Уведомления"
        onClick={() => {
          setOpen((v) => !v);
          void load();
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
          {items.length === 0 ? (
            <p style={{ padding: 12, margin: 0, color: "var(--muted)" }}>Нет уведомлений</p>
          ) : (
            items.map((item) => {
              const inner = (
                <>
                  <strong style={{ display: "block" }}>{item.title}</strong>
                  {item.body && <span style={{ fontSize: 13, color: "var(--muted)" }}>{item.body}</span>}
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
        </div>
      )}
    </div>
  );
}
