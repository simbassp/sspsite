import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconActivity,
  IconCar,
  IconTestFinal,
  IconTestTrial,
  IconUavHit,
} from "@/components/personnel/PersonnelIcons";
import {
  computePersonnelActivityScore,
  PERSONNEL_ACTIVITY_SCORE_NOTE,
  PERSONNEL_ACTIVITY_SCORE_PARTS,
  type PersonnelRosterTopUser,
  type PersonnelRosterTops,
} from "@/lib/personnel-catalog";

type TopCardTone = "red" | "blue" | "green" | "amber" | "purple";

type TopCardConfig<T extends PersonnelRosterTopUser> = {
  key: string;
  title: string;
  subtitle: string;
  tone: TopCardTone;
  icon: ReactNode;
  list: T[];
  formatValue: (user: T) => string;
  footnote?: ReactNode;
};

function buildTopCards<T extends PersonnelRosterTopUser>(
  tops: PersonnelRosterTops<T>,
  formatHits: (user: T) => string,
): TopCardConfig<T>[] {
  return [
    {
      key: "hits",
      title: "Топ по сбитиям",
      subtitle: "Всего сбитий БПЛА",
      tone: "red",
      icon: <IconUavHit size={18} />,
      list: tops.hits,
      formatValue: formatHits,
    },
    {
      key: "trial",
      title: "Топ по пробным тестам",
      subtitle: "Сданные попытки",
      tone: "blue",
      icon: <IconTestTrial size={18} />,
      list: tops.trialTests,
      formatValue: (user) => `${user.testStats.trialPassed} сдано`,
    },
    {
      key: "final",
      title: "Топ по итоговым тестам",
      subtitle: "Сданные попытки",
      tone: "green",
      icon: <IconTestFinal size={18} />,
      list: tops.finalTests,
      formatValue: (user) => `${user.testStats.finalPassed} сдано`,
    },
    {
      key: "deployments",
      title: "Топ по командировкам",
      subtitle: "Количество поездок",
      tone: "amber",
      icon: <IconCar size={18} />,
      list: tops.deployments,
      formatValue: (user) => `${user.deploymentsCount} шт.`,
    },
    {
      key: "activity",
      title: "Самые активные",
      subtitle: "Сумма всех показателей",
      tone: "purple",
      icon: <IconActivity size={18} />,
      list: tops.activity,
      formatValue: (user) => `${computePersonnelActivityScore(user)} очк.`,
      footnote: (
        <>
          <strong>Как считаются очки:</strong> {PERSONNEL_ACTIVITY_SCORE_PARTS.join(" + ")}.{" "}
          {PERSONNEL_ACTIVITY_SCORE_NOTE}
        </>
      ),
    },
  ];
}

export function PersonnelTopGrid<T extends PersonnelRosterTopUser>({
  tops,
  profilePath,
}: {
  tops: PersonnelRosterTops<T>;
  profilePath: (userId: string) => string;
}) {
  const cards = buildTopCards(tops, (user) => String(user.uavHitsTotal));

  return (
    <div className="personnel-top-section">
      <p className="personnel-top-intro">
        Рейтинг по ключевым показателям роты. В карточке «Самые активные» очки — это сумма сбитий,
        командировок, медалей, сданных тестов и зачётов (по 1 очку за каждый пункт).
      </p>

      <div className="personnel-top-grid">
        {cards.map((card) => (
          <article
            key={card.key}
            className={`card personnel-top-card personnel-top-card--${card.tone}${card.key === "activity" ? " personnel-top-card--wide" : ""}`}
          >
            <div className="card-body">
              <header className="personnel-top-card__head">
                <span className={`personnel-top-card__icon personnel-top-card__icon--${card.tone}`}>{card.icon}</span>
                <div>
                  <h3 className="personnel-top-card__title">{card.title}</h3>
                  <p className="personnel-top-card__subtitle">{card.subtitle}</p>
                </div>
              </header>

              <ol className="personnel-top-list">
                {card.list.map((user, idx) => (
                  <li key={user.id} className={`personnel-top-list__item${idx === 0 ? " is-leader" : ""}`}>
                    <span className={`personnel-top-list__rank${idx < 3 ? ` is-${idx + 1}` : ""}`}>{idx + 1}</span>
                    <Link href={profilePath(user.id)} className="personnel-top-list__name">
                      {user.name}
                    </Link>
                    <span className="personnel-top-list__value">{card.formatValue(user)}</span>
                  </li>
                ))}
              </ol>

              {card.footnote ? <p className="personnel-top-card__note">{card.footnote}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
