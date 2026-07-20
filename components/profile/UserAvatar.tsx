"use client";

import { resolveAvatarDisplayUrl, getAvatarInitials } from "@/lib/avatar-display";
import { trialAvatarFrameClass, type BankAvatarOverlayId, type TopRankBadgeId, type TrialAvatarFrameId } from "@/lib/achievements-catalog";
import { AvatarBankOverlay } from "@/components/achievements/AvatarBankOverlay";
import { TopRankBadge } from "@/components/achievements/TopRankBadge";

type UserAvatarProps = {
  name?: string | null;
  callsign?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  title?: string;
  avatarFrame?: TrialAvatarFrameId | null;
  bankOverlay?: BankAvatarOverlayId | null;
  topRankBadge?: TopRankBadgeId | null;
};

export function UserAvatar({
  name = "",
  callsign = "",
  avatarUrl = null,
  size = 64,
  className = "",
  title,
  avatarFrame = null,
  bankOverlay = null,
  topRankBadge = null,
}: UserAvatarProps) {
  const src = resolveAvatarDisplayUrl(avatarUrl);
  const initials = getAvatarInitials(name || "", callsign || "");
  const label = title || [name, callsign].filter(Boolean).join(" ").trim() || "Профиль";
  const frameClass = trialAvatarFrameClass(avatarFrame);

  const avatarNode = src ? (
    <img
      src={src}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={`user-avatar user-avatar--photo ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`user-avatar user-avatar--initials ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {initials}
    </span>
  );

  return (
    <span
      className={`user-avatar-wrap ${frameClass}`.trim()}
      style={{ width: size, height: size, ["--avatar-size" as string]: `${size}px` }}
    >
      {avatarNode}
      {bankOverlay ? <AvatarBankOverlay overlay={bankOverlay} size={size} /> : null}
      {topRankBadge ? <TopRankBadge rank={topRankBadge} className="user-avatar-wrap__top-badge" /> : null}
    </span>
  );
}
