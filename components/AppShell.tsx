"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  canAccessAdminPanel,
  canManageCounteraction,
  canManageNews,
  canManageResults,
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
  { href: "/dashboard", label: "Главная", icon: "🏠" },
  { href: "/news", label: "Новости", icon: "📰" },
  { href: "/counteraction", label: "Противодействие", icon: "🛡️" },
  { href: "/uav", label: "БПЛА", icon: "🚁" },
  { href: "/tests", label: "Тесты", icon: "🧪" },
  { href: "/profile", label: "Профиль", icon: "👤" },
];

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const bottomLinks = mainLinks;
  const canEditUsers = canManageUsers(session);
  const hasAdminAccess = canAccessAdminPanel(session);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

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
    void fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ online: true }),
    }).catch(() => undefined);
  }, []);
  const visibleAdminLinks = [
    ...(canEditUsers ? [{ href: "/admin/users", label: "Пользователи" }] : []),
    ...(canManageResults(session) ? [{ href: "/admin/results", label: "Результаты" }] : []),
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

  const logout = async () => {
    if (isLoggingOut) return;
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
                {link.icon}
              </span>
              <span className="bottom-nav-label">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
