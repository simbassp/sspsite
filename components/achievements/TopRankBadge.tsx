"use client";

import type { TopRankBadgeId } from "@/lib/achievements-catalog";

type TopRankBadgeProps = {
  rank: TopRankBadgeId;
  size?: number;
  className?: string;
};

const LABELS: Record<TopRankBadgeId, string> = {
  "top-1": "1",
  "top-2": "2",
  "top-3": "3",
};

export function TopRankBadge({ rank, size = 18, className = "" }: TopRankBadgeProps) {
  return (
    <span className={`top-rank-badge top-rank-badge--${rank} ${className}`.trim()} style={{ width: size, height: size }}>
      {LABELS[rank]}
    </span>
  );
}
