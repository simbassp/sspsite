"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  GAME_DAILY_TOURNAMENT,
  GAME_MODES,
  GAME_RECENT_ACHIEVEMENTS,
  GAME_SEASON_LEADERBOARD,
  GAME_TRAINING_PICKS,
  formatCountdown,
  getDailyTournamentTargetMs,
  type GameModeId,
} from "@/lib/game-preview-data";
import { gameAccuracy, loadGameStats, type GameStoredStats } from "@/lib/game-stats";

function ModeIcon({ id }: { id: GameModeId }) {
  switch (id) {
    case "duel":
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <path d="M8 3 4 7v10l4 4" />
          <path d="M16 3l4 4v10l-4 4" />
          <path d="m12 8 4 4-4 4-4-4z" />
        </svg>
      );
    case "team":
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M3 20c1.2-2.5 2.8-3.8 5-3.8S12.8 17.5 14 20" />
          <path d="M10 20c1.2-2.5 2.8-3.8 5-3.8s3.8 1.3 5 3.8" />
        </svg>
      );
    case "blitz":
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <path d="M13 2 3 14h8l-1 8 10-12h-8z" />
        </svg>
      );
    case "survival":
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6l8-3z" />
        </svg>
      );
    case "ladder":
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <path d="M4 20h16" />
          <path d="M8 20V10" />
          <path d="M12 20V6" />
          <path d="M16 20v-8" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="game-mode-card__icon-svg" aria-hidden>
          <path d="M8 21h8" />
          <path d="M12 17V7" />
          <path d="M7 7h10l-1-3H8z" />
          <path d="M17 7a5 5 0 0 1-5 5 5 5 0 0 1-5-5" />
        </svg>
      );
  }
}

function AchievementIcon({ type }: { type: "fire" | "bolt" | "star" }) {
  if (type === "bolt") {
    return (
      <svg viewBox="0 0 24 24" className="game-achievement__icon" aria-hidden>
        <path d="M13 2 3 14h8l-1 8 10-12h-8z" />
      </svg>
    );
  }
  if (type === "star") {
    return (
      <svg viewBox="0 0 24 24" className="game-achievement__icon" aria-hidden>
        <path d="M12 2.5 14.6 9H22l-6 4.5 2.3 7L12 17.8 5.7 20.5 8 13.5 2 9h7.4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="game-achievement__icon" aria-hidden>
      <path d="M8.5 14.5A4.5 4.5 0 1 0 12 6" />
      <path d="M12 6c2 0 3.5 1.2 4.5 3" />
      <path d="M8 22c.5-2 2-3.5 4-3.5s3.5 1.5 4 3.5" />
    </svg>
  );
}

export function GameHubPage() {
  const router = useRouter();
  const [stats, setStats] = useState<GameStoredStats | null>(null);
  const [countdown, setCountdown] = useState("00:00:00");

  useEffect(() => {
    setStats(loadGameStats());
    const onFocus = () => setStats(loadGameStats());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const tick = () => {
      const left = getDailyTournamentTargetMs() - Date.now();
      setCountdown(formatCountdown(left));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const xpPercent = useMemo(() => {
    if (!stats) return 0;
    const xp = stats.totalCorrect * 10;
    const xpToNext = 500;
    return Math.min(100, Math.round((xp / xpToNext) * 100));
  }, [stats]);

  const onPlay = (modeId: GameModeId) => {
    router.push(`/game/${modeId}`);
  };

  return (
    <section className="game-page">
      <div className="game-page__head">
        <div>
          <p className="game-page__kicker">Preview · только администратор</p>
          <h1 className="page-title">Полигон</h1>
          <p className="page-subtitle">Игровой раздел по ТТХ и карточкам БПЛА. Все режимы playable в preview — статистика сохраняется локально в браузере.</p>
        </div>
        <div className="game-page__head-note card">
          <div className="card-body">
            <strong>Безопасный preview</strong>
            <p className="page-subtitle" style={{ margin: "6px 0 0" }}>
              Чтобы скрыть раздел, установите <code>GAME_SECTION_ENABLED = false</code> в <code>lib/game-feature.ts</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="game-page__stats card">
        <div className="card-body game-page__stats-grid">
          <div className="game-stat">
            <span className="game-stat__label">Уровень</span>
            <strong className="game-stat__value">
              {stats ? Math.max(1, Math.floor(stats.totalCorrect / 20) + 1) : 1} · Preview
            </strong>
            <div className="game-stat__bar" aria-hidden>
              <span style={{ width: `${xpPercent}%` }} />
            </div>
            <small>{stats ? stats.totalCorrect * 10 : 0} XP (локально)</small>
          </div>
          <div className="game-stat">
            <span className="game-stat__label">Лучший блиц</span>
            <strong className="game-stat__value">{stats?.bestBlitz ?? 0}</strong>
          </div>
          <div className="game-stat">
            <span className="game-stat__label">Точность</span>
            <strong className="game-stat__value">{stats ? gameAccuracy(stats) : 0}%</strong>
          </div>
          <div className="game-stat">
            <span className="game-stat__label">Выживание</span>
            <strong className="game-stat__value">{stats?.bestSurvival ?? 0}</strong>
          </div>
        </div>
      </div>

      <div className="game-page__layout">
        <div className="game-page__main">
          <div className="game-mode-grid">
            {GAME_MODES.map((mode) => (
              <article key={mode.id} className={`card game-mode-card is-${mode.tone}`}>
                <div className="card-body">
                  <div className="game-mode-card__top">
                    <span className={`game-mode-card__icon is-${mode.tone}`}>
                      <ModeIcon id={mode.id} />
                    </span>
                    <div className="game-mode-card__meta">
                      {mode.badge ? <span className="game-mode-card__badge">{mode.badge}</span> : null}
                      {mode.onlineHint ? <span className="game-mode-card__online">{mode.onlineHint}</span> : null}
                    </div>
                  </div>
                  <h3>{mode.title}</h3>
                  <p className="page-subtitle game-mode-card__desc">{mode.description}</p>
                  <button type="button" className="btn btn-primary game-mode-card__play" onClick={() => onPlay(mode.id)}>
                    Играть
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="game-page__bottom-grid">
            <article className="card game-tournament-card">
              <div className="card-body">
                <div className="game-tournament-card__head">
                  <div>
                    <p className="label">Ежедневный турнир</p>
                    <h3>{GAME_DAILY_TOURNAMENT.title}</h3>
                  </div>
                  <div className="game-tournament-card__timer" aria-live="polite">
                    {countdown}
                  </div>
                </div>
                <ul className="game-tournament-card__rewards">
                  {GAME_DAILY_TOURNAMENT.rewards.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button type="button" className="btn" onClick={() => onPlay("tournament")}>
                  Играть турнир
                </button>
              </div>
            </article>

            <article className="card game-training-card">
              <div className="card-body">
                <p className="label">Рекомендовано для тренировки</p>
                <h3>БПЛА на сегодня</h3>
                <div className="game-training-card__list">
                  {GAME_TRAINING_PICKS.map((item) => (
                    <Link key={item.id} href="/uav" prefetch={false} className="game-training-card__item">
                      <strong>{item.title}</strong>
                      <span>{item.hint}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>

        <aside className="game-page__aside">
          <article className="card game-leaderboard-card">
            <div className="card-body">
              <p className="label">Топ сезона</p>
              <h3>Рейтинг игроков</h3>
              <ol className="game-leaderboard">
                {GAME_SEASON_LEADERBOARD.map((row) => (
                  <li key={row.place} className="game-leaderboard__row">
                    <span className="game-leaderboard__place">{row.place}</span>
                    <span className="game-leaderboard__name">
                      {row.name} {row.callsign}
                    </span>
                    <span className="game-leaderboard__xp">{row.xp} XP</span>
                  </li>
                ))}
              </ol>
            </div>
          </article>

          <article className="card game-achievements-card">
            <div className="card-body">
              <p className="label">Последние достижения</p>
              <h3>Недавние награды</h3>
              <ul className="game-achievements">
                {GAME_RECENT_ACHIEVEMENTS.map((item) => (
                  <li key={item.id} className="game-achievement">
                    <span className="game-achievement__icon-wrap">
                      <AchievementIcon type={item.icon} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.user}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
