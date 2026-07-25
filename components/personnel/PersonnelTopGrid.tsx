import Link from "next/link";
import type { ReactNode } from "react";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import { UserAvatar } from "@/components/profile/UserAvatar";
import type { UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";
import { IconTestFinal, IconTestTrial } from "@/components/personnel/PersonnelIcons";
import type { PersonnelRosterTopUser, PersonnelRosterTops } from "@/lib/personnel-catalog";

type TopCardTone = "blue" | "green";

type TopCardConfig<T extends PersonnelRosterTopUser> = {
  key: string;
  title: string;
  subtitle: string;
  tone: TopCardTone;
  icon: ReactNode;
  list: T[];
  formatValue: (user: T) => string;
};

function buildTopCards<T extends PersonnelRosterTopUser>(tops: PersonnelRosterTops<T>): TopCardConfig<T>[] {
  return [
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
  ];
}

export function PersonnelTopGrid<T extends PersonnelRosterTopUser>({
  tops,
  profilePath,
}: {
  tops: PersonnelRosterTops<T>;
  profilePath: (userId: string) => string;
}) {
  const cards = buildTopCards(tops);

  return (
    <div className="personnel-top-section">
      <p className="personnel-top-intro">Рейтинг по результатам пробных и итоговых тестов.</p>

      <div className="personnel-top-grid">
        {cards.map((card) => (
          <article
            key={card.key}
            className={`card personnel-top-card personnel-top-card--${card.tone}`}
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
                    <Link href={profilePath(user.id)} className="personnel-top-list__person">
                      <UserAvatar
                        name={user.name}
                        callsign={user.callsign}
                        avatarUrl={user.avatarUrl ?? null}
                        size={30}
                        className="personnel-top-list__avatar"
                        avatarFrame={user.cosmetics?.avatarFrame ?? null}
                        bankOverlay={user.cosmetics?.bankOverlay ?? null}
                        topRankBadge={user.cosmetics?.topRankBadge ?? null}
                      />
                      <UserIdentityDisplay
                        as="div"
                        className="personnel-top-list__person-identity"
                        name={user.name}
                        callsign={user.callsign.trim() ? user.callsign.trim() : undefined}
                        cosmetics={
                          user.cosmetics ??
                          (user.nameColor ? { adminNameColor: user.nameColor } : null)
                        }
                        nameClassName="personnel-top-list__name"
                        callsignClassName="personnel-top-list__callsign"
                        separator=""
                      />
                    </Link>
                    <span className="personnel-top-list__value">{card.formatValue(user)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
