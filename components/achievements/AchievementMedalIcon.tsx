import type { TenureMedalMaterial } from "@/lib/achievements-catalog";

type AchievementMedalIconProps = {
  material: TenureMedalMaterial;
  size?: number;
  className?: string;
};

const MEDAL_STYLES: Record<
  TenureMedalMaterial,
  { rim: string; face: string; shine: string; ribbon: string }
> = {
  wood: { rim: "#6b4f2a", face: "#a67c52", shine: "#c9a66b", ribbon: "#8b5e34" },
  stone: { rim: "#64748b", face: "#94a3b8", shine: "#cbd5e1", ribbon: "#475569" },
  bronze: { rim: "#92400e", face: "#d97706", shine: "#fbbf24", ribbon: "#b45309" },
  silver: { rim: "#64748b", face: "#cbd5e1", shine: "#f8fafc", ribbon: "#475569" },
  gold: { rim: "#a16207", face: "#facc15", shine: "#fef08a", ribbon: "#ca8a04" },
  platinum: { rim: "#475569", face: "#e2e8f0", shine: "#ffffff", ribbon: "#334155" },
  diamond: { rim: "#0891b2", face: "#67e8f9", shine: "#ecfeff", ribbon: "#0e7490" },
};

export function AchievementMedalIcon({ material, size = 28, className = "" }: AchievementMedalIconProps) {
  const palette = MEDAL_STYLES[material];
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`achievement-medal-icon achievement-medal-icon--${material} ${className}`.trim()}
      aria-hidden
    >
      <path d="M11 4 8 12 16 14 24 12 21 4Z" fill={palette.ribbon} />
      <circle cx="16" cy="20" r="9" fill={palette.rim} />
      <circle cx="16" cy="20" r="7" fill={palette.face} />
      <path d="M12 17c2-2 6-2 8 0" stroke={palette.shine} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M13 22h6" stroke={palette.shine} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
