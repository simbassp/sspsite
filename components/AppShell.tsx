"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  { href: "/counteraction", label: "Защита", icon: "🛡️" },
  { href: "/uav", label: "БПЛА", icon: "🚁" },
  { href: "/tests", label: "Тесты", icon: "🧪" },
  { href: "/profile", label: "Профиль", icon: "👤" },
];

const adminLinks = [
  { href: "/admin", label: "Админка" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/results", label: "Результаты" },
  { href: "/admin/news", label: "Новости" },
  { href: "/admin/counteraction", label: "Противодействие" },
  { href: "/admin/uav", label: "БПЛА" },
  { href: "/admin/tests", label: "Тесты" },
];

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const bottomLinks = mainLinks.slice(0, 5);

  const logout = async () => {
    try {
      await forceFailFinalAttempt(session.id);
    } finally {
      await logoutUser();
      window.location.assign("/login");
    }
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
          <button className="btn btn-danger" type="button" onClick={logout}>
            Выход
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

        {session.role === "admin" && (
          <div style={{ marginTop: 20 }}>
            <p className="label" style={{ marginBottom: 8 }}>
              Админ-раздел
            </p>
            {adminLinks.map((link) => {
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
        <header className="mobile-header">
          <div className="brand">
            <div className="brand-mark">ПВО</div>
            <div>
              <h1>ССП ПВО</h1>
              <p>
                {session.callsign} • {session.role === "admin" ? "Админ" : "Сотрудник"}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <button className="btn btn-danger" type="button" onClick={logout}>
              Выход
            </button>
          </div>
        </header>

        <div className="screen">{children}</div>
      </main>

      <nav className="bottom-nav">
        {bottomLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : ""}>
              <div>{link.icon}</div>
              <div>{link.label}</div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
