"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  canViewUserList,
} from "@/lib/permissions";
import { PersonnelNotificationsBell } from "@/components/personnel/PersonnelNotificationsBell";
import { AchievementUnlockBanner } from "@/components/achievements/AchievementUnlockBanner";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import { canAccessGameSection } from "@/lib/game-feature";
import { HomeStatsBar } from "@/components/HomeStatsBar";
import {
  PRESENCE_ANALYTICS_FLUSH_MS,
  PRESENCE_HIDDEN_OFFLINE_DELAY_MS,
} from "@/lib/presence-constants";
import { SessionUser } from "@/lib/types";
import { readClientSession, writeClientSession } from "@/lib/client-auth";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import {
  IDENTITY_COSMETICS_UPDATED_EVENT,
  type UserIdentityCosmetics,
} from "@/lib/user-identity-cosmetics";

const mobileHeaderIconSvg = {
  viewBox: "0 0 24 24" as const,
  width: 22,
  height: 22,
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function AdminPanelIcon() {
  return (
    <svg {...mobileHeaderIconSvg} aria-hidden>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg {...mobileHeaderIconSvg} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

interface AppShellProps {
  session: SessionUser;
  children: React.ReactNode;
}

type NavIconId =
  | "home"
  | "news"
  | "shield"
  | "uav"
  | "clipboard"
  | "user"
  | "users"
  | "chart"
  | "personnel"
  | "game";

const mainLinks: { href: string; label: string; icon: NavIconId }[] = [
  { href: "/dashboard", label: "Главная", icon: "home" },
  { href: "/news", label: "Новости", icon: "news" },
  { href: "/counteraction", label: "Противодействие", icon: "shield" },
  { href: "/uav", label: "БПЛА", icon: "uav" },
  { href: "/tests", label: "Тесты", icon: "clipboard" },
  { href: "/profile", label: "Профиль", icon: "user" },
];

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const canSeeUserDirectory = canManageUsers(session) || canViewUserList(session);
  const hasAdminAccess = canAccessAdminPanel(session);
  const canSeeGameSection = canAccessGameSection(session);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showPersonnelNav, setShowPersonnelNav] = useState(false);
  const [achievementNotifications, setAchievementNotifications] = useState<
    Array<{ id: string; title: string; body: string }>
  >([]);
  const [headerCosmetics, setHeaderCosmetics] = useState<UserIdentityCosmetics>({
    adminNameColor: session.nameColor ?? null,
    achievementNameColor: session.cosmetics?.achievementNameColor ?? null,
  });
  const isLoggingOutRef = useRef(false);
  const sessionCountedRef = useRef(false);
  const lastAnalyticsPingRef = useRef(Date.now());
  const [notifyBellPlacement, setNotifyBellPlacement] = useState<"both" | "desktop" | "mobile">("both");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 819px)");
    const sync = () => setNotifyBellPlacement(media.matches ? "mobile" : "desktop");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    void fetch("/api/personnel/nav", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { showPersonnel?: boolean } | null) => setShowPersonnelNav(p?.showPersonnel === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAchievements = () => {
      void fetch("/api/profile/achievements?notificationsOnly=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((payload: { ok?: boolean; pendingNotifications?: Array<{ id: string; title: string; body: string }> }) => {
          if (!payload.ok || cancelled) return;
          setAchievementNotifications(Array.isArray(payload.pendingNotifications) ? payload.pendingNotifications : []);
        })
        .catch(() => undefined);
    };
    loadAchievements();
    const timer = setInterval(loadAchievements, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session.id]);

  useEffect(() => {
    setHeaderCosmetics((prev) => ({
      ...prev,
      achievementNameColor: session.cosmetics?.achievementNameColor ?? prev.achievementNameColor ?? null,
    }));
  }, [session.cosmetics?.achievementNameColor]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile/identity", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (payload: {
          ok?: boolean;
          nameColor?: ProfileNameColorId | null;
          cosmetics?: Partial<UserIdentityCosmetics>;
        }) => {
          if (!payload.ok || cancelled) return;
          const adminNameColor = payload.nameColor ?? payload.cosmetics?.adminNameColor ?? null;
          setHeaderCosmetics((prev) => ({
            ...prev,
            adminNameColor,
            achievementNameColor:
              payload.cosmetics?.achievementNameColor ?? prev.achievementNameColor ?? null,
            avatarFrame: payload.cosmetics?.avatarFrame ?? prev.avatarFrame ?? null,
            bankOverlay: payload.cosmetics?.bankOverlay ?? prev.bankOverlay ?? null,
          }));
          const current = readClientSession();
          if (current && current.nameColor !== adminNameColor) {
            writeClientSession({ ...current, nameColor: adminNameColor });
          }
        },
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile/achievements", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload: {
        ok?: boolean;
        cosmetics?: {
          nameColor?: UserIdentityCosmetics["achievementNameColor"];
          avatarFrame?: UserIdentityCosmetics["avatarFrame"];
          bankOverlay?: UserIdentityCosmetics["bankOverlay"];
        };
      }) => {
        if (!payload.ok || cancelled) return;
        setHeaderCosmetics((prev) => ({
          ...prev,
          achievementNameColor: payload.cosmetics?.nameColor ?? null,
          avatarFrame: payload.cosmetics?.avatarFrame ?? prev.avatarFrame ?? null,
          bankOverlay: payload.cosmetics?.bankOverlay ?? prev.bankOverlay ?? null,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  useEffect(() => {
    const onCosmeticsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<UserIdentityCosmetics>>).detail;
      if (!detail) return;
      setHeaderCosmetics((prev) => ({ ...prev, ...detail }));
      if (detail.adminNameColor !== undefined) {
        const current = readClientSession();
        if (current && current.nameColor !== detail.adminNameColor) {
          writeClientSession({ ...current, nameColor: detail.adminNameColor });
        }
      }
    };
    window.addEventListener(IDENTITY_COSMETICS_UPDATED_EVENT, onCosmeticsUpdated);
    return () => window.removeEventListener(IDENTITY_COSMETICS_UPDATED_EVENT, onCosmeticsUpdated);
  }, []);

  const brandCallsign = (
    <p className="brand__callsign">
      <UserIdentityDisplay callsign={session.callsign} cosmetics={headerCosmetics} emptyName="—" />
    </p>
  );

  const navLinks = showPersonnelNav
    ? (() => {
        const idx = mainLinks.findIndex((l) => l.href === "/profile");
        return [
          ...mainLinks.slice(0, idx),
          { href: "/personnel", label: "Сотрудники", icon: "personnel" as const },
          ...mainLinks.slice(idx),
        ];
      })()
    : mainLinks;
  const bottomLinks = navLinks;

  const bottomNavTrackRef = useRef<HTMLDivElement>(null);
  const [bottomNavSlider, setBottomNavSlider] = useState({ width: 0, x: 0 });

  const syncBottomNavSlider = useCallback(() => {
    const track = bottomNavTrackRef.current;
    if (!track) return;
    const active = track.querySelector<HTMLElement>("a.active");
    if (!active) {
      setBottomNavSlider({ width: 0, x: 0 });
      return;
    }
    setBottomNavSlider({ width: active.offsetWidth, x: active.offsetLeft });
    active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      syncBottomNavSlider();
    });
    const track = bottomNavTrackRef.current;
    if (!track) return () => cancelAnimationFrame(frame);
    const onScroll = () => {
      const active = track.querySelector<HTMLElement>("a.active");
      if (!active) return;
      setBottomNavSlider({ width: active.offsetWidth, x: active.offsetLeft });
    };
    window.addEventListener("resize", syncBottomNavSlider);
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncBottomNavSlider);
      track.removeEventListener("scroll", onScroll);
    };
  }, [pathname, showPersonnelNav, syncBottomNavSlider]);

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
    const postPresence = (online: boolean, keepalive?: boolean) => {
      if (isLoggingOutRef.current) return;
      const now = Date.now();
      let newSession = false;
      let elapsedSeconds = 0;
      if (online) {
        if (!sessionCountedRef.current) {
          newSession = true;
          sessionCountedRef.current = true;
          lastAnalyticsPingRef.current = now;
        } else {
          const sinceLast = now - lastAnalyticsPingRef.current;
          if (sinceLast >= PRESENCE_ANALYTICS_FLUSH_MS) {
            elapsedSeconds = Math.round(sinceLast / 1000);
            lastAnalyticsPingRef.current = now;
          }
        }
      } else if (sessionCountedRef.current) {
        elapsedSeconds = Math.round((now - lastAnalyticsPingRef.current) / 1000);
        lastAnalyticsPingRef.current = now;
      }
      elapsedSeconds = Math.min(Math.max(0, elapsedSeconds), 600);
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          online,
          newSession,
          elapsedSeconds: newSession || elapsedSeconds > 0 ? elapsedSeconds : 0,
        }),
        ...(keepalive ? { keepalive: true as const } : {}),
      }).catch(() => undefined);
    };

    let hiddenOfflineTimer: ReturnType<typeof setTimeout> | undefined;

    const clearHiddenOfflineTimer = () => {
      if (hiddenOfflineTimer) {
        clearTimeout(hiddenOfflineTimer);
        hiddenOfflineTimer = undefined;
      }
    };

    const onHidden = () => {
      if (isLoggingOutRef.current) return;
      clearHiddenOfflineTimer();
      hiddenOfflineTimer = setTimeout(() => {
        hiddenOfflineTimer = undefined;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          postPresence(false, true);
        }
      }, PRESENCE_HIDDEN_OFFLINE_DELAY_MS);
    };

    const onVisible = () => {
      if (isLoggingOutRef.current) return;
      clearHiddenOfflineTimer();
      postPresence(true);
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };

    const onPageHide = () => {
      if (isLoggingOutRef.current) return;
      clearHiddenOfflineTimer();
      postPresence(false, true);
    };

    postPresence(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearHiddenOfflineTimer();
      if (!isLoggingOutRef.current) {
        postPresence(false, true);
      }
    };
  }, []);

  useEffect(() => {
    if (pathname === "/dashboard") {
      if (isLoggingOutRef.current) return;
      const now = Date.now();
      let elapsedSeconds = 0;
      if (sessionCountedRef.current) {
        const sinceLast = now - lastAnalyticsPingRef.current;
        if (sinceLast >= PRESENCE_ANALYTICS_FLUSH_MS) {
          elapsedSeconds = Math.round(sinceLast / 1000);
          lastAnalyticsPingRef.current = now;
        }
      }
      elapsedSeconds = Math.min(Math.max(0, elapsedSeconds), 600);
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          online: true,
          newSession: false,
          elapsedSeconds: elapsedSeconds > 0 ? elapsedSeconds : 0,
        }),
      }).catch(() => undefined);
    }
  }, [pathname]);
  const visibleAdminLinks: { href: string; label: string; icon: NavIconId }[] = [
    ...(canSeeUserDirectory ? [{ href: "/admin/users", label: "Пользователи", icon: "users" as const }] : []),
    ...(canManageResults(session) || canResetTestResults(session)
      ? [{ href: "/admin/results", label: "Результаты", icon: "chart" as const }]
      : []),
    ...(canManageTests(session)
      ? [{ href: "/admin/tests", label: "Тесты", icon: "clipboard" as const }]
      : []),
    ...(canManageNews(session) ? [{ href: "/admin/news", label: "Новости", icon: "news" as const }] : []),
    ...(canManageCounteraction(session)
      ? [{ href: "/admin/counteraction", label: "Противодействие", icon: "shield" as const }]
      : []),
    ...(canManageUav(session) ? [{ href: "/admin/uav", label: "БПЛА", icon: "uav" as const }] : []),
    ...(canSeeGameSection ? [{ href: "/game", label: "Полигон", icon: "game" as const }] : []),
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

  const renderNavIcon = (name: NavIconId) => {
    switch (name) {
      case "users":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case "chart":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        );
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
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.8-3.8 4.5-5.5 8-5.5S18.2 16.2 20 20" />
          </svg>
        );
      case "personnel":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case "game":
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={iconStyle}>
            <rect x="3" y="8" width="18" height="10" rx="3" />
            <path d="M8 12h2" />
            <path d="M9 11v2" />
            <circle cx="16" cy="11" r="1" />
            <circle cx="18" cy="13" r="1" />
            <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
          </svg>
        );
      default:
    }
  };

  const logout = async () => {
    if (isLoggingOut) return;
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    try {
      const [{ forceFailFinalAttempt }, { logoutUser }] = await Promise.all([
        import("@/lib/tests-repository"),
        import("@/lib/users-repository"),
      ]);
      void withTimeout(forceFailFinalAttempt(session.id), 1200).catch(() => {});
      await withTimeout(logoutUser(), 1200);
    } catch {}
    window.location.assign("/login");
  };

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand">
          <div className="brand-mark">ССП</div>
          <div>
            <h1>ПВО</h1>
            {brandCallsign}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ThemeToggle />
            {notifyBellPlacement !== "mobile" ? <PersonnelNotificationsBell /> : null}
          </div>
          <button className="btn btn-danger" type="button" onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? "Выходим..." : "Выход"}
          </button>
        </div>

        <div style={{ marginTop: 20 }}>
          {navLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                prefetch={false}
                className={`desktop-nav-link ${active ? "active" : ""}`}
                key={link.href}
                href={link.href}
              >
                <span className="desktop-nav-link__icon">{renderNavIcon(link.icon)}</span>
                <span>{link.label}</span>
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
                <Link
                  prefetch={false}
                  className={`desktop-nav-link ${active ? "active" : ""}`}
                  key={link.href}
                  href={link.href}
                >
                  <span className="desktop-nav-link__icon">{renderNavIcon(link.icon)}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      <main>
        <header className="mobile-header" id="mobile-app-header">
          <div className="brand">
            <Link prefetch={false} href="/dashboard" style={{ display: "contents" }}>
              <div className="brand-mark">ССП</div>
            </Link>
            <div>
              <h1>ПВО</h1>
              {brandCallsign}
            </div>
          </div>
          <div className="header-actions">
            {notifyBellPlacement !== "desktop" ? <PersonnelNotificationsBell compact /> : null}
            {hasAdminAccess && (
              <Link prefetch={false} className="btn mobile-header-icon-btn" href="/admin" aria-label="Управление">
                <AdminPanelIcon />
              </Link>
            )}
            <ThemeToggle showLabels={false} preferSvgIcon />
            <button
              className="btn btn-danger mobile-header-icon-btn"
              type="button"
              onClick={logout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              aria-label="Выход"
            >
              <LogoutIcon />
            </button>
          </div>
        </header>

        {!isOnline && (
          <div className="offline-banner" role="status">
            Нет соединения с сетью. Данные не обновятся, навигация может открывать сохранённую копию страницы. Проверьте
            Wi‑Fi или мобильный интернет и обновите вкладку.
          </div>
        )}

        {achievementNotifications.length > 0 && pathname !== "/profile" ? (
          <AchievementUnlockBanner
            notifications={achievementNotifications}
            onDismiss={(ids) => {
              void fetch("/api/profile/achievements", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissNotificationIds: ids }),
              }).then(() => setAchievementNotifications([]));
            }}
          />
        ) : null}

        <div className="screen">{children}</div>
        <footer className="app-site-footer" aria-label="Информация о платформе">
          {pathname === "/dashboard" ? <HomeStatsBar /> : null}
          <p className="app-site-footer__line">Закрытая обучающая платформа</p>
          <p className="app-site-footer__line">© 2026 ССП ПВО · Developed by Simba</p>
        </footer>
      </main>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <div className="bottom-nav__track" ref={bottomNavTrackRef}>
          <span
            className="bottom-nav__slider"
            aria-hidden
            style={{
              width: bottomNavSlider.width ? `${bottomNavSlider.width}px` : 0,
              transform: `translateX(${bottomNavSlider.x}px)`,
              opacity: bottomNavSlider.width ? 1 : 0,
            }}
          />
          {bottomLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                prefetch={false}
                key={link.href}
                href={link.href}
                className={active ? "active" : ""}
                aria-label={link.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="bottom-nav-icon" aria-hidden="true">
                  {renderNavIcon(link.icon)}
                </span>
                <span className="bottom-nav-label">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
