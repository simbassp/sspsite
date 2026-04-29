"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  canAccessAdminPanel,
  canManageCounteraction,
  canManageNews,
  canManageResults,
  canResetTestResults,
  canManageTests,
  canManageUav,
  canManageUsers,
} from "@/lib/permissions";
import { forceFailFinalAttempt } from "@/lib/tests-repository";
import { logoutUser } from "@/lib/users-repository";
import { SessionUser } from "@/lib/types";

interface AppShellProps {
  session: SessionUser;
  children: React.ReactNode;
}

const mainLinks = [
  { href: "/dashboard", label: "Главная", icon: "home" },
  { href: "/news", label: "Новости", icon: "news" },
  { href: "/counteraction", label: "Противодействие", icon: "shield" },
  { href: "/uav", label: "БПЛА", icon: "uav" },
  { href: "/tests", label: "Тесты", icon: "clipboard" },
  { href: "/profile", label: "Профиль", icon: "user" },
];

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const bottomLinks = mainLinks;
  const canEditUsers = canManageUsers(session);
  const hasAdminAccess = canAccessAdminPanel(session);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    const sync = () => setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const HEARTBEAT_MS = 45_000;

    const postPresence = (online: boolean, keepalive?: boolean) => {
      if (isLoggingOutRef.current) return;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ online }),
        ...(keepalive ? { keepalive: true as const } : {}),
      }).catch(() => undefined);
    };

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stopHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
    };
    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeat = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          postPresence(true);
        }
      }, HEARTBEAT_MS);
    };

    const onHidden = () => {
      if (isLoggingOutRef.current) return;
      stopHeartbeat();
      postPresence(false, true);
    };
    const onVisible = () => {
      if (isLoggingOutRef.current) return;
      postPresence(true);
      startHeartbeat();
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };

    const onBlur = () => {
      if (isLoggingOutRef.current) return;
      stopHeartbeat();
      postPresence(false, true);
    };
    const onFocus = () => {
      if (isLoggingOutRef.current) return;
      postPresence(true);
      if (typeof document !== "undefined" && document.visibilityState === "visible") startHeartbeat();
    };

    postPresence(true);
    if (typeof document !== "undefined" && document.visibilityState === "visible") startHeartbeat();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHidden);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      stopHeartbeat();
      if (!isLoggingOutRef.current) {
        postPresence(false, true);
      }
    };
  }, []);
  const visibleAdminLinks = [
    ...(canEditUsers ? [{ href: "/admin/users", label: "Пользователи" }] : []),
    ...(canManageResults(session) || canResetTestResults(session)
      ? [{ href: "/admin/results", label: "Результаты" }]
      : []),
    ...(canManageTests(session) ? [{ href: "/admin/tests", label: "Тесты" }] : []),
    ...(canManageNews(session) ? [{ href: "/admin/news", label: "Новости" }] : []),
    ...(canManageCounteraction(session) ? [{ href: "/admin/counteraction", label: "Противодействие" }] : []),
    ...(canManageUav(session) ? [{ href: "/admin/uav", label: "БПЛА" }] : []),
  ];

  const withTimeout = (promise: Promise<unknown>, timeoutMs: number) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);

  const iconStyle = {
    width: 22,
    height: 22,
    stroke: "currentColor",
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const renderBottomIcon = (name: string) => {
    switch (name) {
      case "home":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
            <path d="M10 20v-5h4v5" />
          </svg>
        );
      case "news":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <rect x="3" y="4" width="14" height="16" rx="2" />
            <path d="M17 7h4v11a2 2 0 0 1-2 2" />
            <line x1="6" y1="9" x2="14" y2="9" />
            <line x1="6" y1="13" x2="14" y2="13" />
            <line x1="6" y1="17" x2="11" y2="17" />
          </svg>
        );
      case "shield":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6l8-3z" />
            <path d="M9 12.5l2 2 4-4" />
          </svg>
        );
      case "uav":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <rect x="9" y="9" width="6" height="6" rx="2" />
            <path d="M12 9V5M12 19v-4M9 12H5M19 12h-4" />
            <circle cx="5" cy="5" r="2.2" />
            <circle cx="19" cy="5" r="2.2" />
            <circle cx="5" cy="19" r="2.2" />
            <circle cx="19" cy="19" r="2.2" />
            <path d="M7 7l2.2 2.2M17 7l-2.2 2.2M7 17l2.2-2.2M17 17l-2.2-2.2" />
          </svg>
        );
      case "clipboard":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
            <path d="M8 10h8M8 14h8M8 18h5" />
          </svg>
        );
      case "user":
      default:
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.8-3.8 4.5-5.5 8-5.5S18.2 16.2 20 20" />
          </svg>
        );
    }
  };

  const logout = async () => {
    if (isLoggingOut) return;
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    void withTimeout(forceFailFinalAttempt(session.id), 1200).catch(() => {});
    try {
      await withTimeout(logoutUser(), 1200);
    } catch {}
    window.location.assign("/login");
  };

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand">
          <div className="brand-mark">ПВО</div>
          <div>
            <h1>ССП ПВО</h1>
            <p>Закрытый контур</p>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <ThemeToggle />
          <button className="btn btn-danger" type="button" onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? "Выходим..." : "Выход"}
          </button>
        </div>

        <div style={{ marginTop: 20 }}>
          {mainLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link className={`desktop-nav-link ${active ? "active" : ""}`} key={link.href} href={link.href}>
                {link.label}
              </Link>
            );
          })}
        </div>

        {hasAdminAccess && (
          <div style={{ marginTop: 20 }}>
            <p className="label" style={{ marginBottom: 8 }}>
              Раздел управления
            </p>
            {visibleAdminLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link className={`desktop-nav-link ${active ? "active" : ""}`} key={link.href} href={link.href}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      <main>
        <header className="mobile-header" id="mobile-app-header">
          <div className="brand">
            <Link href="/dashboard" style={{ display: "contents" }}>
              <div className="brand-mark">ПВО</div>
            </Link>
            <div>
              <h1>ССП ПВО</h1>
              <p>{session.callsign}</p>
            </div>
          </div>
          <div className="header-actions">
            {hasAdminAccess && (
              <Link className="btn" href="/admin">
                Управление
              </Link>
            )}
            <ThemeToggle />
            <button className="btn btn-danger" type="button" onClick={logout} disabled={isLoggingOut}>
              {isLoggingOut ? "Выход..." : "Выход"}
            </button>
          </div>
        </header>

        {!isOnline && (
          <div className="offline-banner" role="status">
            Нет соединения с сетью. Данные не обновятся, навигация может открывать сохранённую копию страницы. Проверьте
            Wi‑Fi или мобильный интернет и обновите вкладку.
          </div>
        )}

        <div className="screen">{children}</div>
      </main>

      <nav className="bottom-nav">
        {bottomLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : ""} aria-label={link.label}>
              <span className="bottom-nav-icon" aria-hidden="true">
                {renderBottomIcon(link.icon)}
              </span>
              <span className="bottom-nav-label">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
