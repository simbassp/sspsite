"use client";

import { IconMedal, IconMedalSvoContribution } from "@/components/personnel/PersonnelIcons";
import {
  getMedalDisplayTitle,
  getMedalShortTitle,
  isSvoContributionMedal,
} from "@/lib/personnel-catalog";

export function PersonnelMedalBadge({
  medalType,
  title,
  awardedAt,
  size = 44,
  showFullTitle = false,
}: {
  medalType?: string;
  title: string;
  awardedAt?: string;
  size?: number;
  showFullTitle?: boolean;
}) {
  const displayTitle = getMedalDisplayTitle(medalType, title);
  const label = showFullTitle ? displayTitle : getMedalShortTitle(medalType, title);
  const isSvo = isSvoContributionMedal(medalType, title);

  return (
    <figure className="personnel-medal-badge" title={awardedAt ? `${displayTitle} · ${awardedAt}` : displayTitle}>
      {isSvo ? <IconMedalSvoContribution size={size} /> : <IconMedal size={Math.round(size * 0.55)} />}
      <figcaption className="personnel-medal-badge__label">{label}</figcaption>
    </figure>
  );
}
