"use client";

import { useMemo, useState } from "react";
import {
  FINAL_ACHIEVEMENTS,
  TENURE_ACHIEVEMENTS,
  getAchievementDefinition,
  type TenureMedalMaterial,
} from "@/lib/achievements-catalog";
import { AchievementMedalIcon } from "@/components/achievements/AchievementMedalIcon";

type AchievementMedalsRowProps = {
  unlockedIds: string[];
};

export function AchievementMedalsRow({ unlockedIds }: AchievementMedalsRowProps) {
  const [activeTip, setActiveTip] = useState<string | null>(null);
  const medals = useMemo(() => {
    return TENURE_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id)).map((item) => ({
      id: item.id,
      material: item.tenureMedal as TenureMedalMaterial,
      title: item.title,
      tierLabel: item.tierLabel,
      description: item.description,
    }));
  }, [unlockedIds]);

  if (!medals.length) {
    return (
      <div className="achievement-medals-row achievement-medals-row--empty">
        <p className="label">Медали за выслугу</p>
        <p className="page-subtitle achievement-medals-row__empty">Пока нет медалей</p>
      </div>
    );
  }

  return (
    <div className="achievement-medals-row">
      <p className="label">Медали за выслугу</p>
      <div className="achievement-medals-row__list">
        {medals.map((medal) => (
          <button
            key={medal.id}
            type="button"
            className={`achievement-medals-row__item${activeTip === medal.id ? " is-active" : ""}`}
            onMouseEnter={() => setActiveTip(medal.id)}
            onMouseLeave={() => setActiveTip((prev) => (prev === medal.id ? null : prev))}
            onClick={() => setActiveTip((prev) => (prev === medal.id ? null : medal.id))}
            aria-label={`${medal.title}. ${medal.tierLabel}. ${medal.description}`}
          >
            <AchievementMedalIcon material={medal.material} size={30} />
            <span className="achievement-medals-row__tip" role="tooltip">
              <strong>{medal.title}</strong>
              <span>{medal.tierLabel}</span>
              <span>{medal.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AchievementFinalSummary({ unlockedIds }: { unlockedIds: string[] }) {
  const finals = FINAL_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id));
  if (!finals.length) return null;
  const best = finals[finals.length - 1];
  return (
    <p className="achievement-summary-line">
      Итоговые тесты: открыто цветов — <strong>{finals.length}</strong>
      {best ? ` · лучшее: ${best.title}` : null}
    </p>
  );
}

export function getAchievementTooltip(id: string) {
  const def = getAchievementDefinition(id);
  if (!def) return null;
  return { title: def.title, tierLabel: def.tierLabel, description: def.description };
}
