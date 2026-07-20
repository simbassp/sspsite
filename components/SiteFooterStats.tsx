"use client";

import { Fragment, useMemo } from "react";
import { formatSiteDuration } from "@/lib/site-analytics";
import { OnlineUsersInline } from "@/components/profile/UserIdentityText";
import { useHomeStats } from "@/hooks/useHomeStats";

export function SiteFooterStats() {
  const { loading, usersSummary, siteAnalytics } = useHomeStats();

  const content = useMemo(() => {
    if (loading && !usersSummary && !siteAnalytics) return <>Загрузка статистики…</>;

    const parts: React.ReactNode[] = [];
    if (siteAnalytics) {
      parts.push(`Посещений всего: ${siteAnalytics.totalVisits.toLocaleString("ru-RU")}`);
      parts.push(`Общее время всех пользователей: ${formatSiteDuration(siteAnalytics.totalActiveSeconds)}`);
    }
    if (usersSummary) {
      parts.push(`Пользователей: ${usersSummary.totalUsers.toLocaleString("ru-RU")}`);
      const online = usersSummary.onlineUsers;
      if (!online.length) {
        parts.push("Онлайн: 0");
      } else {
        const shown = online.slice(0, 8);
        const extra = online.length > 8 ? ` +${online.length - 8}` : "";
        parts.push(
          <span key="online">
            {`Онлайн: ${online.length} — `}
            <OnlineUsersInline users={shown} />
            {extra}
          </span>,
        );
      }
    }

    return parts.reduce<React.ReactNode[]>((acc, part, index) => {
      if (index === 0) return [part];
      return [...acc, <Fragment key={`sep-${index}`}> · </Fragment>, part];
    }, []);
  }, [loading, siteAnalytics, usersSummary]);

  return <p className="app-site-footer__stats">{content}</p>;
}
